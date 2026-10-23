// Resident-facing community features: credits, wanted board, kits, notifications, reports, announcements, impact.
import { Router } from 'express';
import { config } from '../config.js';
import { SCREENING } from '../rules.js';
import { pool, q, one, withTx, todayPH, pageOf } from '../db.js';
import { bad, forbidden, notFound, wrap, HttpError } from '../errors.js';
import { authRequired, requireApproved } from '../auth.js';
import { bookKit, notify, flagItemTx, audit } from '../services.js';
import { requireKind } from '../kindwords.js';
import { RULES } from '../rules.js';

const router = Router();
// Login is required on these paths only, so an unknown address still gets a plain 404.
router.use(['/credits', '/wanted', '/kits', '/notifications', '/reports', '/announcements', '/me/badges', '/impact'], authRequired);

const firstName = (n) => String(n || '').split(' ')[0];

// ---------- credits ----------
router.get('/credits', wrap(async (req, res) => {
  const ledger = await q('SELECT id, request_id, amount, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
  const fresh = await one('SELECT credits FROM users WHERE id = ?', [req.user.id]);
  res.json({ balance: fresh.credits, ledger, rules: RULES });
}));

// ---------- wanted board ----------
router.get('/wanted', wrap(async (req, res) => {
  const rows = await q(
    `SELECT w.*, u.name, u.purok FROM wanted_posts w JOIN users u ON u.id = w.user_id
      WHERE w.status = 'open' AND (w.needed_by IS NULL OR w.needed_by >= ?) ORDER BY w.created_at DESC, w.id DESC ${pageOf(req.query, config.pages.residentDefault, config.pages.residentMax)}`, [todayPH()]);
  res.json(rows.map((w) => ({
    id: w.id, title: w.title, details: w.details, needed_by: w.needed_by, status: w.status, created_at: w.created_at,
    user: { id: w.user_id, name: firstName(w.name), purok: w.purok }, mine: w.user_id === req.user.id,
  })));
}));

router.post('/wanted', requireApproved, wrap(async (req, res) => {
  const { title, details, needed_by } = req.body || {};
  if (!title || title.trim().length < 2) throw bad('Say what you need.', 'bad_title');
  await requireKind(req.user, 'wanted post', title, details);
  const [r] = await pool.query('INSERT INTO wanted_posts (user_id, title, details, needed_by) VALUES (?,?,?,?)',
    [req.user.id, title.trim().slice(0, 120), details ? String(details).slice(0, 255) : null, needed_by || null]);
  res.status(201).json({ id: r.insertId });
}));

// "I can lend this": sends the poster a notification.
router.post('/wanted/:id/offer', requireApproved, wrap(async (req, res) => {
  const w = await one('SELECT * FROM wanted_posts WHERE id = ? AND status = ?', [req.params.id, 'open']);
  if (!w) throw notFound('This post is closed.');
  if (w.user_id === req.user.id) throw bad('This is your own post.', 'own_item');
  await withTx((conn) => notify(conn, w.user_id, 'wanted_offer', `${firstName(req.user.name)} can help: ${w.title}`,
    'Check My Items or message them at the barangay pickup point.', w.id, { name: firstName(req.user.name), wanted: w.title }));
  res.json({ ok: true });
}));

router.patch('/wanted/:id/close', wrap(async (req, res) => {
  const w = await one('SELECT * FROM wanted_posts WHERE id = ?', [req.params.id]);
  if (!w || w.user_id !== req.user.id) throw forbidden('This is not your post.', 'cannot_manage');
  await q("UPDATE wanted_posts SET status = ? WHERE id = ?", [req.body?.fulfilled ? 'fulfilled' : 'closed', w.id]);
  res.json({ ok: true });
}));

// ---------- event kits ----------
router.get('/kits', wrap(async (_req, res) => {
  const kits = await q('SELECT * FROM kits WHERE active = 1 ORDER BY id');
  // Every line of every kit with how many matching items are free, in one grouped query.
  const lines = await q(
    `SELECT k.id, k.kit_id, k.label, COUNT(i.id) AS available
       FROM kit_items k
       LEFT JOIN items i ON i.status = 'available' AND i.review_status = 'ok' AND i.category_id = k.category_id
                        AND (k.keyword IS NULL OR i.title LIKE CONCAT('%', k.keyword, '%'))
      GROUP BY k.id, k.kit_id, k.label ORDER BY k.id`);
  res.json(kits.map((k) => ({
    id: k.id, name_en: k.name_en, name_fil: k.name_fil, description: k.description, emoji: k.emoji,
    items: lines.filter((l) => l.kit_id === k.id).map((l) => ({ id: l.id, label: l.label, available: Number(l.available) })),
  })));
}));

// Request a whole kit in one go (see bookKit in services.js).
router.post('/kits/:id/request', requireApproved, wrap(async (req, res) => {
  res.status(201).json(await bookKit(Number(req.params.id), req.user, req.body?.start_date, req.body?.end_date));
}));

// ---------- notifications ----------
router.get('/notifications', wrap(async (req, res) => {
  res.json(await q(`SELECT id, type, title, body, params, ref_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC ${pageOf(req.query, config.pages.residentDefault, config.pages.residentMax)}`, [req.user.id]));
}));
router.post('/notifications/read', wrap(async (req, res) => {
  await q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

// ---------- reports ----------
// A report on an item, a person or a request. From a request's messages it is a "concern": only staff read it,
// and it is about the other person on that request.
router.post('/reports', wrap(async (req, res) => {
  const { target_type, target_id, reason, details } = req.body || {};
  if (!['item', 'user', 'request'].includes(target_type)) throw bad('Choose what you are reporting.', 'bad_target');
  if (!reason) throw bad('Choose a reason.', 'bad_reason');
  const today = await one('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND created_at > NOW() - INTERVAL 1 DAY', [req.user.id]);
  if (today.n >= RULES.reportsPerDay) throw new HttpError(429, 'You have sent enough reports today. Barangay staff will look at them.', 'too_many_reports');
  await requireKind(req.user, 'report', details);
  let about = target_type === 'user' ? Number(target_id) : null;
  if (target_type === 'request') {
    const loan = await one('SELECT r.borrower_id, i.owner_id FROM requests r JOIN items i ON i.id = r.item_id WHERE r.id = ?', [Number(target_id)]);
    if (loan?.borrower_id === req.user.id) about = loan.owner_id;
    else if (loan?.owner_id === req.user.id) about = loan.borrower_id;
  }
  const [r] = await pool.query('INSERT INTO reports (reporter_id, target_type, target_id, about_user_id, reason, details) VALUES (?,?,?,?,?,?)',
    [req.user.id, target_type, Number(target_id), about, String(reason).slice(0, 80), details ? String(details).slice(0, 500) : null]);
  // Repeated harassment concerns about one person pause their quick replies until staff review.
  if (about && reason === 'harassment') {
    const seen = await one("SELECT COUNT(*) AS n FROM reports WHERE about_user_id = ? AND reason = 'harassment' AND created_at > NOW() - INTERVAL 30 DAY", [about]);
    if (seen.n >= RULES.harassmentConcernsToPause) {
      await q('UPDATE users SET messaging_paused = 1 WHERE id = ?', [about]);
      await audit(req.user.id, 'messaging_paused', `user #${about} after ${seen.n} harassment concerns`);
    }
  }
  // An item reported by several different neighbors since staff last checked it is held back for review.
  if (target_type === 'item') {
    const seen = await one(
      `SELECT COUNT(DISTINCT rp.reporter_id) AS n FROM reports rp JOIN items i ON i.id = rp.target_id
        WHERE rp.target_type = 'item' AND rp.target_id = ? AND (i.reviewed_at IS NULL OR rp.created_at > i.reviewed_at)`, [Number(target_id)]);
    if (seen.n >= SCREENING.reportsToFlag) await withTx((conn) => flagItemTx(conn, Number(target_id), ['reported']));
  }
  res.status(201).json({ id: r.insertId });
}));

// ---------- announcements from the LGU ----------
router.get('/announcements', wrap(async (req, res) => {
  res.json(await q(
    `SELECT id, audience, title, message, created_at FROM announcements
      WHERE audience = 'all' OR audience = ? ORDER BY id DESC LIMIT 20`, [req.user.purok || '']));
}));

// ---------- my badges (shown in the app profile) ----------
router.get('/me/badges', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = async (sql, params) => (await one(sql, params)).n;
  const lent = await n("SELECT COUNT(*) n FROM requests r JOIN items i ON i.id = r.item_id WHERE i.owner_id = ? AND r.status = 'closed'", [uid]);
  const borrowed = await n("SELECT COUNT(*) n FROM requests WHERE borrower_id = ? AND status = 'closed'", [uid]);
  const onTime = await n("SELECT COUNT(*) n FROM requests WHERE borrower_id = ? AND status = 'closed' AND on_time = 1", [uid]);
  const repair = await n("SELECT COUNT(*) n FROM items WHERE owner_id = ? AND repair_reuse = 1 AND status <> 'removed'", [uid]);
  const avoided = await n("SELECT COUNT(*) n FROM impact_surveys s JOIN requests r ON r.id = s.request_id WHERE r.borrower_id = ? AND s.would_have_bought = 'yes'", [uid]);
  const donations = await n("SELECT COUNT(*) n FROM donation_claims c JOIN items i ON i.id = c.item_id WHERE i.owner_id = ? AND c.status = 'given'", [uid]);
  res.json({
    stats: { lent, borrowed, on_time_returns: onTime, purchases_avoided: avoided, donations },
    badges: [
      { key: 'first_lend', earned: lent >= 1 },
      { key: 'good_neighbor', earned: lent >= 3 },
      { key: 'on_time_star', earned: onTime >= 3 },
      { key: 'repair_hero', earned: repair >= 1 },
      { key: 'zero_waste', earned: avoided >= 1 && borrowed >= 3 },
      { key: 'generous_1', earned: donations >= 1 },   // Mapagbigay: confirmed donations
      { key: 'generous_5', earned: donations >= 5 },
      { key: 'generous_15', earned: donations >= 15 },
    ],
  });
}));

// ---------- community impact (simple counts for residents) ----------
export async function impactNumbers() {
  const [loans] = await q("SELECT COUNT(*) AS n FROM requests WHERE status = 'closed'");
  const [returned] = await q("SELECT COUNT(*) AS n, SUM(on_time = 1) AS on_time FROM requests WHERE status IN ('closed','disputed') AND returned_at IS NOT NULL");
  const [reused] = await q("SELECT COUNT(DISTINCT item_id) AS n FROM requests WHERE status = 'closed'");
  const [users] = await q("SELECT COUNT(*) AS n FROM users WHERE role = 'resident' AND verification_status = 'approved'");
  const [listings] = await q("SELECT COUNT(*) AS n FROM items WHERE status = 'available'");
  const [survey] = await q(
    `SELECT COUNT(*) AS answered, SUM(would_have_bought = 'yes') AS yes, SUM(would_have_bought = 'maybe') AS maybe FROM impact_surveys`);
  return {
    completed_loans: loans.n,
    items_reused: reused.n,
    verified_residents: users.n,
    active_listings: listings.n,
    return_rate: returned.n ? Math.round((returned.on_time / returned.n) * 100) : null,
    survey_answers: survey.answered,
    purchases_avoided: Number(survey.yes || 0),     // only "yes" answers count
    maybe_answers: Number(survey.maybe || 0),
  };
}
// The monthly thank-you board: donors who opted in, by first name and purok only (spec section 3).
async function thanksBoard() {
  const rows = await q(
    `SELECT u.name, u.purok, COUNT(*) AS donations FROM donation_claims c JOIN items i ON i.id = c.item_id JOIN users u ON u.id = i.owner_id
      WHERE c.status = 'given' AND u.thanks_opt_in = 1 AND u.deleted_at IS NULL
        AND c.closed_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      GROUP BY u.id ORDER BY donations DESC, u.id LIMIT 30`);
  return rows.map((r) => ({ name: firstName(r.name), purok: r.purok, donations: Number(r.donations) }));
}

router.get('/impact', wrap(async (_req, res) => res.json({ ...(await impactNumbers()), thanks: await thanksBoard() })));

export default router;
