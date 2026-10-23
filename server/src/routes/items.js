import { Router } from 'express';
import { pool, q, one, withTx, todayPH, likeText, purokNames } from '../db.js';
import { bad, forbidden, notFound, wrap } from '../errors.js';
import { authRequired, requireApproved } from '../auth.js';
import { RULES, SCREENING, creditCost, findProhibited, handledByStaff, screenListing } from '../rules.js';
import { flagItemTx } from '../services.js';
import { ownPhoto } from '../uploads.js';

const router = Router();

const SELECT_ITEM = `
  SELECT i.*, c.slug AS category_slug, c.name_en AS category_en, c.name_fil AS category_fil,
         u.name AS owner_name, u.purok AS owner_purok,
         p.name AS pickup_name, p.note AS pickup_note, p.hours AS pickup_hours,
         (SELECT ROUND(AVG(stars),1) FROM ratings WHERE ratee_id = i.owner_id) AS owner_rating,
         (SELECT COUNT(*) FROM requests r WHERE r.item_id = i.id AND r.status = 'handed_over') AS is_out
    FROM items i
    JOIN categories c ON c.id = i.category_id
    LEFT JOIN users u ON u.id = i.owner_id
    LEFT JOIN pickup_points p ON p.id = i.pickup_point_id`;

export function mapItem(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category_id: r.category_id,
    category: { slug: r.category_slug, name_en: r.category_en, name_fil: r.category_fil },
    condition: r.item_condition,
    tier: r.tier,
    photo_url: r.photo_url,
    is_shelf: !!r.is_shelf,
    repair_reuse: !!r.repair_reuse,
    status: r.status,
    removed_by: r.removed_by || null,
    review_status: r.review_status || 'ok',
    review_note: r.review_note || null,
    is_out: r.is_out > 0,
    credit_cost: creditCost(r),
    handled_by_staff: handledByStaff(r),
    // Only the first name and purok are shown to other residents. Never phone, email or address.
    owner: r.owner_id ? { id: r.owner_id, name: String(r.owner_name).split(' ')[0], purok: r.owner_purok, rating: r.owner_rating } : null,
    pickup_point: r.pickup_point_id ? { id: r.pickup_point_id, name: r.pickup_name, note: r.pickup_note, hours: r.pickup_hours } : null,
    created_at: r.created_at,
  };
}

export const SELECT_ITEM_SQL = SELECT_ITEM;

// Lists and rule numbers the app shows, so screens never repeat a number the server decides.
router.get('/meta', authRequired, wrap(async (_req, res) => {
  res.json({
    categories: await q('SELECT id, slug, name_en, name_fil, icon FROM categories ORDER BY id'),
    pickup_points: await q('SELECT id, name, note, hours FROM pickup_points ORDER BY id'),
    puroks: await purokNames(),
    rules: RULES,
  });
}));

// Public: the sign-up form needs the puroks before anyone is logged in.
router.get('/puroks', wrap(async (_req, res) => res.json(await purokNames())));

router.get('/items', authRequired, wrap(async (req, res) => {
  const { q: text, category_id, tier, shelf, owner } = req.query;
  const where = ["i.status = 'available'", "i.review_status = 'ok'"];
  const params = [];
  if (text) { where.push('(i.title LIKE ? OR i.description LIKE ?)'); params.push(likeText(text), likeText(text)); }
  if (category_id) { where.push('i.category_id = ?'); params.push(Number(category_id)); }
  if (['low', 'medium', 'high'].includes(tier)) { where.push('i.tier = ?'); params.push(tier); }
  if (shelf === '1') where.push('i.is_shelf = 1');
  if (owner === 'others') { where.push('(i.owner_id IS NULL OR i.owner_id <> ?)'); params.push(req.user.id); }
  const rows = await q(`${SELECT_ITEM} WHERE ${where.join(' AND ')} ORDER BY i.is_shelf DESC, i.created_at DESC LIMIT 200`, params);
  res.json(rows.map(mapItem));
}));

router.get('/items/:id', authRequired, wrap(async (req, res) => {
  const row = await one(`${SELECT_ITEM} WHERE i.id = ? AND i.status <> 'removed'`, [req.params.id]);
  // A hidden or flagged listing is invisible to neighbors; its owner and staff still open it.
  if (!row || (row.review_status !== 'ok' && row.owner_id !== req.user.id && req.user.role === 'resident')) throw notFound('Item not found.');
  // The same "taken" rule as booking (TAKEN_SQL): an item that is out and overdue stays taken until today.
  const today = todayPH();
  const booked = await q(
    `SELECT start_date, IF(status = 'handed_over', GREATEST(end_date, ?), end_date) AS end_date, status FROM requests
      WHERE item_id = ? AND status IN ('approved','handed_over') AND IF(status = 'handed_over', GREATEST(end_date, ?), end_date) >= ?
      ORDER BY start_date`,
    [today, row.id, today, today]);
  res.json({ ...mapItem(row), booked_ranges: booked });
}));

router.get('/my/items', authRequired, wrap(async (req, res) => {
  const rows = await q(`${SELECT_ITEM} WHERE i.owner_id = ? AND i.status <> 'removed' ORDER BY i.created_at DESC`, [req.user.id]);
  const out = [];
  for (const r of rows) {
    const loan = await one(
      `SELECT r.id, r.status, r.start_date, r.end_date, u.name AS borrower FROM requests r JOIN users u ON u.id = r.borrower_id
        WHERE r.item_id = ? AND r.status IN ('pending','approved','handed_over') ORDER BY r.start_date LIMIT 1`, [r.id]);
    out.push({ ...mapItem(r), current_request: loan ? { ...loan, borrower: String(loan.borrower).split(' ')[0] } : null });
  }
  res.json(out);
}));

function readItemBody(body, { partial = false } = {}) {
  const b = body || {};
  const out = {};
  if (!partial || b.title !== undefined) {
    if (!b.title || b.title.trim().length < 2) throw bad('Please enter the item name.', 'bad_title');
    out.title = b.title.trim().slice(0, 120);
  }
  if (!partial || b.category_id !== undefined) {
    if (!b.category_id) throw bad('Choose a category.', 'bad_category');
    out.category_id = Number(b.category_id);
  }
  if (b.description !== undefined) out.description = String(b.description).slice(0, 1000);
  if (b.condition !== undefined) {
    if (!['new', 'good', 'fair', 'worn'].includes(b.condition)) throw bad('Choose the item condition.', 'bad_condition');
    out.item_condition = b.condition;
  }
  if (b.tier !== undefined) {
    if (!['low', 'medium', 'high'].includes(b.tier)) throw bad('Choose a risk tier.', 'bad_tier');
    out.tier = b.tier;
  }
  if (b.pickup_point_id !== undefined) out.pickup_point_id = b.pickup_point_id ? Number(b.pickup_point_id) : null;
  if (b.photo_url !== undefined) out.photo_url = ownPhoto(b.photo_url);
  if (b.repair_reuse !== undefined) out.repair_reuse = b.repair_reuse ? 1 : 0;
  const word = findProhibited(out.title, out.description);
  if (word) throw bad(`"${word}" items are not allowed on Hiraman (weapons, medicines and hazardous items).`, 'prohibited_item');
  return out;
}

router.post('/items', authRequired, requireApproved, wrap(async (req, res) => {
  if (req.user.role !== 'resident') throw forbidden('Staff add Barangay Shelf items from the portal.', 'residents_only');
  const f = readItemBody(req.body);
  if (!f.pickup_point_id) throw bad('Choose a pickup point.', 'bad_pickup');
  const [r] = await pool.query(
    'INSERT INTO items (owner_id, category_id, title, description, item_condition, tier, pickup_point_id, photo_url, repair_reuse) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.user.id, f.category_id, f.title, f.description || null, f.item_condition || 'good', f.tier || 'low', f.pickup_point_id, f.photo_url || null, f.repair_reuse || 0]);
  // Automatic checks: the listing itself, and a brand-new account sharing many items at once.
  const flags = screenListing({ title: f.title, description: f.description, tier: f.tier || 'low' });
  const young = await one(
    `SELECT (u.created_at >= NOW() - INTERVAL ? HOUR) AS young,
            (SELECT COUNT(*) FROM items i WHERE i.owner_id = u.id AND i.created_at >= NOW() - INTERVAL ? HOUR) AS shared
       FROM users u WHERE u.id = ?`, [SCREENING.newAccountHours, SCREENING.newAccountHours, req.user.id]);
  if (young.young && young.shared >= SCREENING.newAccountListings) flags.push('new_account_burst');
  if (flags.length) await withTx((conn) => flagItemTx(conn, r.insertId, flags));
  res.status(201).json(mapItem(await one(`${SELECT_ITEM} WHERE i.id = ?`, [r.insertId])));
}));

router.patch('/items/:id', authRequired, wrap(async (req, res) => {
  const item = await one('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item || item.owner_id !== req.user.id) throw forbidden('You can only edit your own items.', 'cannot_manage');
  const f = readItemBody(req.body, { partial: true });
  if (req.body?.status && ['available', 'paused'].includes(req.body.status)) f.status = req.body.status;
  // The tier decides the cost, who approves and who hands over, so it cannot change under an active loan.
  if (f.tier && f.tier !== item.tier) {
    const active = await one("SELECT id FROM requests WHERE item_id = ? AND status IN ('pending','approved','handed_over','disputed') LIMIT 1", [item.id]);
    if (active) throw bad('This item has an active request. Change its tier after the loan ends.', 'item_busy');
  }
  const keys = Object.keys(f);
  if (keys.length) await q(`UPDATE items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), item.id]);
  // An edit is checked for what it changes (staff may already have cleared the rest): the new text, and the
  // whole listing again when the tier goes down.
  if (f.title !== undefined || f.description !== undefined || f.tier !== undefined) {
    const flags = screenListing({ title: f.title, description: f.description, tier: f.tier ?? item.tier });
    if (f.tier !== undefined && f.tier !== item.tier) {
      flags.push(...screenListing({ title: f.title ?? item.title, description: f.description ?? item.description, tier: f.tier }).filter((x) => x === 'value_tier'));
    }
    if (flags.length) await withTx((conn) => flagItemTx(conn, item.id, flags));
  }
  res.json(mapItem(await one(`${SELECT_ITEM} WHERE i.id = ?`, [item.id])));
}));

router.delete('/items/:id', authRequired, wrap(async (req, res) => {
  const item = await one('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item || item.owner_id !== req.user.id) throw forbidden('You can only remove your own items.', 'cannot_manage');
  const active = await one("SELECT id FROM requests WHERE item_id = ? AND status IN ('pending','approved','handed_over') LIMIT 1", [item.id]);
  if (active) throw bad('This item has an active request. Finish or reject it first.', 'item_busy');
  await q("UPDATE items SET status = 'removed', removed_by = 'owner' WHERE id = ?", [item.id]);
  res.json({ ok: true });
}));

export { readItemBody };
export default router;
