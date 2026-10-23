import { Router } from 'express';
import { q, one, todayPH } from '../db.js';
import { config } from '../config.js';
import { bad, forbidden, notFound, wrap, HttpError } from '../errors.js';
import { authRequired, requireApproved } from '../auth.js';
import { ownPhoto } from '../uploads.js';
import { RULES, photoRequired } from '../rules.js';
import { phraseById, phrasesFor, renderPhrase, checkSlot } from '../phrases.js';
import {
  createRequest, decideRequest, cancelRequest, handOver, returnItem, saveSurvey, saveRating, checkIn, checkinState, addDays,
  contactOpen, threadOpen, notify, changeRequestDates,
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
    photo_required: photoRequired({ tier: r.item_tier }),
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

// What one message says, in both languages. Residents send phrases; staff (and residents before 2.0) wrote text.
function messageView(m, viewerId, points) {
  const p = m.phrase_id ? phraseById(m.phrase_id) : null;
  const staff = m.role !== 'resident';
  const en = p ? renderPhrase(p, m.slot_value, 'en', points) : m.body;
  const fil = p ? renderPhrase(p, m.slot_value, 'fil', points) : m.body;
  const mine = m.sender_id === viewerId;
  return {
    id: m.id, phrase_id: m.phrase_id || null, en, fil, body: en, created_at: m.created_at, mine, staff,
    from: staff ? 'Barangay staff' : first(m.name), legacy: !p && !staff, replies: p && !mine ? p.replies || [] : [],
  };
}

const pickupPointNames = async () => new Map((await q('SELECT id, name FROM pickup_points')).map((x) => [x.id, x.name]));
const sideOf = (r, user) => (user.id === r.borrower_id ? 'B' : user.id === r.owner_id ? 'O' : null);

router.get('/requests/:id/messages', authRequired, wrap(async (req, res) => {
  const r = await threadFor(req);
  const rows = await q(
    `SELECT m.id, m.sender_id, m.phrase_id, m.slot_value, m.body, m.created_at, u.name, u.role
       FROM request_messages m JOIN users u ON u.id = m.sender_id WHERE m.request_id = ? ORDER BY m.id`, [r.id]);
  await q("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND type = 'message' AND ref_id = ? AND read_at IS NULL", [req.user.id, r.id]);
  const open = threadOpen(r);
  const side = req.user.role === 'resident' ? sideOf(r, req.user) : null;
  const points = await pickupPointNames();
  res.json({
    open,
    can_write_text: open && req.user.role !== 'resident',
    phrases: open && side ? phrasesFor(r.status, side).map((p) => ({ id: p.id, situation: p.s, slot: p.slot || null, en: p.en, fil: p.fil })) : [],
    messages: rows.map((m) => messageView(m, req.user.id, points)),
  });
}));

// Residents send a phrase id and one picked value; staff send free text. See server/src/phrases.js.
router.post('/requests/:id/messages', authRequired, wrap(async (req, res) => {
  const r = await threadFor(req);
  if (!threadOpen(r)) throw bad('This conversation is closed.', 'thread_closed');
  const staff = req.user.role !== 'resident';
  let body = null; let phrase = null; let slot = null;
  if (staff) {
    body = String(req.body?.body || '').trim();
    if (!body) throw bad('Write a message first.', 'empty_message');
    if (body.length > RULES.messageMaxLength) throw bad(`Messages can be up to ${RULES.messageMaxLength} characters.`, 'message_too_long');
  } else {
    if (!req.body?.phrase_id) throw bad('Choose one of the messages. For anything else, use "My situation is not listed".', 'phrases_only');
    phrase = phraseById(req.body.phrase_id);
    if (!phrase) throw bad('That message does not exist.', 'unknown_phrase');
    if (!phrasesFor(r.status, sideOf(r, req.user)).includes(phrase)) throw bad('That message does not fit this request right now.', 'phrase_not_now');
    const me = await one('SELECT messaging_paused FROM users WHERE id = ?', [req.user.id]);
    if (me.messaging_paused) throw forbidden('Your messages are paused until barangay staff review a concern.', 'messaging_paused');
    try {
      slot = checkSlot(phrase, req.body.slot, { today: todayPH(), pointIds: new Set((await pickupPointNames()).keys()) });
    } catch (e) {
      throw bad(e.message, e.code || 'bad_slot');
    }
    const recent = await one(
      `SELECT COUNT(*) AS n, SUM(phrase_id = ? AND created_at > NOW() - INTERVAL 10 MINUTE) AS same
         FROM request_messages WHERE request_id = ? AND sender_id = ? AND created_at > NOW() - INTERVAL 1 DAY`, [phrase.id, r.id, req.user.id]);
    if (Number(recent.same) > 0) throw new HttpError(429, 'You just sent that. Please wait for their reply.', 'same_phrase_wait');
    if (Number(recent.n) >= RULES.messagesPerRequestPerDay) throw new HttpError(429, 'That is enough messages for today. Please wait for their reply.', 'too_many_messages');
  }
  const ins = await q('INSERT INTO request_messages (request_id, sender_id, phrase_id, slot_value, body) VALUES (?,?,?,?,?)',
    [r.id, req.user.id, phrase?.id || null, slot, body]);
  const points = await pickupPointNames();
  const en = phrase ? renderPhrase(phrase, slot, 'en', points) : body;
  const fil = phrase ? renderPhrase(phrase, slot, 'fil', points) : body;
  // Tell the other people once; more messages do not pile up notifications until they open the thread.
  const from = staff ? 'Barangay staff' : first(req.user.name);
  for (const userId of [r.borrower_id, r.owner_id].filter((u) => u && u !== req.user.id)) {
    const waiting = await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'message' AND ref_id = ? AND read_at IS NULL", [userId, r.id]);
    if (!waiting) {
      await notify({ query: q }, userId, 'message', `${from} wrote about ${r.item_title}`, en.slice(0, 120), r.id,
        { name: from, staff, item: r.item_title, preview: en.slice(0, 120), preview_fil: fil.slice(0, 120) });
    }
  }
  res.status(201).json({ id: ins.insertId, phrase_id: phrase?.id || null, en, fil, body: en, mine: true, staff, from });
}));

router.post('/requests/:id/approve', authRequired, wrap(async (req, res) => res.json(await decideRequest(Number(req.params.id), req.user, 'approve'))));
router.post('/requests/:id/reject', authRequired, wrap(async (req, res) => res.json(await decideRequest(Number(req.params.id), req.user, 'reject', req.body?.reason || null))));
router.post('/requests/:id/cancel', authRequired, wrap(async (req, res) => res.json(await cancelRequest(Number(req.params.id), req.user))));
router.post('/requests/:id/handover', authRequired, wrap(async (req, res) => res.json(await handOver(Number(req.params.id), req.user, ownPhoto(req.body?.photo)))));
router.post('/requests/:id/return', authRequired, wrap(async (req, res) => {
  const { condition, note, photo } = req.body || {};
  res.json(await returnItem(Number(req.params.id), req.user, { condition: condition || 'good', note: note || null, photo: ownPhoto(photo) }));
}));
router.patch('/requests/:id/dates', authRequired, wrap(async (req, res) => {
  res.json(await changeRequestDates(Number(req.params.id), req.user, req.body?.start_date, req.body?.end_date));
}));
router.post('/requests/:id/checkin', authRequired, wrap(async (req, res) => {
  res.json(await checkIn(Number(req.params.id), req.user, req.body?.answer, req.body?.note || null));
}));
router.post('/requests/:id/survey', authRequired, wrap(async (req, res) => res.json(await saveSurvey(Number(req.params.id), req.user, req.body?.would_have_bought))));
router.post('/requests/:id/rate', authRequired, wrap(async (req, res) => res.json(await saveRating(Number(req.params.id), req.user, req.body?.stars, req.body?.comment || null))));

export default router;
