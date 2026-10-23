// LGU web portal API. Every route here needs a logged-in LGU staff or admin account.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { pool, q, one, withTx, todayPH, likeText, purokNames, pageOf } from '../db.js';
import { config } from '../config.js';
import { bad, forbidden, notFound, wrap } from '../errors.js';
import { temporaryPassword } from './auth.js';
import { authRequired, requireStaff, requireAdmin, publicUser } from '../auth.js';
import {
  OUT_LOANS_SQL, addDays, approveResident, audit, checkinState, deleteAccountTx, hideItem, notify, rejectResident, removeItemTx, settleDisputeTx,
  showItem, staffCancelRequest,
} from '../services.js';
import { removePrivateFile } from '../uploads.js';
import { listRuleSettings, saveRuleSettings } from '../settings.js';
import crypto from 'node:crypto';
import { runReminders } from '../jobs.js';
import { RULES, DISPUTE_OUTCOMES, PROHIBITED, AVG_WEIGHT_KG, URGENT_REASONS, UNKIND_WORDS } from '../rules.js';
import { staffWords } from '../kindwords.js';
import { staffChoose, acceptShelf } from '../donations.js';
import { runTiwala, TIWALA } from '../tiwala.js';
import { issueVouchers, releaseVoucher, cancelVoucher, addStock, lookupCode, handOut, monthReport } from '../rewards.js';
import { SELECT_ITEM_SQL, mapItem, readItemBody } from './items.js';
import { SELECT_REQUEST, mapRequest } from './requests.js';
import { impactNumbers } from './community.js';

const router = Router();
router.use('/admin', authRequired, requireStaff);

const like = likeText;

// ---------- dashboard ----------
router.get('/admin/stats', wrap(async (_req, res) => {
  const today = todayPH();
  const n = async (sql, params = []) => (await one(sql, params)).n;
  const impact = await impactNumbers();
  res.json({
    verified_users: await n("SELECT COUNT(*) n FROM users WHERE role='resident' AND verification_status='approved'"),
    pending_verifications: await n("SELECT COUNT(*) n FROM users WHERE verification_status='pending'"),
    active_listings: await n("SELECT COUNT(*) n FROM items WHERE status='available' AND review_status='ok'"),
    flagged_listings: await n("SELECT COUNT(*) n FROM items WHERE status<>'removed' AND review_status='flagged'"),
    shelf_items: await n("SELECT COUNT(*) n FROM items WHERE is_shelf=1 AND status<>'removed'"),
    loans_this_week: await n('SELECT COUNT(*) n FROM requests WHERE created_at >= (NOW() - INTERVAL 7 DAY)'),
    active_loans: await n("SELECT COUNT(*) n FROM requests WHERE status='handed_over'"),
    overdue: await n("SELECT COUNT(*) n FROM requests WHERE status='handed_over' AND borrower_returned_at IS NULL AND end_date < ?", [today]),
    missed_checkins: (await q(OUT_LOANS_SQL)).filter((r) => checkinState(r, today).missed_days >= RULES.checkinAlertAfterMissedDays).length,
    staff_requests_waiting: await n("SELECT COUNT(*) n FROM requests WHERE status='pending' AND handled_by_staff=1"),
    open_reports: await n("SELECT COUNT(*) n FROM reports WHERE status <> 'resolved'"),
    deletion_requests: await n('SELECT COUNT(*) n FROM users WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL'),
    urgent_reports: await n("SELECT COUNT(*) n FROM reports WHERE status <> 'resolved' AND reason IN (?)", [URGENT_REASONS]),
    unkind_refusals_7d: await n("SELECT COUNT(*) n FROM audit_log WHERE action = 'unkind_words_refused' AND created_at >= NOW() - INTERVAL 7 DAY"),
    messaging_paused: await n("SELECT COUNT(*) n FROM users WHERE messaging_paused = 1 AND deleted_at IS NULL"),
    donations_to_handle: await n("SELECT COUNT(*) n FROM items WHERE listing_type = 'donate' AND status <> 'removed' AND (donation_status = 'to_shelf' OR (claim_mode = 'barangay' AND donation_status = 'open'))"),
    barangay_service_rating: await one('SELECT ROUND(AVG(stars), 1) AS average, COUNT(*) AS count FROM ratings WHERE ratee_id IS NULL')
      .then((r) => ({ average: r.average === null ? null : Number(r.average), count: Number(r.count) })),
    completed_loans: impact.completed_loans,
    return_rate: impact.return_rate,
    purchases_avoided: impact.purchases_avoided,
  });
}));

// ---------- verification and users ----------
router.get('/admin/users', wrap(async (req, res) => {
  const where = ["u.role = 'resident'", 'u.deleted_at IS NULL'];
  const params = [];
  if (req.query.status) { where.push('u.verification_status = ?'); params.push(req.query.status); }
  if (req.query.deletion === '1') where.push('u.deletion_requested_at IS NOT NULL');
  if (req.query.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); params.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
  const rows = await q(
    `SELECT u.id, u.name, u.email, u.phone, u.purok, u.verification_status, u.reject_reason, u.credits, u.suspended, u.messaging_paused, u.shelf_paused_until, u.created_at, u.deletion_requested_at,
            (u.id_photo_path IS NOT NULL) AS has_id_photo,
            (SELECT COUNT(*) FROM items i WHERE i.owner_id = u.id AND i.status <> 'removed') AS items,
            (SELECT COUNT(*) FROM requests r WHERE r.borrower_id = u.id AND r.status = 'closed') AS loans
       FROM users u WHERE ${where.join(' AND ')}
      ORDER BY FIELD(u.verification_status,'pending','unverified','approved','rejected'), u.created_at DESC, u.id DESC ${pageOf(req.query, config.pages.staffDefault, config.pages.staffMax)}`, params);
  res.json(rows.map((u) => ({ ...u, has_id_photo: !!u.has_id_photo, suspended: !!u.suspended, messaging_paused: !!u.messaging_paused })));
}));

router.get('/admin/users/:id', wrap(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const history = await q(`${SELECT_REQUEST} WHERE r.borrower_id = ? OR i.owner_id = ? ORDER BY r.id DESC LIMIT 50`, [u.id, u.id]);
  const ledger = await q('SELECT amount, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30', [u.id]);
  res.json({ user: { ...publicUser(u), suspended: !!u.suspended, messaging_paused: !!u.messaging_paused, shelf_paused_until: u.shelf_paused_until, priority_household: !!u.priority_household, created_at: u.created_at }, history: history.map((r) => mapRequest(r, u.id)), ledger });
}));

// ID photos are private: only staff, only through this authenticated route.
router.get('/admin/users/:id/id-photo', wrap(async (req, res) => {
  const u = await one('SELECT id_photo_path FROM users WHERE id = ?', [req.params.id]);
  if (!u?.id_photo_path) throw notFound('No ID photo.');
  const file = path.join(config.uploadDir, 'private', path.basename(u.id_photo_path));
  if (!fs.existsSync(file)) throw notFound('No ID photo.');
  await audit(req.user.id, 'viewed_id_photo', `user #${req.params.id}`);
  res.sendFile(file);
}));

router.post('/admin/users/:id/approve', wrap(async (req, res) => res.json(await approveResident(Number(req.params.id), req.user))));
router.post('/admin/users/:id/reject', wrap(async (req, res) => res.json(await rejectResident(Number(req.params.id), req.user, req.body?.reason))));

for (const [action, value, logged] of [['suspend', 1, 'user_suspended'], ['reinstate', 0, 'user_reinstated']]) {
  router.post(`/admin/users/:id/${action}`, wrap(async (req, res) => {
    const u = await one('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
    if (!u) throw notFound('Resident not found.');
    await q('UPDATE users SET suspended = ? WHERE id = ?', [value, u.id]);
    await audit(req.user.id, logged, `user #${u.id} ${u.name}`);
    res.json({ id: u.id, suspended: !!value });
  }));
}

// Quick replies of a resident paused after repeated harassment concerns (or by staff); staff lift or set it.
router.post('/admin/users/:id/messaging', wrap(async (req, res) => {
  const u = await one('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const paused = !!req.body?.paused;
  await q('UPDATE users SET messaging_paused = ? WHERE id = ?', [paused ? 1 : 0, u.id]);
  await audit(req.user.id, paused ? 'messaging_paused' : 'messaging_allowed', `user #${u.id} ${u.name}`);
  res.json({ id: u.id, messaging_paused: paused });
}));

// Barangay borrowing paused after late Barangay returns; staff lift it (or set it) and it is audited.
router.post('/admin/users/:id/shelf-pause', wrap(async (req, res) => {
  const u = await one('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const until = req.body?.paused ? addDays(todayPH(), RULES.shelfPauseDays) : null;
  await q('UPDATE users SET shelf_paused_until = ? WHERE id = ?', [until, u.id]);
  await audit(req.user.id, until ? 'shelf_paused' : 'shelf_pause_lifted', `user #${u.id} ${u.name}`);
  res.json({ id: u.id, shelf_paused_until: until });
}));

// Pauses on claiming or donating (after no-shows or problem donations), and the priority-household flag
// (staff only, never shown to residents, no reason stored). All audited.
for (const [path, column, days, label] of [['claim-pause', 'claim_paused_until', 'claimPauseDays', 'claim'], ['donate-pause', 'donate_paused_until', 'donatePauseDays', 'donate']]) {
  router.post(`/admin/users/:id/${path}`, wrap(async (req, res) => {
    const u = await one('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
    if (!u) throw notFound('Resident not found.');
    const until = req.body?.paused ? addDays(todayPH(), RULES[days]) : null;
    await q(`UPDATE users SET ${column} = ? WHERE id = ?`, [until, u.id]);
    await audit(req.user.id, until ? `${label}_paused` : `${label}_pause_lifted`, `user #${u.id} ${u.name}`);
    res.json({ id: u.id, [column]: until });
  }));
}

// Simple mode switched on for a resident by staff (for example a senior at the hall). Audited.
router.post('/admin/users/:id/simple-mode', wrap(async (req, res) => {
  const u = await one('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const on = !!req.body?.on;
  await q('UPDATE users SET simple_mode = ? WHERE id = ?', [on ? 1 : 0, u.id]);
  await audit(req.user.id, on ? 'simple_mode_on' : 'simple_mode_off', `user #${u.id} ${u.name}`);
  res.json({ id: u.id, simple_mode: on });
}));

router.post('/admin/users/:id/priority', wrap(async (req, res) => {
  const u = await one('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const on = !!req.body?.priority;
  await q('UPDATE users SET priority_household = ? WHERE id = ?', [on ? 1 : 0, u.id]);
  await audit(req.user.id, on ? 'priority_set' : 'priority_cleared', `user #${u.id}`);
  res.json({ id: u.id, priority_household: on });
}));

// ---------- Tiwala score (shadow mode: staff only, no rewards yet) ----------
router.get('/admin/tiwala', wrap(async (_req, res) => {
  const rows = await q(
    `SELECT t.*, u.name, u.purok, u.tiwala_frozen_until FROM trust_scores t JOIN users u ON u.id = t.user_id
      WHERE t.period = 'live' AND u.deleted_at IS NULL ORDER BY t.score DESC, u.name`);
  const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const residents = rows.map((r) => ({
    user: { id: r.user_id, name: r.name, purok: r.purok }, score: r.score, tier: r.tier, parts: json(r.parts), signals: json(r.signals),
    needs_staff_check: !!r.needs_staff_check, counted_loans: r.counted_loans, computed_on: r.computed_on, frozen_until: r.tiwala_frozen_until,
  }));
  const tiers = { gold: 0, silver: 0, bronze: 0, starter: 0 };
  for (const r of residents) tiers[r.tier] = (tiers[r.tier] || 0) + 1;
  res.json({ shadow_mode: false, window_days: TIWALA.windowDays, tiers, residents });
}));

// Recalculate now (normally nightly), for example after checking a signal.
router.post('/admin/tiwala/run', requireAdmin, wrap(async (req, res) => {
  const out = await runTiwala();
  await audit(req.user.id, 'tiwala_recalculated', `${out.residents} residents`);
  res.json(out);
}));

// Staff confirmed collusion: the score is held at 0 for 180 days. Admins only; audited; recalculated at once.
router.post('/admin/users/:id/tiwala-freeze', requireAdmin, wrap(async (req, res) => {
  const u = await one('SELECT id, name FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const until = req.body?.frozen ? addDays(todayPH(), TIWALA.frozenDays) : null;
  await q('UPDATE users SET tiwala_frozen_until = ? WHERE id = ?', [until, u.id]);
  await audit(req.user.id, until ? 'tiwala_frozen' : 'tiwala_unfrozen', `user #${u.id} ${u.name}`);
  await runTiwala();
  res.json({ id: u.id, tiwala_frozen_until: until });
}));

// ---------- food rewards (rice and vegetables from local producers, paid by the LGU) ----------
router.get('/admin/rewards', wrap(async (_req, res) => {
  res.json({
    catalog: await q(
      `SELECT c.*, s.name AS supplier FROM reward_catalog c LEFT JOIN suppliers s ON s.id = c.supplier_id ORDER BY c.active DESC, c.name_en`),
    suppliers: await q('SELECT * FROM suppliers ORDER BY active DESC, name'),
    held: await q(
      `SELECT v.id, v.code, v.period, v.tier, v.issued_at, u.id AS user_id, u.name, u.purok, t.signals
         FROM vouchers v JOIN users u ON u.id = v.user_id LEFT JOIN trust_scores t ON t.user_id = v.user_id AND t.period = v.period
        WHERE v.status = 'held' ORDER BY v.id`),
    counts: Object.fromEntries((await q('SELECT status, COUNT(*) AS n FROM vouchers GROUP BY status')).map((r) => [r.status, Number(r.n)])),
    per_tier: { bronze: RULES.vouchersBronze, silver: RULES.vouchersSilver, gold: RULES.vouchersGold },
  });
}));

const readCatalog = (b, partial = false) => {
  const out = {};
  for (const k of ['name_en', 'name_fil']) {
    if (b?.[k] !== undefined || !partial) {
      const v = String(b?.[k] || '').trim();
      if (v.length < 2) throw bad('Write the reward in English and Filipino, for example "2 kg rice" / "2 kilong bigas".', 'bad_name');
      out[k] = v.slice(0, 80);
    }
  }
  if (b?.supplier_id !== undefined) out.supplier_id = b.supplier_id ? Number(b.supplier_id) : null;
  if (b?.value_estimate !== undefined) {
    const n = Number(b.value_estimate);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw bad('Write the value in whole pesos.', 'bad_value');
    out.value_estimate = n;
  }
  if (b?.active !== undefined) out.active = b.active ? 1 : 0;
  return out;
};

router.post('/admin/rewards/catalog', requireAdmin, wrap(async (req, res) => {
  const f = readCatalog(req.body);
  const r = await q('INSERT INTO reward_catalog (name_en, name_fil, supplier_id, value_estimate) VALUES (?,?,?,?)', [f.name_en, f.name_fil, f.supplier_id ?? null, f.value_estimate ?? 0]);
  await audit(req.user.id, 'reward_added', `reward #${r.insertId} ${f.name_en}`);
  res.status(201).json({ id: r.insertId });
}));

router.patch('/admin/rewards/catalog/:id', requireAdmin, wrap(async (req, res) => {
  const f = readCatalog(req.body, true);
  const keys = Object.keys(f);
  if (!keys.length) throw bad('Nothing to change.', 'bad_name');
  const r = await q(`UPDATE reward_catalog SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), req.params.id]);
  if (!r.affectedRows) throw notFound('Reward not found.');
  await audit(req.user.id, 'reward_edited', `reward #${req.params.id}`);
  res.json({ ok: true });
}));

// Stock the LGU bought (purchase) or a corrected count. Staff record it; it is audited.
router.post('/admin/rewards/catalog/:id/stock', wrap(async (req, res) => {
  res.json(await addStock(Number(req.params.id), req.body?.qty, req.body?.reason || 'purchase', req.body?.note, req.user));
}));

const readSupplier = (b, partial = false) => {
  const out = {};
  if (b?.name !== undefined || !partial) {
    const v = String(b?.name || '').trim();
    if (v.length < 2) throw bad('Write the name of the producer.', 'bad_name');
    out.name = v.slice(0, 120);
  }
  if (b?.kind !== undefined) {
    if (!['farmer', 'fisherfolk', 'garden', 'program', 'other'].includes(b.kind)) throw bad('Choose the kind of producer.', 'bad_kind');
    out.kind = b.kind;
  }
  for (const k of ['contact_name', 'phone']) if (b?.[k] !== undefined) out[k] = String(b[k] || '').trim().slice(0, k === 'phone' ? 30 : 120) || null;
  if (b?.active !== undefined) out.active = b.active ? 1 : 0;
  return out;
};

router.post('/admin/suppliers', requireAdmin, wrap(async (req, res) => {
  const f = readSupplier(req.body);
  const r = await q('INSERT INTO suppliers (name, kind, contact_name, phone) VALUES (?,?,?,?)', [f.name, f.kind || 'farmer', f.contact_name ?? null, f.phone ?? null]);
  await audit(req.user.id, 'supplier_added', `supplier #${r.insertId} ${f.name}`);
  res.status(201).json({ id: r.insertId });
}));

router.patch('/admin/suppliers/:id', requireAdmin, wrap(async (req, res) => {
  const f = readSupplier(req.body, true);
  const keys = Object.keys(f);
  if (!keys.length) throw bad('Nothing to change.', 'bad_name');
  const r = await q(`UPDATE suppliers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), req.params.id]);
  if (!r.affectedRows) throw notFound('Supplier not found.');
  await audit(req.user.id, 'supplier_edited', `supplier #${req.params.id}`);
  res.json({ ok: true });
}));

router.post('/admin/vouchers/:id/release', wrap(async (req, res) => res.json(await releaseVoucher(Number(req.params.id), req.user))));
router.post('/admin/vouchers/:id/cancel', requireAdmin, wrap(async (req, res) => res.json(await cancelVoucher(Number(req.params.id), req.body?.reason, req.user))));
router.get('/admin/vouchers/code/:code', wrap(async (req, res) => res.json(await lookupCode(req.params.code))));
router.post('/admin/vouchers/code/:code/give', wrap(async (req, res) => res.json(await handOut(req.params.code, req.user, req.body?.catalog_id || null))));
router.get('/admin/rewards/report', wrap(async (req, res) => res.json(await monthReport(req.query.month || todayPH().slice(0, 7)))));

// Issue vouchers now from today's scores (the first launch, or when the barangay decides): the live scores are
// kept as a snapshot named after today, then every tier gets its vouchers. Admins only; audited.
router.post('/admin/rewards/issue', requireAdmin, wrap(async (req, res) => {
  const period = todayPH();
  await q(
    `INSERT INTO trust_scores (user_id, period, score, tier, parts, signals, needs_staff_check, counted_loans, computed_on)
     SELECT user_id, ?, score, tier, parts, signals, needs_staff_check, counted_loans, computed_on FROM trust_scores WHERE period = 'live'
     ON DUPLICATE KEY UPDATE score = VALUES(score)`, [period]);
  const out = await issueVouchers(period);
  await audit(req.user.id, 'vouchers_issued', `${period}: ${out.vouchers} vouchers to ${out.residents} residents`);
  res.json(out);
}));

// ---------- donations ----------
// The queue: barangay-chosen donations with who asked (priority households first), open claims, and
// donations waiting to go to the Shelf or that nobody claimed.
router.get('/admin/donations', wrap(async (_req, res) => {
  const items = await q(
    `${SELECT_ITEM_SQL} WHERE i.listing_type = 'donate' AND i.status <> 'removed' AND i.donation_status IN ('open','reserved','to_shelf')
      ORDER BY i.created_at, i.id`);
  const asked = items.length ? await q(
    `SELECT c.item_id, c.id, u.id AS user_id, u.name, u.purok, u.priority_household, c.created_at
       FROM donation_claims c JOIN users u ON u.id = c.claimer_id
      WHERE c.status = 'waiting' AND c.item_id IN (?) ORDER BY u.priority_household DESC, c.id`, [items.map((i) => i.id)]) : [];
  const reserved = items.length ? await q(
    `SELECT c.id, c.item_id, c.staff_delivery, c.pickup_date, c.reserved_until, c.donor_confirmed_at, c.claimer_confirmed_at, u.name, u.purok
       FROM donation_claims c JOIN users u ON u.id = c.claimer_id WHERE c.status = 'reserved' AND c.item_id IN (?)`, [items.map((i) => i.id)]) : [];
  const first = (n) => String(n || '').split(' ')[0];
  const today = todayPH();
  res.json({
    choose: items.filter((i) => i.claim_mode === 'barangay' && i.donation_status === 'open').map((i) => ({
      item: mapItem(i),
      ready: addDays(String(i.created_at).slice(0, 10), RULES.barangayChoiceDays) < today,
      asked: asked.filter((a) => a.item_id === i.id).map((a) => ({ user_id: a.user_id, name: first(a.name), full_name: a.name, purok: a.purok, priority: !!a.priority_household })),
    })),
    reserved: reserved.map((c) => ({
      claim_id: c.id, item: mapItem(items.find((i) => i.id === c.item_id)), to: c.name, purok: c.purok, staff_delivery: !!c.staff_delivery,
      pickup_date: c.pickup_date, reserved_until: c.reserved_until, donor_confirmed: !!c.donor_confirmed_at, claimer_confirmed: !!c.claimer_confirmed_at,
    })),
    to_shelf: items.filter((i) => i.donation_status === 'to_shelf').map(mapItem),
    unclaimed: items.filter((i) => i.donation_status === 'open' && i.open_until && i.open_until <= today).map(mapItem),
  });
}));

router.post('/admin/donations/:id/choose', wrap(async (req, res) => res.json(await staffChoose(Number(req.params.id), Number(req.body?.user_id), !!req.body?.staff_delivery, req.user))));
router.post('/admin/donations/:id/accept-shelf', wrap(async (req, res) => res.json(await acceptShelf(Number(req.params.id), req.user))));

// ---------- kind words: the built-in list plus words staff add ----------
router.get('/admin/words', wrap(async (_req, res) => res.json({ built_in: UNKIND_WORDS, added: await staffWords() })));

router.post('/admin/words', requireAdmin, wrap(async (req, res) => {
  const word = String(req.body?.word || '').trim().toLowerCase();
  if (!/^[a-z][a-z' -]{1,38}$/.test(word)) throw bad('Write one word or a short phrase, letters only.', 'bad_word');
  await q('INSERT IGNORE INTO word_filter (word, added_by) VALUES (?, ?)', [word, req.user.id]);
  await audit(req.user.id, 'word_added', word);
  res.status(201).json({ word });
}));

router.delete('/admin/words/:word', requireAdmin, wrap(async (req, res) => {
  const word = String(req.params.word || '').trim().toLowerCase();
  const r = await q('DELETE FROM word_filter WHERE word = ?', [word]);
  if (!r.affectedRows) throw notFound('That word is not on the list.');
  await audit(req.user.id, 'word_removed', word);
  res.json({ ok: true });
}));

// Staff-assisted password reset, done at the hall after checking the person in front of them.
// Staff can reset residents; only an admin can reset a staff account; nobody resets their own here.
// The temporary password is shown once and must be changed at the next login. Older sessions end.
router.post('/admin/users/:id/reset-password', wrap(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!u) throw notFound('Account not found.');
  if (u.role !== 'resident' && req.user.role !== 'lgu_admin') throw forbidden('Only an admin can reset a staff password.', 'admin_only');
  if (u.id === req.user.id) throw bad('Use Change password for your own account.', 'self');
  const temp = temporaryPassword();
  await q('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?',
    [await bcrypt.hash(temp, 10), u.id]);
  await audit(req.user.id, 'password_reset', `user #${u.id} ${u.name}`);
  res.json({ temporary_password: temp });
}));

// Deleting a resident's account (admin only), usually after they asked from the app.
router.post('/admin/users/:id/delete', requireAdmin, wrap(async (req, res) => {
  const newPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  res.json(await withTx((conn) => deleteAccountTx(conn, Number(req.params.id), req.user, { newPasswordHash, removeFile: removePrivateFile })));
}));

// ---------- listings and the Barangay Shelf ----------
router.get('/admin/items', wrap(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.status) { where.push('i.status = ?'); params.push(req.query.status); }
  if (req.query.shelf === '1') where.push('i.is_shelf = 1');
  if (['ok', 'flagged', 'hidden'].includes(req.query.review)) { where.push('i.review_status = ?'); params.push(req.query.review); }
  if (req.query.tier) { where.push('i.tier = ?'); params.push(req.query.tier); }
  if (req.query.q) { where.push('(i.title LIKE ? OR u.name LIKE ?)'); params.push(like(req.query.q), like(req.query.q)); }
  const rows = await q(`${SELECT_ITEM_SQL} WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id DESC ${pageOf(req.query, config.pages.staffDefault, config.pages.staffMax)}`, params);
  res.json(rows.map((r) => ({ ...mapItem(r), owner_full_name: r.owner_name || null, review_flags: r.review_flags ? r.review_flags.split(',') : [] })));
}));

// Hide a listing from neighbors (with a reason for the owner), or show it again.
router.post('/admin/items/:id/hide', wrap(async (req, res) => res.json(await hideItem(Number(req.params.id), req.user, req.body?.reason))));
router.post('/admin/items/:id/show', wrap(async (req, res) => res.json(await showItem(Number(req.params.id), req.user))));

router.post('/admin/items/:id/remove', wrap(async (req, res) => {
  const item = await one('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) throw notFound('Item not found.');
  const active = await one("SELECT id FROM requests WHERE item_id = ? AND status IN ('approved','handed_over') LIMIT 1", [item.id]);
  if (active) throw bad('This item is out on loan or booked. Finish that request first.', 'item_busy');
  await withTx(async (conn) => {
    // Pending requests are rejected and credits go back.
    await removeItemTx(conn, item);
    if (item.owner_id) {
      await notify(conn, item.owner_id, 'item_removed', `Your listing was removed: ${item.title}`, req.body?.reason || 'It did not follow the community rules.', null,
        { item: item.title, reason: req.body?.reason || null });
    }
    await audit(req.user.id, 'item_removed', `item #${item.id} ${item.title}${req.body?.reason ? ': ' + req.body.reason : ''}`, conn);
  });
  res.json({ id: item.id, status: 'removed' });
}));

// Only what staff removed can be restored: an item its owner deleted stays deleted.
router.post('/admin/items/:id/restore', wrap(async (req, res) => {
  const item = await one('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) throw notFound('Item not found.');
  if (item.status === 'removed' && item.removed_by !== 'staff') throw bad('The owner removed this item. Only they can list it again.', 'owner_removed');
  await q("UPDATE items SET status = 'available', removed_by = NULL WHERE id = ?", [req.params.id]);
  await audit(req.user.id, 'item_restored', `item #${req.params.id}`);
  res.json({ id: Number(req.params.id), status: 'available' });
}));

router.post('/admin/shelf', wrap(async (req, res) => {
  const f = readItemBody(req.body);
  // The barangay can give items away too (surplus, relief goods): always "Let the barangay choose", at the hall.
  const giveAway = req.body?.listing_type === 'donate';
  const [r] = await pool.query(
    `INSERT INTO items (owner_id, is_shelf, category_id, title, description, item_condition, tier, max_loan_days, pickup_point_id, photo_url, repair_reuse,
                        listing_type, claim_mode, donation_status, open_until) VALUES (NULL,1,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [f.category_id, f.title, f.description || null, f.item_condition || 'good', f.tier || 'low',
      req.body?.max_loan_days ? readMaxDays(req.body.max_loan_days, { is_shelf: 1 }) : null, f.pickup_point_id || 1, f.photo_url || null, f.repair_reuse || 0,
      giveAway ? 'donate' : 'lend', giveAway ? 'barangay' : null, giveAway ? 'open' : null, giveAway ? addDays(todayPH(), RULES.donationOpenDays) : null]);
  await audit(req.user.id, giveAway ? 'barangay_donation_added' : 'shelf_item_added', `item #${r.insertId} ${f.title}`);
  res.status(201).json(mapItem(await one(`${SELECT_ITEM_SQL} WHERE i.id = ?`, [r.insertId])));
}));

// A shorter loan limit for a Barangay item (null = the normal limit). Neighbors' items keep the normal limit.
function readMaxDays(value, item) {
  if (!item.is_shelf) throw bad('Only Barangay items can have their own loan limit.', 'barangay_only');
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > RULES.maxLoanDays) throw bad(`Choose 1 to ${RULES.maxLoanDays} days.`, 'bad_max_days');
  return n;
}

router.patch('/admin/items/:id', wrap(async (req, res) => {
  const item = await one('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) throw notFound('Item not found.');
  const f = readItemBody(req.body, { partial: true });
  if (req.body?.max_loan_days !== undefined) f.max_loan_days = readMaxDays(req.body.max_loan_days, item);
  // Same rule as for owners: the tier decides the cost and who approves, so it stays put during a loan.
  if (f.tier && f.tier !== item.tier && await one("SELECT id FROM requests WHERE item_id = ? AND status IN ('pending','approved','handed_over','disputed') LIMIT 1", [item.id])) {
    throw bad('This item has an active request. Change its tier after the loan ends.', 'item_busy');
  }
  if (['available', 'paused'].includes(req.body?.status)) f.status = req.body.status;
  const keys = Object.keys(f);
  if (keys.length) await q(`UPDATE items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), req.params.id]);
  await audit(req.user.id, 'item_edited', `item #${req.params.id}`);
  res.json(mapItem(await one(`${SELECT_ITEM_SQL} WHERE i.id = ?`, [req.params.id])));
}));

// ---------- transactions and overdue monitor ----------
router.get('/admin/requests', wrap(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }
  if (req.query.overdue === '1') { where.push("r.status = 'handed_over' AND r.borrower_returned_at IS NULL AND r.end_date < CURDATE()"); }
  if (req.query.checkins === '1') { where.push("r.status = 'handed_over' AND r.borrower_returned_at IS NULL"); }
  if (req.query.staff === '1') where.push('r.handled_by_staff = 1');
  if (req.query.q) { where.push('(i.title LIKE ? OR b.name LIKE ?)'); params.push(like(req.query.q), like(req.query.q)); }
  const rows = await q(
    `${SELECT_REQUEST} WHERE ${where.join(' AND ')}
      ORDER BY (r.status='pending' AND r.handled_by_staff=1) DESC, (r.status='handed_over' AND r.end_date < CURDATE()) DESC, r.id DESC
      ${req.query.checkins === '1' ? 'LIMIT 500' : pageOf(req.query, config.pages.staffDefault, config.pages.staffMax)}`, params);
  // The portal gets full names and contact numbers so staff can follow up on late items.
  const full = await q('SELECT id, name, phone FROM users WHERE id IN (?)', [rows.length ? [...new Set(rows.map((r) => r.borrower_id))] : [0]]);
  const byId = Object.fromEntries(full.map((u) => [u.id, u]));
  let out = rows.map((r) => ({ ...mapRequest(r), borrower_full_name: byId[r.borrower_id]?.name, borrower_phone: byId[r.borrower_id]?.phone }));
  if (req.query.checkins === '1') out = out.filter((r) => r.checkin.missed_days >= RULES.checkinAlertAfterMissedDays);
  res.json(out);
}));

// Staff cancel any waiting or booked request, with a reason both neighbors see.
router.post('/admin/requests/:id/cancel', wrap(async (req, res) => res.json(await staffCancelRequest(Number(req.params.id), req.user, req.body?.reason))));

router.post('/admin/run-reminders', wrap(async (_req, res) => res.json(await runReminders())));

// When each scheduled job last ran, and its last result or error.
router.get('/admin/jobs', wrap(async (_req, res) => {
  res.json(await q('SELECT name, last_run_at, last_ok_at, last_result, last_error FROM job_runs ORDER BY name'));
}));

// ---------- reports and disputes ----------
router.get('/admin/reports', wrap(async (req, res) => {
  const where = req.query.status ? 'WHERE rp.status = ?' : '';
  const rows = await q(
    `SELECT rp.*, u.name AS reporter_name FROM reports rp JOIN users u ON u.id = rp.reporter_id
      ${where} ORDER BY FIELD(rp.status,'open','in_mediation','resolved'), (rp.status <> 'resolved' AND rp.reason IN (?)) DESC, rp.id DESC ${pageOf(req.query, config.pages.staffDefault, config.pages.staffMax)}`,
    req.query.status ? [req.query.status, URGENT_REASONS] : [URGENT_REASONS]);
  // What each report is about, fetched once per kind instead of once per report.
  const ids = (kind) => [...new Set(rows.filter((r) => r.target_type === kind).map((r) => r.target_id))];
  const inList = async (sql, list) => (list.length ? q(sql, [list]) : []);
  const loans = new Map((await inList(
    `SELECT x.id, i.title AS item_title, x.status, x.return_condition, b.name AS borrower, b.phone AS borrower_phone, o.name AS owner
       FROM requests x JOIN users b ON b.id = x.borrower_id JOIN items i ON i.id = x.item_id LEFT JOIN users o ON o.id = i.owner_id
      WHERE x.id IN (?)`, ids('request'))).map((x) => [x.id, x]));
  const itemTitles = new Map((await inList('SELECT id, title FROM items WHERE id IN (?)', ids('item'))).map((x) => [x.id, x.title]));
  const userNames = new Map((await inList('SELECT id, name FROM users WHERE id IN (?)', ids('user'))).map((x) => [x.id, x.name]));
  const out = [];
  for (const r of rows) {
    let target = null;
    if (r.target_type === 'request') {
      const rr = loans.get(r.target_id);
      if (rr) {
        target = { label: `${rr.item_title} (request #${rr.id})`, request_status: rr.status, borrower: rr.borrower, borrower_phone: rr.borrower_phone, owner: rr.owner || 'Barangay Shelf', condition: rr.return_condition };
      }
    } else if (r.target_type === 'item') {
      target = itemTitles.has(r.target_id) ? { label: itemTitles.get(r.target_id) } : null;
    } else {
      target = userNames.has(r.target_id) ? { label: userNames.get(r.target_id) } : null;
    }
    out.push({ id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, urgent: URGENT_REASONS.includes(r.reason), details: r.details, status: r.status,
      mediator_notes: r.mediator_notes, outcome: r.outcome, reporter: r.reporter_name, created_at: r.created_at, resolved_at: r.resolved_at, target });
  }
  res.json(out);
}));

// Resolving a report about a disputed loan settles the loan too: staff must choose how (`settle`),
// and the credits follow that outcome (see DISPUTE_OUTCOMES in rules.js).
router.patch('/admin/reports/:id', wrap(async (req, res) => {
  const { status, mediator_notes, outcome, settle } = req.body || {};
  const rp = await one('SELECT * FROM reports WHERE id = ?', [req.params.id]);
  if (!rp) throw notFound('Report not found.');
  if (status && !['open', 'in_mediation', 'resolved'].includes(status)) throw bad('Bad status.', 'bad_status');
  if (status === 'resolved' && !String(outcome || rp.outcome || '').trim()) throw bad('Write the outcome before closing the case.', 'outcome_required');
  const loan = rp.target_type === 'request' ? await one('SELECT status FROM requests WHERE id = ?', [rp.target_id]) : null;
  const settling = status === 'resolved' && loan?.status === 'disputed';
  if (settling && !settle) throw bad('Choose how the dispute was settled.', 'settle_required');
  if (settling && !DISPUTE_OUTCOMES[settle]) throw bad('Choose how the dispute was settled.', 'bad_outcome');
  let settled = null;
  await withTx(async (conn) => {
    await conn.query(
      `UPDATE reports SET status = COALESCE(?, status), mediator_notes = COALESCE(?, mediator_notes), outcome = COALESCE(?, outcome),
         resolved_by = IF(? = 'resolved', ?, resolved_by), resolved_at = IF(? = 'resolved', NOW(), resolved_at) WHERE id = ?`,
      [status || null, mediator_notes ?? null, outcome ?? null, status || '', req.user.id, status || '', rp.id]);
    if (status === 'resolved') {
      if (settling) settled = await settleDisputeTx(conn, rp.target_id, settle, req.user);
      await notify(conn, rp.reporter_id, 'report_resolved', 'Your report was resolved', outcome || rp.outcome, rp.id, { outcome: outcome || rp.outcome });
    }
    await audit(req.user.id, `report_${status || 'updated'}`, `report #${rp.id}`, conn);
  });
  res.json({ ok: true, settled });
}));

// ---------- announcements ----------
router.get('/admin/announcements', wrap(async (_req, res) => {
  res.json(await q('SELECT a.id, a.audience, a.title, a.message, a.created_at, u.name AS author FROM announcements a JOIN users u ON u.id = a.author_id ORDER BY a.id DESC LIMIT 50'));
}));

// The puroks residents choose from. Removing one does not change the people who live there.
router.get('/admin/puroks', wrap(async (_req, res) => res.json(await purokNames())));

router.post('/admin/puroks', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (name.length < 2) throw bad('Enter the purok name.', 'bad_purok');
  await q('INSERT IGNORE INTO puroks (name) VALUES (?)', [name]);
  await audit(req.user.id, 'purok_added', name);
  res.status(201).json(await purokNames());
}));

router.delete('/admin/puroks/:name', wrap(async (req, res) => {
  await q('DELETE FROM puroks WHERE name = ?', [req.params.name]);
  await audit(req.user.id, 'purok_removed', req.params.name);
  res.json(await purokNames());
}));

router.post('/admin/announcements', wrap(async (req, res) => {
  const { title, message, audience } = req.body || {};
  if (!title?.trim() || !message?.trim()) throw bad('Write a title and a message.', 'bad_message');
  const aud = audience && audience !== 'all' ? String(audience) : 'all';
  const count = await withTx(async (conn) => {
    const [r] = await conn.query('INSERT INTO announcements (author_id, audience, title, message) VALUES (?,?,?,?)',
      [req.user.id, aud, title.trim().slice(0, 140), message.trim().slice(0, 500)]);
    const [targets] = await conn.query(
      `SELECT id FROM users WHERE role='resident' AND verification_status='approved' AND suspended = 0 ${aud === 'all' ? '' : 'AND purok = ?'}`, aud === 'all' ? [] : [aud]);
    // Written by staff in their own words: shown as is, so no params.
    for (const t of targets) await notify(conn, t.id, 'announcement', title.trim().slice(0, 140), message.trim().slice(0, 255), r.insertId);
    await audit(req.user.id, 'announcement_sent', `${title.trim()} to ${aud} (${targets.length})`, conn);
    return targets.length;
  });
  res.status(201).json({ sent_to: count });
}));

// ---------- impact analytics and export ----------
router.get('/admin/impact', wrap(async (_req, res) => {
  const numbers = await impactNumbers();
  const monthly = await q(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS loans FROM requests WHERE status = 'closed'
      GROUP BY month ORDER BY month DESC LIMIT 6`);
  const byCategory = await q(
    `SELECT c.slug, c.name_en AS name, c.name_fil AS name_fil, COUNT(*) AS loans FROM requests r JOIN items i ON i.id = r.item_id JOIN categories c ON c.id = i.category_id
      WHERE r.status = 'closed' GROUP BY c.id ORDER BY loans DESC`);
  const survey = await q(
    `SELECT c.slug, s.would_have_bought AS answer, COUNT(*) AS n FROM impact_surveys s JOIN requests r ON r.id = s.request_id
       JOIN items i ON i.id = r.item_id JOIN categories c ON c.id = i.category_id GROUP BY c.slug, s.would_have_bought`);
  let low = 0; let high = 0;
  for (const row of survey) {
    const w = AVG_WEIGHT_KG[row.slug] || 1;
    if (row.answer === 'yes') { low += w * row.n; high += w * row.n; }
    if (row.answer === 'maybe') { high += w * row.n; }
  }
  res.json({
    ...numbers,
    monthly: monthly.reverse(),
    by_category: byCategory,
    waste_estimate_kg: { low: Math.round(low * 10) / 10, high: Math.round(high * 10) / 10 },
    method: 'ESTIMATE, not a measurement. Low = items where the borrower answered "yes, I would have bought or rented it" x average product weight for the category. High adds "maybe" answers. One loan does not equal one product not made.',
    weights_kg: AVG_WEIGHT_KG,
  });
}));

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Text starting with = + - @ (or a tab or return) would run as a formula in Excel: keep it as text.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
router.get('/admin/export/transactions.csv', wrap(async (_req, res) => {
  const rows = await q(
    `SELECT r.id, i.title AS item, c.name_en AS category, b.name AS borrower, COALESCE(o.name,'Barangay Shelf') AS lender,
            r.start_date, r.end_date, r.status, r.return_condition, r.on_time, r.credit_cost, s.would_have_bought AS purchase_avoided_answer
       FROM requests r JOIN items i ON i.id = r.item_id JOIN categories c ON c.id = i.category_id
       JOIN users b ON b.id = r.borrower_id LEFT JOIN users o ON o.id = i.owner_id
       LEFT JOIN impact_surveys s ON s.request_id = r.id ORDER BY r.id`);
  const head = ['id', 'item', 'category', 'borrower', 'lender', 'start_date', 'end_date', 'status', 'return_condition', 'on_time', 'credit_cost', 'purchase_avoided_answer'];
  const csv = [head.join(','), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hiraman-transactions.csv"');
  res.send(csv);
}));

// ---------- rules (read-only reference) ----------
router.get('/admin/rules', wrap(async (_req, res) => {
  res.json({
    rules: RULES,
    dispute_outcomes: DISPUTE_OUTCOMES,
    prohibited_words: PROHIBITED,
    tiers: [
      { tier: 'low', example: 'Chairs, calculators, board games', approval: 'Automatic', handover: 'Pickup point' },
      { tier: 'medium', example: 'Speakers, drills, ladders', approval: 'Owner approves; condition photo required', handover: 'Pickup point' },
      { tier: 'high', example: 'Expensive or hazardous items', approval: 'LGU staff approve', handover: 'Barangay hall only' },
    ],
    pickup_points: await q('SELECT id, name, note, hours FROM pickup_points ORDER BY id'),
  });
}));

// Rule numbers: staff can read them with their limits; only an admin changes them (audited, live at once).
router.get('/admin/settings', wrap(async (_req, res) => res.json(listRuleSettings())));
router.put('/admin/settings', requireAdmin, wrap(async (req, res) => res.json(await saveRuleSettings(req.body, req.user))));

// ---------- staff accounts and audit log ----------
router.get('/admin/staff', requireAdmin, wrap(async (_req, res) => {
  res.json(await q("SELECT id, name, email, role, suspended, created_at FROM users WHERE role IN ('lgu_staff','lgu_admin') ORDER BY id"));
}));

router.post('/admin/staff', requireAdmin, wrap(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw bad('Enter a name and a valid email.', 'bad_email');
  if (!password || password.length < 8) throw bad('Staff passwords need at least 8 characters.', 'bad_password');
  const [r] = await pool.query(
    "INSERT INTO users (name, email, password_hash, role, verification_status, language) VALUES (?,?,?,?, 'approved', 'en')",
    [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 10), role === 'lgu_admin' ? 'lgu_admin' : 'lgu_staff']);
  await audit(req.user.id, 'staff_created', `${name.trim()} (${role === 'lgu_admin' ? 'admin' : 'staff'})`);
  res.status(201).json({ id: r.insertId });
}));

router.post('/admin/staff/:id/disable', requireAdmin, wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw bad('You cannot disable your own account.', 'self');
  await q("UPDATE users SET suspended = 1 WHERE id = ? AND role IN ('lgu_staff','lgu_admin')", [req.params.id]);
  await audit(req.user.id, 'staff_disabled', `user #${req.params.id}`);
  res.json({ ok: true });
}));

router.post('/admin/staff/:id/enable', requireAdmin, wrap(async (req, res) => {
  await q("UPDATE users SET suspended = 0 WHERE id = ? AND role IN ('lgu_staff','lgu_admin')", [req.params.id]);
  await audit(req.user.id, 'staff_enabled', `user #${req.params.id}`);
  res.json({ ok: true });
}));

router.get('/admin/audit', requireAdmin, wrap(async (req, res) => {
  res.json(await q(`SELECT a.id, a.action, a.target, a.created_at, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC ${pageOf(req.query, config.pages.staffDefault, config.pages.staffMax)}`));
}));

export default router;
