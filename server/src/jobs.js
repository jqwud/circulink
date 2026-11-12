// Scheduled jobs. Each job takes a "now" (tests move it days ahead) and is safe to run again.
// More jobs (expiring drop-off codes, flag checks) are added with the features that need them.
import fs from 'node:fs';
import path from 'node:path';
import { q, one, phTimestamp } from './db.js';
import { config } from './config.js';
import { RULES } from './rules.js';
import { safeErrorLine, safeMessage } from './errors.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// ---------- unused uploads ----------
// Photos that were uploaded but never attached to an item are deleted after the grace period.
const OUR_FILE = /^[a-f0-9]{24}\.(jpg|png|webp|upload)$/;
export async function cleanupUploads(now = new Date()) {
  const refs = await q('SELECT photo_url AS p FROM items WHERE photo_url IS NOT NULL');
  const used = new Set(refs.map((r) => path.basename(r.p)));
  const grace = RULES.unusedUploadGraceHours * 60 * MINUTE;
  let removed = 0;
  const dir = path.join(config.uploadDir, 'public');
  if (fs.existsSync(dir)) {
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

// ---------- old notifications ----------
// Read notifications are deleted after RULES.notificationsKeptDays. Unread ones stay.
export async function deleteOldNotifications(now = new Date()) {
  const cutoff = phTimestamp(new Date(now.getTime() - RULES.notificationsKeptDays * DAY));
  const r = await q('DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?', [cutoff]);
  return { removed: r.affectedRows };
}

// ---------- the runner ----------
export const JOBS = [
  { name: 'cleanup_uploads', everyMs: DAY, run: cleanupUploads },
  { name: 'delete_old_notifications', everyMs: DAY, run: deleteOldNotifications },
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
      console.error(safeErrorLine(e, `job:${job.name}`));
      await q(
        `INSERT INTO job_runs (name, last_run_at, last_error) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE last_run_at = VALUES(last_run_at), last_error = VALUES(last_error)`,
        [job.name, at, safeMessage(e).slice(0, 255)]);
      results[job.name] = { error: safeMessage(e) };
    }
  }
  return results;
}

// Checks every 10 minutes which jobs are due. Each job keeps its own interval.
export function startScheduler() {
  const tick = () => runDueJobs().catch((e) => console.error(safeErrorLine(e, 'jobs')));
  setTimeout(tick, 5000);
  return setInterval(tick, 10 * MINUTE);
}
