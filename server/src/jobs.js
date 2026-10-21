// Scheduled jobs. Each job takes a "now" (tests move it days ahead) and is safe to run again:
// it only acts on rows that still qualify, re-checked inside a locked transaction.
import fs from 'node:fs';
import path from 'node:path';
import { q, one, withTx, todayPH, phTimestamp } from './db.js';
import { config } from './config.js';
import { RULES } from './rules.js';
import { addCredits, audit, loadRequest, notify } from './services.js';
import { removePrivateFile } from './uploads.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// ---------- reminders: due tomorrow, due today, overdue ----------
// The borrower is reminded once per day. The owner hears once when their item becomes overdue.
export async function runReminders(now = new Date()) {
  const today = todayPH(now);
  const rows = await q(
    `SELECT r.id, r.borrower_id, r.end_date, i.title, i.owner_id, DATEDIFF(r.end_date, ?) AS days_left
       FROM requests r JOIN items i ON i.id = r.item_id
      WHERE r.status = 'handed_over' AND r.end_date <= DATE_ADD(?, INTERVAL 1 DAY)`, [today, today]);
  let sent = 0;
  for (const r of rows) {
    const type = r.days_left > 0 ? 'due_tomorrow' : r.days_left === 0 ? 'due_today' : 'overdue';
    const title = type === 'due_tomorrow' ? `Due tomorrow: ${r.title}` : type === 'due_today' ? `Due today: ${r.title}` : `Overdue: ${r.title}`;
    const exists = await one(
      'SELECT id FROM notifications WHERE user_id = ? AND type = ? AND ref_id = ? AND DATE(created_at) = ?', [r.borrower_id, type, r.id, today]);
    if (!exists) {
      await q('INSERT INTO notifications (user_id, type, title, body, ref_id) VALUES (?,?,?,?,?)',
        [r.borrower_id, type, title, `Return by ${r.end_date}. Pawsa is counting on you!`, r.id]);
      sent++;
    }
    if (type === 'overdue' && r.owner_id) {
      const told = await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'owner_overdue' AND ref_id = ?", [r.owner_id, r.id]);
      if (!told) {
        await q('INSERT INTO notifications (user_id, type, title, body, ref_id) VALUES (?,?,?,?,?)',
          [r.owner_id, 'owner_overdue', `Not back yet: ${r.title}`, `It was due on ${r.end_date}. The borrower has been reminded.`, r.id]);
        sent++;
      }
    }
  }
  return { checked: rows.length, sent };
}

// ---------- request expiry ----------
// Pending: 7 days after it was made with no answer, or once its end date has passed.
// Approved: once its end date has passed without a handover. Held credits are refunded.
export async function expireRequests(now = new Date()) {
  const today = todayPH(now);
  const cutoff = phTimestamp(new Date(now.getTime() - RULES.pendingExpiryDays * DAY));
  const qualifies = (r) => (r.status === 'pending' && (r.created_at <= cutoff || r.end_date < today))
    || (r.status === 'approved' && r.end_date < today);
  const rows = await q(
    `SELECT id FROM requests
      WHERE (status = 'pending' AND (created_at <= ? OR end_date < ?)) OR (status = 'approved' AND end_date < ?)`,
    [cutoff, today, today]);
  let expired = 0;
  for (const { id } of rows) {
    const done = await withTx(async (conn) => {
      const r = await loadRequest(conn, id);
      if (!qualifies(r)) return false;          // someone acted on it in the meantime
      const why = r.status === 'pending'
        ? `No answer within ${RULES.pendingExpiryDays} days.`
        : `It was not picked up by ${r.end_date}.`;
      await conn.query("UPDATE requests SET status = 'expired', credits_held = 0 WHERE id = ?", [r.id]);
      if (r.credits_held) await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_expired', r.id);
      await notify(conn, r.borrower_id, 'request_expired', `Request expired: ${r.item_title}`,
        `${why}${r.credits_held ? ' Your credit was returned.' : ''}`, r.id);
      if (r.owner_id) await notify(conn, r.owner_id, 'request_expired', `Request expired: ${r.item_title}`, why, r.id);
      return true;
    });
    if (done) expired++;
  }
  return { checked: rows.length, expired };
}

// ---------- ID photo retention ----------
// ID photos are deleted 7 days after staff approve or reject them. The account keeps its status.
export async function deleteOldIdPhotos(now = new Date()) {
  const cutoff = phTimestamp(new Date(now.getTime() - RULES.idPhotoRetentionDays * DAY));
  const rows = await q(
    `SELECT id, id_photo_path FROM users
      WHERE id_photo_path IS NOT NULL AND verification_status IN ('approved','rejected')
        AND verification_decided_at IS NOT NULL AND verification_decided_at <= ?`, [cutoff]);
  for (const u of rows) {
    removePrivateFile(u.id_photo_path);
    await q('UPDATE users SET id_photo_path = NULL WHERE id = ? AND id_photo_path = ?', [u.id, u.id_photo_path]);
    await audit(null, 'id_photo_deleted', `user #${u.id} (${RULES.idPhotoRetentionDays} days after the decision)`);
  }
  return { deleted: rows.length };
}

// ---------- unused uploads ----------
// Photos that were uploaded but never attached to anything are deleted after a day.
const OUR_FILE = /^[a-f0-9]{24}\.(jpg|png|webp|upload)$/;
export async function cleanupUploads(now = new Date()) {
  const used = new Set();
  const refs = await q(
    `SELECT photo_url AS p FROM items WHERE photo_url IS NOT NULL
     UNION SELECT handover_photo FROM requests WHERE handover_photo IS NOT NULL
     UNION SELECT return_photo FROM requests WHERE return_photo IS NOT NULL
     UNION SELECT id_photo_path FROM users WHERE id_photo_path IS NOT NULL`);
  for (const r of refs) used.add(path.basename(r.p));
  const grace = RULES.unusedUploadGraceHours * 60 * MINUTE;
  let removed = 0;
  for (const sub of ['public', 'private']) {
    const dir = path.join(config.uploadDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!OUR_FILE.test(name) || used.has(name)) continue;
      const file = path.join(dir, name);
      if (now.getTime() - fs.statSync(file).mtimeMs < grace) continue;
      fs.rmSync(file, { force: true });
      removed++;
    }
  }
  return { removed };
}

// ---------- the runner ----------
export const JOBS = [
  { name: 'reminders', everyMs: 60 * MINUTE, run: runReminders },
  { name: 'expire_requests', everyMs: 60 * MINUTE, run: expireRequests },
  { name: 'delete_old_id_photos', everyMs: 60 * MINUTE, run: deleteOldIdPhotos },
  { name: 'cleanup_uploads', everyMs: DAY, run: cleanupUploads },
];

// Runs every job whose interval has passed since its last run, and records the result in job_runs.
// One failing job is logged and recorded; the others still run.
export async function runDueJobs(now = new Date(), { jobs = JOBS, force = false } = {}) {
  const results = {};
  for (const job of jobs) {
    const last = await one('SELECT last_run_at FROM job_runs WHERE name = ?', [job.name]);
    const lastMs = last?.last_run_at ? Date.parse(`${last.last_run_at.replace(' ', 'T')}+08:00`) : 0;
    if (!force && lastMs && now.getTime() - lastMs < job.everyMs) {
      results[job.name] = 'skipped';
      continue;
    }
    const at = phTimestamp(now);
    try {
      const result = await job.run(now);
      await q(
        `INSERT INTO job_runs (name, last_run_at, last_ok_at, last_result, last_error) VALUES (?,?,?,?,NULL)
         ON DUPLICATE KEY UPDATE last_run_at = VALUES(last_run_at), last_ok_at = VALUES(last_ok_at),
                                 last_result = VALUES(last_result), last_error = NULL`,
        [job.name, at, at, JSON.stringify(result ?? null).slice(0, 255)]);
      results[job.name] = result;
    } catch (e) {
      console.error(`[hiraman] job ${job.name} failed:`, e.message);
      await q(
        `INSERT INTO job_runs (name, last_run_at, last_error) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE last_run_at = VALUES(last_run_at), last_error = VALUES(last_error)`,
        [job.name, at, String(e.message).slice(0, 255)]);
      results[job.name] = { error: e.message };
    }
  }
  return results;
}

// Checks every 10 minutes which jobs are due. Each job keeps its own interval.
export function startScheduler() {
  const tick = () => runDueJobs().catch((e) => console.error('[hiraman] scheduled jobs failed:', e.message));
  setTimeout(tick, 5000);
  return setInterval(tick, 10 * MINUTE);
}
