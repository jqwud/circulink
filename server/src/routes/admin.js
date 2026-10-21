// LGU web portal API. Every route here needs a logged-in LGU staff or admin account.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { pool, q, one, withTx, todayPH } from '../db.js';
import { config } from '../config.js';
import { bad, notFound, wrap } from '../errors.js';
import { authRequired, requireStaff, requireAdmin, publicUser } from '../auth.js';
import { addCredits, audit, notify } from '../services.js';
import { runReminders } from '../jobs.js';
import { RULES, PROHIBITED, AVG_WEIGHT_KG } from '../rules.js';
import { SELECT_ITEM_SQL, mapItem, readItemBody } from './items.js';
import { SELECT_REQUEST, mapRequest } from './requests.js';
import { impactNumbers } from './community.js';

const router = Router();
router.use('/admin', authRequired, requireStaff);

const like = (s) => `%${String(s).trim()}%`;

// ---------- dashboard ----------
router.get('/admin/stats', wrap(async (_req, res) => {
  const today = todayPH();
  const n = async (sql, params = []) => (await one(sql, params)).n;
  const impact = await impactNumbers();
  res.json({
    verified_users: await n("SELECT COUNT(*) n FROM users WHERE role='resident' AND verification_status='approved'"),
    pending_verifications: await n("SELECT COUNT(*) n FROM users WHERE verification_status='pending'"),
    active_listings: await n("SELECT COUNT(*) n FROM items WHERE status='available'"),
    shelf_items: await n("SELECT COUNT(*) n FROM items WHERE is_shelf=1 AND status<>'removed'"),
    loans_this_week: await n('SELECT COUNT(*) n FROM requests WHERE created_at >= (NOW() - INTERVAL 7 DAY)'),
    active_loans: await n("SELECT COUNT(*) n FROM requests WHERE status='handed_over'"),
    overdue: await n("SELECT COUNT(*) n FROM requests WHERE status='handed_over' AND end_date < ?", [today]),
    staff_requests_waiting: await n("SELECT COUNT(*) n FROM requests WHERE status='pending' AND handled_by_staff=1"),
    open_reports: await n("SELECT COUNT(*) n FROM reports WHERE status <> 'resolved'"),
    completed_loans: impact.completed_loans,
    return_rate: impact.return_rate,
    purchases_avoided: impact.purchases_avoided,
  });
}));

// ---------- verification and users ----------
router.get('/admin/users', wrap(async (req, res) => {
  const where = ["u.role = 'resident'"];
  const params = [];
  if (req.query.status) { where.push('u.verification_status = ?'); params.push(req.query.status); }
  if (req.query.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); params.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
  const rows = await q(
    `SELECT u.id, u.name, u.email, u.phone, u.purok, u.verification_status, u.reject_reason, u.credits, u.suspended, u.created_at,
            (u.id_photo_path IS NOT NULL) AS has_id_photo,
            (SELECT COUNT(*) FROM items i WHERE i.owner_id = u.id AND i.status <> 'removed') AS items,
            (SELECT COUNT(*) FROM requests r WHERE r.borrower_id = u.id AND r.status = 'closed') AS loans
       FROM users u WHERE ${where.join(' AND ')}
      ORDER BY FIELD(u.verification_status,'pending','unverified','approved','rejected'), u.created_at DESC LIMIT 300`, params);
  res.json(rows.map((u) => ({ ...u, has_id_photo: !!u.has_id_photo, suspended: !!u.suspended })));
}));

router.get('/admin/users/:id', wrap(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  const history = await q(`${SELECT_REQUEST} WHERE r.borrower_id = ? OR i.owner_id = ? ORDER BY r.id DESC LIMIT 50`, [u.id, u.id]);
  const ledger = await q('SELECT amount, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30', [u.id]);
  res.json({ user: { ...publicUser(u), suspended: !!u.suspended, created_at: u.created_at }, history: history.map((r) => mapRequest(r, u.id)), ledger });
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

router.post('/admin/users/:id/approve', wrap(async (req, res) => {
  const r = await withTx(async (conn) => {
    const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? AND role = ? FOR UPDATE', [req.params.id, 'resident']);
    if (!u) throw notFound('Resident not found.');
    await conn.query("UPDATE users SET verification_status = 'approved', reject_reason = NULL, verification_decided_at = NOW() WHERE id = ?", [u.id]);
    // Starter credits are given once.
    const [[given]] = await conn.query("SELECT COUNT(*) n FROM credit_ledger WHERE user_id = ? AND reason = 'starter'", [u.id]);
    if (!given.n) await addCredits(conn, u.id, RULES.starterCredits, 'starter');
    await notify(conn, u.id, 'verified', 'Welcome to Hiraman!', `Your account is verified. You have ${RULES.starterCredits} starter credits.`);
    await audit(req.user.id, 'verification_approved', `user #${u.id} ${u.name}`, conn);
    return { id: u.id, verification_status: 'approved' };
  });
  res.json(r);
}));

router.post('/admin/users/:id/reject', wrap(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw bad('Please give a reason so the resident can fix it.', 'reason_required');
  const u = await one('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
  if (!u) throw notFound('Resident not found.');
  await withTx(async (conn) => {
    await conn.query("UPDATE users SET verification_status = 'rejected', reject_reason = ?, verification_decided_at = NOW() WHERE id = ?", [reason.slice(0, 255), u.id]);
    await notify(conn, u.id, 'verification_rejected', 'Verification needs a fix', reason, null);
    await audit(req.user.id, 'verification_rejected', `user #${u.id} ${u.name}: ${reason}`, conn);
  });
  res.json({ id: u.id, verification_status: 'rejected' });
}));

for (const [action, value, logged] of [['suspend', 1, 'user_suspended'], ['reinstate', 0, 'user_reinstated']]) {
  router.post(`/admin/users/:id/${action}`, wrap(async (req, res) => {
    const u = await one('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'resident']);
    if (!u) throw notFound('Resident not found.');
    await q('UPDATE users SET suspended = ? WHERE id = ?', [value, u.id]);
    await audit(req.user.id, logged, `user #${u.id} ${u.name}`);
    res.json({ id: u.id, suspended: !!value });
  }));
}

// ---------- listings and the Barangay Shelf ----------
router.get('/admin/items', wrap(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.status) { where.push('i.status = ?'); params.push(req.query.status); }
  if (req.query.shelf === '1') where.push('i.is_shelf = 1');
  if (req.query.tier) { where.push('i.tier = ?'); params.push(req.query.tier); }
  if (req.query.q) { where.push('(i.title LIKE ? OR u.name LIKE ?)'); params.push(like(req.query.q), like(req.query.q)); }
  const rows = await q(`${SELECT_ITEM_SQL} WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC LIMIT 300`, params);
  res.json(rows.map((r) => ({ ...mapItem(r), owner_full_name: r.owner_name || null })));
}));

router.post('/admin/items/:id/remove', wrap(async (req, res) => {
  const item = await one('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) throw notFound('Item not found.');
  const active = await one("SELECT id FROM requests WHERE item_id = ? AND status IN ('approved','handed_over') LIMIT 1", [item.id]);
  if (active) throw bad('This item is out on loan or booked. Finish that request first.', 'item_busy');
  await withTx(async (conn) => {
    await conn.query("UPDATE items SET status = 'removed' WHERE id = ?", [item.id]);
    // Pending requests are rejected and credits go back.
    const [pend] = await conn.query("SELECT * FROM requests WHERE item_id = ? AND status = 'pending'", [item.id]);
    for (const r of pend) {
      await conn.query("UPDATE requests SET status = 'rejected', credits_held = 0 WHERE id = ?", [r.id]);
      if (r.credits_held) await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_item_removed', r.id);
      await notify(conn, r.borrower_id, 'request_rejected', `Item removed: ${item.title}`, 'Your credits were returned.', r.id);
    }
    if (item.owner_id) await notify(conn, item.owner_id, 'item_removed', `Your listing was removed: ${item.title}`, req.body?.reason || 'It did not follow the community rules.');
    await audit(req.user.id, 'item_removed', `item #${item.id} ${item.title}${req.body?.reason ? ': ' + req.body.reason : ''}`, conn);
  });
  res.json({ id: item.id, status: 'removed' });
}));

router.post('/admin/items/:id/restore', wrap(async (req, res) => {
  await q("UPDATE items SET status = 'available' WHERE id = ?", [req.params.id]);
  await audit(req.user.id, 'item_restored', `item #${req.params.id}`);
  res.json({ id: Number(req.params.id), status: 'available' });
}));

router.post('/admin/shelf', wrap(async (req, res) => {
  const f = readItemBody(req.body);
  const [r] = await pool.query(
    'INSERT INTO items (owner_id, is_shelf, category_id, title, description, item_condition, tier, pickup_point_id, photo_url, repair_reuse) VALUES (NULL,1,?,?,?,?,?,?,?,?)',
    [f.category_id, f.title, f.description || null, f.item_condition || 'good', f.tier || 'low', f.pickup_point_id || 1, f.photo_url || null, f.repair_reuse || 0]);
  await audit(req.user.id, 'shelf_item_added', `item #${r.insertId} ${f.title}`);
  res.status(201).json(mapItem(await one(`${SELECT_ITEM_SQL} WHERE i.id = ?`, [r.insertId])));
}));

router.patch('/admin/items/:id', wrap(async (req, res) => {
  const f = readItemBody(req.body, { partial: true });
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
  if (req.query.overdue === '1') { where.push("r.status = 'handed_over' AND r.end_date < CURDATE()"); }
  if (req.query.staff === '1') where.push('r.handled_by_staff = 1');
  if (req.query.q) { where.push('(i.title LIKE ? OR b.name LIKE ?)'); params.push(like(req.query.q), like(req.query.q)); }
  const rows = await q(
    `${SELECT_REQUEST} WHERE ${where.join(' AND ')}
      ORDER BY (r.status='pending' AND r.handled_by_staff=1) DESC, (r.status='handed_over' AND r.end_date < CURDATE()) DESC, r.id DESC LIMIT 300`, params);
  // The portal gets full names and contact numbers so staff can follow up on late items.
  const full = await q('SELECT id, name, phone FROM users WHERE id IN (?)', [rows.length ? [...new Set(rows.map((r) => r.borrower_id))] : [0]]);
  const byId = Object.fromEntries(full.map((u) => [u.id, u]));
  res.json(rows.map((r) => ({ ...mapRequest(r), borrower_full_name: byId[r.borrower_id]?.name, borrower_phone: byId[r.borrower_id]?.phone })));
}));

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
      ${where} ORDER BY FIELD(rp.status,'open','in_mediation','resolved'), rp.id DESC LIMIT 200`, req.query.status ? [req.query.status] : []);
  const out = [];
  for (const r of rows) {
    let target = null;
    if (r.target_type === 'request') {
      const rr = await one(`${SELECT_REQUEST} WHERE r.id = ?`, [r.target_id]);
      if (rr) {
        const people = await one('SELECT b.name AS borrower, b.phone AS borrower_phone, o.name AS owner FROM requests x JOIN users b ON b.id = x.borrower_id JOIN items i ON i.id = x.item_id LEFT JOIN users o ON o.id = i.owner_id WHERE x.id = ?', [r.target_id]);
        target = { label: `${rr.item_title} (request #${rr.id})`, request_status: rr.status, borrower: people?.borrower, borrower_phone: people?.borrower_phone, owner: people?.owner || 'Barangay Shelf', condition: rr.return_condition };
      }
    } else if (r.target_type === 'item') {
      const it = await one('SELECT title, owner_id FROM items WHERE id = ?', [r.target_id]);
      target = it ? { label: it.title } : null;
    } else {
      const us = await one('SELECT name FROM users WHERE id = ?', [r.target_id]);
      target = us ? { label: us.name } : null;
    }
    out.push({ id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, details: r.details, status: r.status,
      mediator_notes: r.mediator_notes, outcome: r.outcome, reporter: r.reporter_name, created_at: r.created_at, resolved_at: r.resolved_at, target });
  }
  res.json(out);
}));

router.patch('/admin/reports/:id', wrap(async (req, res) => {
  const { status, mediator_notes, outcome, close_request } = req.body || {};
  const rp = await one('SELECT * FROM reports WHERE id = ?', [req.params.id]);
  if (!rp) throw notFound('Report not found.');
  if (status && !['open', 'in_mediation', 'resolved'].includes(status)) throw bad('Bad status.', 'bad_status');
  if (status === 'resolved' && !String(outcome || rp.outcome || '').trim()) throw bad('Write the outcome before closing the case.', 'outcome_required');
  await withTx(async (conn) => {
    await conn.query(
      `UPDATE reports SET status = COALESCE(?, status), mediator_notes = COALESCE(?, mediator_notes), outcome = COALESCE(?, outcome),
         resolved_by = IF(? = 'resolved', ?, resolved_by), resolved_at = IF(? = 'resolved', NOW(), resolved_at) WHERE id = ?`,
      [status || null, mediator_notes ?? null, outcome ?? null, status || '', req.user.id, status || '', rp.id]);
    if (status === 'resolved') {
      if (close_request && rp.target_type === 'request') {
        await conn.query("UPDATE requests SET status = 'closed' WHERE id = ? AND status = 'disputed'", [rp.target_id]);
      }
      await notify(conn, rp.reporter_id, 'report_resolved', 'Your report was resolved', outcome || rp.outcome, rp.id);
    }
    await audit(req.user.id, `report_${status || 'updated'}`, `report #${rp.id}`, conn);
  });
  res.json({ ok: true });
}));

// ---------- announcements ----------
router.get('/admin/announcements', wrap(async (_req, res) => {
  res.json(await q('SELECT a.id, a.audience, a.title, a.message, a.created_at, u.name AS author FROM announcements a JOIN users u ON u.id = a.author_id ORDER BY a.id DESC LIMIT 50'));
}));

router.get('/admin/puroks', wrap(async (_req, res) => {
  res.json((await q("SELECT DISTINCT purok FROM users WHERE purok IS NOT NULL AND purok <> '' ORDER BY purok")).map((r) => r.purok));
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
    prohibited_words: PROHIBITED,
    tiers: [
      { tier: 'low', example: 'Chairs, calculators, board games', approval: 'Automatic', handover: 'Pickup point' },
      { tier: 'medium', example: 'Speakers, drills, ladders', approval: 'Owner approves; condition photo required', handover: 'Pickup point' },
      { tier: 'high', example: 'Expensive or hazardous items', approval: 'LGU staff approve', handover: 'Barangay hall only' },
    ],
    pickup_points: await q('SELECT id, name, note, hours FROM pickup_points ORDER BY id'),
  });
}));

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

router.get('/admin/audit', requireAdmin, wrap(async (_req, res) => {
  res.json(await q('SELECT a.id, a.action, a.target, a.created_at, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 200'));
}));

export default router;
