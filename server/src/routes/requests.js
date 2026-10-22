import { Router } from 'express';
import { q, one, todayPH } from '../db.js';
import { config } from '../config.js';
import { bad, forbidden, notFound, wrap } from '../errors.js';
import { authRequired, requireApproved } from '../auth.js';
import { ownPhoto } from '../uploads.js';
import { RULES } from '../rules.js';
import {
  createRequest, decideRequest, cancelRequest, handOver, returnItem, saveSurvey, saveRating, checkIn, checkinState, addDays,
  contactOpen, threadOpen, notify,
} from '../services.js';

const router = Router();

export const SELECT_REQUEST = `
  SELECT r.*, i.title AS item_title, i.photo_url AS item_photo, i.tier AS item_tier, i.is_shelf, i.owner_id,
         c.slug AS category_slug,
         b.name AS borrower_name, b.purok AS borrower_purok, b.phone AS borrower_phone_number,
         o.name AS owner_name, o.phone AS owner_phone_number,
         (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id) AS message_count,
         p.name AS pickup_name,
         (SELECT would_have_bought FROM impact_surveys s WHERE s.request_id = r.id) AS survey,
         (SELECT MAX(k.day) FROM request_checkins k WHERE k.request_id = r.id) AS last_checkin_day,
         (SELECT k.answer FROM request_checkins k WHERE k.request_id = r.id ORDER BY k.day DESC LIMIT 1) AS last_checkin_answer,
         (r.status = 'handed_over' AND r.end_date < CURDATE() AND r.borrower_returned_at IS NULL) AS overdue
    FROM requests r
    JOIN items i ON i.id = r.item_id
    JOIN categories c ON c.id = i.category_id
    JOIN users b ON b.id = r.borrower_id
    LEFT JOIN users o ON o.id = i.owner_id
    LEFT JOIN pickup_points p ON p.id = i.pickup_point_id`;

const first = (n) => (n ? String(n).split(' ')[0] : null);

// The day a request expires if nothing happens (see jobs.js): a pending one 7 days after it was made or
// the day after its end date, whichever comes first; an approved one the day after its end date.
function expiresOn(r) {
  if (r.status === 'pending') return [addDays(String(r.created_at).slice(0, 10), RULES.pendingExpiryDays), addDays(r.end_date, 1)].sort()[0];
  if (r.status === 'approved') return addDays(r.end_date, 1);
  return null;
}

export function mapRequest(r, viewerId = null) {
  return {
    id: r.id,
    item: { id: r.item_id, title: r.item_title, photo_url: r.item_photo, tier: r.item_tier, is_shelf: !!r.is_shelf, category_slug: r.category_slug },
    borrower: { id: r.borrower_id, name: first(r.borrower_name), purok: r.borrower_purok },
    owner: r.owner_id ? { id: r.owner_id, name: first(r.owner_name) } : null,
    pickup_point: r.pickup_name,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    credit_cost: r.credit_cost,
    credits_held: !!r.credits_held && ['pending', 'approved', 'handed_over'].includes(r.status),
    handled_by_staff: !!r.handled_by_staff,
    approved_at: r.approved_at,
    handed_over_at: r.handed_over_at,
    borrower_returned_at: r.borrower_returned_at,
    returned_at: r.returned_at,
    expires_on: expiresOn(r),
    checkin: r.status === 'handed_over' ? checkinState(r, todayPH()) : null,
    return_condition: r.return_condition,
    dispute_outcome: r.dispute_outcome,
    settled_at: r.settled_at,
    on_time: r.on_time === null ? null : !!r.on_time,
    overdue: !!r.overdue,
    note: r.note,
    survey: r.survey,
    kit_id: r.kit_id,
    my_role: viewerId ? (r.borrower_id === viewerId ? 'borrower' : r.owner_id === viewerId ? 'owner' : null) : null,
    message_count: Number(r.message_count || 0),
    thread_open: threadOpen(r),
    created_at: r.created_at,
  };
}

// The other neighbor's first name and phone, for the two people of an approved loan (see contactOpen).
// Items the barangay handles show the hall instead: the first pickup point, and HALL_PHONE if set.
async function hallContact() {
  const hall = await one('SELECT name, note, hours FROM pickup_points ORDER BY id LIMIT 1');
  return { kind: 'hall', name: hall?.name || 'Barangay Hall', phone: config.hallPhone, note: hall?.note || null, hours: hall?.hours || null };
}
async function withContact(row, viewerId) {
  const out = mapRequest(row, viewerId);
  out.contact = null;
  if (!out.my_role || !contactOpen(row)) return out;
  if (row.handled_by_staff || !row.owner_id) out.contact = await hallContact();
  else if (out.my_role === 'borrower') out.contact = { kind: 'person', name: first(row.owner_name), phone: row.owner_phone_number || null };
  else out.contact = { kind: 'person', name: first(row.borrower_name), phone: row.borrower_phone_number || null };
  return out;
}

router.post('/requests', authRequired, requireApproved, wrap(async (req, res) => {
  const { item_id, start_date, end_date, note } = req.body || {};
  const r = await createRequest({ borrower: req.user, itemId: Number(item_id), start: start_date, end: end_date, note: note || null });
  res.status(201).json(r);
}));

// as=borrower (things I borrow) or as=owner (people asking for my items)
router.get('/requests', authRequired, wrap(async (req, res) => {
  const as = req.query.as === 'owner' ? 'owner' : 'borrower';
  const rows = await q(
    `${SELECT_REQUEST} WHERE ${as === 'owner' ? 'i.owner_id' : 'r.borrower_id'} = ? ORDER BY
       FIELD(r.status,'pending','approved','handed_over','disputed','closed','rejected','cancelled','expired'), r.start_date DESC`,
    [req.user.id]);
  res.json(await Promise.all(rows.map((r) => withContact(r, req.user.id))));
}));

router.get('/requests/:id', authRequired, wrap(async (req, res) => {
  const row = await one(`${SELECT_REQUEST} WHERE r.id = ?`, [req.params.id]);
  if (!row) throw notFound('Request not found.');
  if (row.borrower_id !== req.user.id && row.owner_id !== req.user.id && req.user.role === 'resident') {
    throw forbidden('This is not your request.', 'cannot_manage');
  }
  res.json(await withContact(row, req.user.id));
}));

// ---------- the message thread ----------
// Borrower, owner and barangay staff can read and write. Opening the thread marks its notifications read.
async function threadFor(req) {
  const r = await one('SELECT r.*, i.owner_id, i.title AS item_title FROM requests r JOIN items i ON i.id = r.item_id WHERE r.id = ?', [req.params.id]);
  if (!r) throw notFound('Request not found.');
  if (req.user.role === 'resident' && r.borrower_id !== req.user.id && r.owner_id !== req.user.id) {
    throw forbidden('This is not your request.', 'cannot_manage');
  }
  return r;
}

router.get('/requests/:id/messages', authRequired, wrap(async (req, res) => {
  const r = await threadFor(req);
  const rows = await q(
    `SELECT m.id, m.sender_id, m.body, m.created_at, u.name, u.role
       FROM request_messages m JOIN users u ON u.id = m.sender_id WHERE m.request_id = ? ORDER BY m.id`, [r.id]);
  await q("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND type = 'message' AND ref_id = ? AND read_at IS NULL", [req.user.id, r.id]);
  res.json({
    open: threadOpen(r),
    messages: rows.map((m) => ({
      id: m.id, body: m.body, created_at: m.created_at, mine: m.sender_id === req.user.id,
      staff: m.role !== 'resident', from: m.role === 'resident' ? first(m.name) : 'Barangay staff',
    })),
  });
}));

router.post('/requests/:id/messages', authRequired, wrap(async (req, res) => {
  const r = await threadFor(req);
  const body = String(req.body?.body || '').trim();
  if (!body) throw bad('Write a message first.', 'empty_message');
  if (body.length > RULES.messageMaxLength) throw bad(`Messages can be up to ${RULES.messageMaxLength} characters.`, 'message_too_long');
  if (!threadOpen(r)) throw bad('This conversation is closed.', 'thread_closed');
  const ins = await q('INSERT INTO request_messages (request_id, sender_id, body) VALUES (?,?,?)', [r.id, req.user.id, body]);
  // Tell the other people once; more messages do not pile up notifications until they open the thread.
  const from = req.user.role === 'resident' ? first(req.user.name) : 'Barangay staff';
  for (const userId of [r.borrower_id, r.owner_id].filter((u) => u && u !== req.user.id)) {
    const waiting = await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'message' AND ref_id = ? AND read_at IS NULL", [userId, r.id]);
    if (!waiting) await notify({ query: q }, userId, 'message', `${from} wrote about ${r.item_title}`, body.slice(0, 120), r.id);
  }
  res.status(201).json({ id: ins.insertId, body, mine: true, staff: req.user.role !== 'resident', from });
}));

router.post('/requests/:id/approve', authRequired, wrap(async (req, res) => res.json(await decideRequest(Number(req.params.id), req.user, 'approve'))));
router.post('/requests/:id/reject', authRequired, wrap(async (req, res) => res.json(await decideRequest(Number(req.params.id), req.user, 'reject', req.body?.reason || null))));
router.post('/requests/:id/cancel', authRequired, wrap(async (req, res) => res.json(await cancelRequest(Number(req.params.id), req.user))));
router.post('/requests/:id/handover', authRequired, wrap(async (req, res) => res.json(await handOver(Number(req.params.id), req.user, ownPhoto(req.body?.photo)))));
router.post('/requests/:id/return', authRequired, wrap(async (req, res) => {
  const { condition, note, photo } = req.body || {};
  res.json(await returnItem(Number(req.params.id), req.user, { condition: condition || 'good', note: note || null, photo: ownPhoto(photo) }));
}));
router.post('/requests/:id/checkin', authRequired, wrap(async (req, res) => {
  res.json(await checkIn(Number(req.params.id), req.user, req.body?.answer, req.body?.note || null));
}));
router.post('/requests/:id/survey', authRequired, wrap(async (req, res) => res.json(await saveSurvey(Number(req.params.id), req.user, req.body?.would_have_bought))));
router.post('/requests/:id/rate', authRequired, wrap(async (req, res) => res.json(await saveRating(Number(req.params.id), req.user, req.body?.stars, req.body?.comment || null))));

export default router;
