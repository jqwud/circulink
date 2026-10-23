// Message threads: one per borrow request, and one per donation claim. Residents send quick replies (a phrase
// id and one picked value, see phrases.js); staff write free text. Reading a thread marks its notifications read.
//
// A thread is described by the caller:
//   { column: 'request_id' | 'donation_claim_id', id, status, open, statusMap, notifyType,
//     borrowerId (or the claimer), ownerId (or the donor), itemTitle, onPhrase? }
import { q, one, todayPH } from './db.js';
import { RULES } from './rules.js';
import { bad, forbidden, HttpError } from './errors.js';
import { notify } from './services.js';
import { phraseById, phrasesFor, renderPhrase, checkSlot } from './phrases.js';

const first = (n) => String(n || '').split(' ')[0];
export const pickupPointNames = async () => new Map((await q('SELECT id, name FROM pickup_points')).map((x) => [x.id, x.name]));
const sideOf = (t, user) => (user.id === t.borrowerId ? 'B' : user.id === t.ownerId ? 'O' : null);

// What one message says, in both languages.
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

export async function readThread(t, user) {
  const rows = await q(
    `SELECT m.id, m.sender_id, m.phrase_id, m.slot_value, m.body, m.created_at, u.name, u.role
       FROM request_messages m JOIN users u ON u.id = m.sender_id WHERE m.${t.column} = ? ORDER BY m.id`, [t.id]);
  await q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND type = ? AND ref_id = ? AND read_at IS NULL', [user.id, t.notifyType, t.id]);
  const side = user.role === 'resident' ? sideOf(t, user) : null;
  const points = await pickupPointNames();
  return {
    open: t.open,
    can_write_text: t.open && user.role !== 'resident',
    phrases: t.open && side ? phrasesFor(t.status, side, t.statusMap).map((p) => ({ id: p.id, situation: p.s, slot: p.slot || null, en: p.en, fil: p.fil })) : [],
    messages: rows.map((m) => messageView(m, user.id, points)),
  };
}

export async function postToThread(t, user, input) {
  if (!t.open) throw bad('This conversation is closed.', 'thread_closed');
  const staff = user.role !== 'resident';
  let body = null; let phrase = null; let slot = null;
  if (staff) {
    body = String(input?.body || '').trim();
    if (!body) throw bad('Write a message first.', 'empty_message');
    if (body.length > RULES.messageMaxLength) throw bad(`Messages can be up to ${RULES.messageMaxLength} characters.`, 'message_too_long');
  } else {
    if (!input?.phrase_id) throw bad('Choose one of the messages. For anything else, use "My situation is not listed".', 'phrases_only');
    phrase = phraseById(input.phrase_id);
    if (!phrase) throw bad('That message does not exist.', 'unknown_phrase');
    if (!phrasesFor(t.status, sideOf(t, user), t.statusMap).includes(phrase)) throw bad('That message does not fit this request right now.', 'phrase_not_now');
    const me = await one('SELECT messaging_paused FROM users WHERE id = ?', [user.id]);
    if (me.messaging_paused) throw forbidden('Your messages are paused until barangay staff review a concern.', 'messaging_paused');
    try {
      slot = checkSlot(phrase, input.slot, { today: todayPH(), pointIds: new Set((await pickupPointNames()).keys()) });
    } catch (e) {
      throw bad(e.message, e.code || 'bad_slot');
    }
    const recent = await one(
      `SELECT COUNT(*) AS n, SUM(phrase_id = ? AND created_at > NOW() - INTERVAL 10 MINUTE) AS same
         FROM request_messages WHERE ${t.column} = ? AND sender_id = ? AND created_at > NOW() - INTERVAL 1 DAY`, [phrase.id, t.id, user.id]);
    if (Number(recent.same) > 0) throw new HttpError(429, 'You just sent that. Please wait for their reply.', 'same_phrase_wait');
    if (Number(recent.n) >= RULES.messagesPerRequestPerDay) throw new HttpError(429, 'That is enough messages for today. Please wait for their reply.', 'too_many_messages');
  }
  const ins = await q(`INSERT INTO request_messages (${t.column}, sender_id, phrase_id, slot_value, body) VALUES (?,?,?,?,?)`,
    [t.id, user.id, phrase?.id || null, slot, body]);
  if (phrase && t.onPhrase) await t.onPhrase(phrase, slot);
  const points = await pickupPointNames();
  const en = phrase ? renderPhrase(phrase, slot, 'en', points) : body;
  const fil = phrase ? renderPhrase(phrase, slot, 'fil', points) : body;
  // Tell the other people once; more messages do not pile up notifications until they open the thread.
  const from = staff ? 'Barangay staff' : first(user.name);
  for (const userId of [t.borrowerId, t.ownerId].filter((u) => u && u !== user.id)) {
    const waiting = await one('SELECT id FROM notifications WHERE user_id = ? AND type = ? AND ref_id = ? AND read_at IS NULL', [userId, t.notifyType, t.id]);
    if (!waiting) {
      await notify({ query: q }, userId, t.notifyType, `${from} wrote about ${t.itemTitle}`, en.slice(0, 120), t.id,
        { name: from, staff, item: t.itemTitle, preview: en.slice(0, 120), preview_fil: fil.slice(0, 120) });
    }
  }
  return { id: ins.insertId, phrase_id: phrase?.id || null, en, fil, body: en, mine: true, staff, from };
}
