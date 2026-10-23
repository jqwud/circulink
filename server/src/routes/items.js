import { Router } from 'express';
import { config } from '../config.js';
import { pool, q, one, withTx, todayPH, likeText, purokNames, pageOf } from '../db.js';
import { bad, forbidden, notFound, wrap } from '../errors.js';
import { authRequired, requireApproved } from '../auth.js';
import { RULES, SCREENING, creditCost, findProhibited, findNotDonatable, handledByStaff, screenListing, itemMaxDays } from '../rules.js';
import { claimDonation, donationAction } from '../donations.js';
import { flagItemTx, addDays } from '../services.js';
import { requireKind } from '../kindwords.js';
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
    origin: r.is_shelf ? 'barangay' : 'kapitbahay', // who it belongs to: the barangay, or a neighbor (kapitbahay)
    max_loan_days: itemMaxDays(r),
    listing_type: r.listing_type || 'lend',
    claim_mode: r.claim_mode || null,
    donation_status: r.donation_status || null,
    open_until: r.open_until || null,
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
    hall_phone: config.hallPhone, // shown on "Report a concern" next to 911
  });
}));

// Public: the sign-up form needs the puroks before anyone is logged in.
router.get('/puroks', wrap(async (_req, res) => res.json(await purokNames())));

router.get('/items', authRequired, wrap(async (req, res) => {
  const { q: text, category_id, tier, shelf, owner, origin, type } = req.query;
  // Donations show only while nobody has claimed them.
  const where = ["i.status = 'available'", "i.review_status = 'ok'", "(i.listing_type = 'lend' OR i.donation_status = 'open')"];
  const params = [];
  if (['lend', 'donate'].includes(type)) { where.push('i.listing_type = ?'); params.push(type); }
  if (text) { where.push('(i.title LIKE ? OR i.description LIKE ?)'); params.push(likeText(text), likeText(text)); }
  if (category_id) { where.push('i.category_id = ?'); params.push(Number(category_id)); }
  if (['low', 'medium', 'high'].includes(tier)) { where.push('i.tier = ?'); params.push(tier); }
  if (shelf === '1' || origin === 'barangay') where.push('i.is_shelf = 1');
  if (shelf === '0' || origin === 'kapitbahay') where.push('i.is_shelf = 0');
  if (owner === 'others') { where.push('(i.owner_id IS NULL OR i.owner_id <> ?)'); params.push(req.user.id); }
  const rows = await q(`${SELECT_ITEM} WHERE ${where.join(' AND ')} ORDER BY i.is_shelf DESC, i.created_at DESC, i.id DESC ${pageOf(req.query, config.pages.residentDefault, config.pages.residentMax)}`, params);
  res.json(rows.map(mapItem));
}));

router.post('/items/:id/claim', authRequired, wrap(async (req, res) => res.status(201).json(await claimDonation(Number(req.params.id), req.user))));
router.post('/items/:id/donation', authRequired, wrap(async (req, res) => res.json(await donationAction(Number(req.params.id), req.user, req.body?.action))));

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
  // Each item's next active request (the earliest by start date), all in one query.
  const loans = await q(
    `SELECT * FROM (
       SELECT r.item_id, r.id, r.status, r.start_date, r.end_date, u.name AS borrower,
              ROW_NUMBER() OVER (PARTITION BY r.item_id ORDER BY r.start_date, r.id) AS nth
         FROM requests r JOIN users u ON u.id = r.borrower_id JOIN items i ON i.id = r.item_id
        WHERE i.owner_id = ? AND r.status IN ('pending','approved','handed_over')) x
      WHERE x.nth = 1`, [req.user.id]);
  const byItem = new Map(loans.map(({ item_id: itemId, nth: _nth, ...loan }) => [itemId, loan]));
  // Donations: the open claim (if any) and how many residents asked, also in one query.
  const claims = await q(
    `SELECT c.item_id, c.id, c.status, SUM(c.status = 'waiting') OVER (PARTITION BY c.item_id) AS asked
       FROM donation_claims c JOIN items i ON i.id = c.item_id
      WHERE i.owner_id = ? AND c.status IN ('waiting','reserved')`, [req.user.id]);
  const claimOf = new Map();
  for (const c of claims) {
    const prev = claimOf.get(c.item_id);
    if (!prev || c.status === 'reserved') claimOf.set(c.item_id, { id: c.status === 'reserved' ? c.id : null, status: c.status, asked: Number(c.asked) });
  }
  res.json(rows.map((r) => {
    const loan = byItem.get(r.id);
    return {
      ...mapItem(r),
      current_request: loan ? { ...loan, borrower: String(loan.borrower).split(' ')[0] } : null,
      current_claim: claimOf.get(r.id) || null,
    };
  }));
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

// Giving an item away: how it is claimed, and the rules that keep donations safe and fair (spec section 3).
async function readDonation(user, f, body) {
  if (!['first', 'barangay'].includes(body.claim_mode)) throw bad('Choose first to claim, or let the barangay choose.', 'bad_claim_mode');
  if ((f.tier || 'low') === 'high') throw bad('Valuable items are given to the barangay: please bring it to the barangay hall.', 'donate_at_hall');
  const word = findNotDonatable(f.title, f.description);
  if (word) throw bad(`"${word}" cannot be given away on Hiraman (food, baby products and safety gear expire or can be unsafe).`, 'not_donatable');
  const me = await one('SELECT donate_paused_until FROM users WHERE id = ?', [user.id]);
  if (me.donate_paused_until && me.donate_paused_until >= todayPH()) {
    throw forbidden(`After donations with problems, you can give items again from ${addDays(me.donate_paused_until, 1)}.`, 'donate_paused');
  }
  // Someone who just received a donation does not pass on the same kind of thing at once (no gift loops).
  const recent = await one(
    `SELECT c.id FROM donation_claims c JOIN items i ON i.id = c.item_id
      WHERE c.claimer_id = ? AND c.status = 'given' AND i.category_id = ? AND c.closed_at >= NOW() - INTERVAL ? DAY LIMIT 1`,
    [user.id, f.category_id, RULES.regiftWaitDays]);
  if (recent) throw bad(`You received a donation in this category recently. You can give one in it after ${RULES.regiftWaitDays} days.`, 'regift_wait');
  return { claim_mode: body.claim_mode };
}

router.post('/items', authRequired, requireApproved, wrap(async (req, res) => {
  if (req.user.role !== 'resident') throw forbidden('Staff add Barangay Shelf items from the portal.', 'residents_only');
  const f = readItemBody(req.body);
  if (!f.pickup_point_id) throw bad('Choose a pickup point.', 'bad_pickup');
  await requireKind(req.user, 'listing', f.title, f.description);
  const donation = req.body?.listing_type === 'donate' ? await readDonation(req.user, f, req.body) : null;
  // Once, before the first listing: neighbors share at their own risk; the barangay mediates but does not pay.
  if (!req.user.lender_terms_accepted_at) {
    if (req.body?.accept_terms !== true) throw bad('Please read and accept the lending terms first.', 'terms_required');
    await q('UPDATE users SET lender_terms_accepted_at = NOW() WHERE id = ?', [req.user.id]);
  }
  const [r] = await pool.query(
    `INSERT INTO items (owner_id, category_id, title, description, item_condition, tier, pickup_point_id, photo_url, repair_reuse,
                        listing_type, claim_mode, donation_status, open_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.id, f.category_id, f.title, f.description || null, f.item_condition || 'good', f.tier || 'low', f.pickup_point_id, f.photo_url || null, f.repair_reuse || 0,
      donation ? 'donate' : 'lend', donation?.claim_mode || null, donation ? 'open' : null, donation ? addDays(todayPH(), RULES.donationOpenDays) : null]);
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
  await requireKind(req.user, `listing #${item.id}`, f.title, f.description);
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
