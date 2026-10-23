// Business logic that both the resident API and the LGU portal API share.
import { q, one, withTx, todayPH } from './db.js';
import { bad, forbidden, notFound } from './errors.js';
import { RULES, DISPUTE_OUTCOMES, creditCost, handledByStaff, autoApproves, photoRequired } from './rules.js';
import { requireKind } from './kindwords.js';

// ---------- small helpers ----------
// title and body are the English text (kept for older app versions). `params` holds the values, so the
// app can write the sentence in the reader's language with friendly dates (app/lib/core/notification_text.dart).
export async function notify(conn, userId, type, title, body = null, refId = null, params = null) {
  await conn.query(
    'INSERT INTO notifications (user_id, type, title, body, params, ref_id) VALUES (?,?,?,?,?,?)',
    [userId, type, title, body, params ? JSON.stringify(params) : null, refId],
  );
}

export async function audit(actorId, action, target = null, conn = null) {
  await (conn || { query: q }).query('INSERT INTO audit_log (actor_id, action, target) VALUES (?,?,?)', [actorId, action, target]);
}

// Every credit change is a ledger row. A negative change never takes a balance below zero.
export async function addCredits(conn, userId, amount, reason, requestId = null) {
  const [[u]] = await conn.query('SELECT credits FROM users WHERE id = ? FOR UPDATE', [userId]);
  let delta = amount;
  if (amount < 0) delta = -Math.min(-amount, u.credits);
  if (delta === 0 && amount !== 0) return 0;
  await conn.query('UPDATE users SET credits = credits + ? WHERE id = ?', [delta, userId]);
  await conn.query('INSERT INTO credit_ledger (user_id, request_id, amount, reason) VALUES (?,?,?,?)', [userId, requestId, delta, reason]);
  return delta;
}

const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ---------- contact between neighbors ----------
// Phone numbers are shared only between the two neighbors of a loan, from approval until
// RULES.contactDaysAfterClose days after it closes.
export function contactOpen(r, today = todayPH()) {
  if (['approved', 'handed_over', 'disputed'].includes(r.status)) return true;
  if (r.status !== 'closed') return false;
  const ended = r.settled_at || r.returned_at;
  return !!ended && addDays(String(ended).slice(0, 10), RULES.contactDaysAfterClose) >= today;
}

// The message thread is open while a request waits for an answer, and for as long as contact is.
export const threadOpen = (r, today = todayPH()) => r.status === 'pending' || contactOpen(r, today);

// ---------- daily check-ins ----------
// Loans that are out and not yet reported back by the borrower, with what the check-in rules need.
export const OUT_LOANS_SQL = `
  SELECT r.id, r.borrower_id, r.handled_by_staff, r.handed_over_at, r.checkin_since, r.borrower_returned_at,
         r.checkin_reminded_on, r.checkin_alerted_on, i.title AS item_title, i.owner_id,
         (SELECT MAX(k.day) FROM request_checkins k WHERE k.request_id = r.id) AS last_checkin_day
    FROM requests r JOIN items i ON i.id = r.item_id
   WHERE r.status = 'handed_over' AND r.borrower_returned_at IS NULL`;

// Where a loan stands with its daily check-ins. Counting starts the day after the handover (or after the
// last check-in, or the day check-ins began for loans already out), so the handover day itself is never "missed".
export function checkinState(r, today = todayPH()) {
  const returned = !!r.borrower_returned_at;
  const handedDay = r.handed_over_at ? String(r.handed_over_at).slice(0, 10) : null;
  const base = [r.checkin_since, handedDay, r.last_checkin_day].filter(Boolean).sort().at(-1) || today;
  return {
    due_today: !returned && base < today,
    missed_days: returned ? 0 : Math.max(0, daysBetween(base, today) - 1),
    alert: !returned && daysBetween(base, today) - 1 >= RULES.checkinAlertAfterMissedDays,
    last_day: r.last_checkin_day || null,
    last_answer: r.last_checkin_answer || null,
  };
}

// Borrow dates: real dates, not in the past (Philippine time), in order, at most maxLoanDays long.
export function assertDates(start, end) {
  if (!isoDate(start) || !isoDate(end)) throw bad('Choose a start and end date.', 'bad_dates');
  if (start < todayPH()) throw bad('The start date cannot be in the past.', 'past_date');
  if (end < start) throw bad('The end date must be on or after the start date.', 'bad_dates');
  if (daysBetween(start, end) + 1 > RULES.maxLoanDays) throw bad(`You can borrow for up to ${RULES.maxLoanDays} days.`, 'too_long');
}

// When is an item taken? By an approved loan on those dates, or by a loan that is out:
// an item that is out and overdue stays taken until it comes back. The one definition, used everywhere.
// `r` is the alias of the requests table. Parameters, in order: end date, today, start date.
export const TAKEN_SQL = (r) =>
  `${r}.status IN ('approved','handed_over') AND ${r}.start_date <= ?
   AND (CASE WHEN ${r}.status = 'handed_over' THEN GREATEST(${r}.end_date, ?) ELSE ${r}.end_date END) >= ?`;

export async function findClash(conn, itemId, start, end, exceptRequestId = 0) {
  const [rows] = await conn.query(
    `SELECT r.id FROM requests r WHERE r.item_id = ? AND r.id <> ? AND ${TAKEN_SQL('r')} LIMIT 1`,
    [itemId, exceptRequestId, end, todayPH(), start]);
  return rows[0] || null;
}

export async function loadRequest(conn, id, lock = true) {
  const [rows] = await conn.query(
    `SELECT r.*, i.title AS item_title, i.owner_id, i.is_shelf, i.tier, i.status AS item_status
       FROM requests r JOIN items i ON i.id = r.item_id WHERE r.id = ? ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw notFound('Request not found.');
  return rows[0];
}

// Who may approve, hand over or take back an item?
// Staff always can. Otherwise only the owner, and never for staff-handled items.
function assertCanManage(req, actor) {
  if (['lgu_staff', 'lgu_admin'].includes(actor.role)) return;
  if (!req.handled_by_staff && req.owner_id === actor.id) return;
  throw forbidden(
    req.handled_by_staff ? 'This item is handled at the barangay hall by LGU staff.' : 'Only the item owner can do this.',
    'cannot_manage',
  );
}

// ---------- create a borrow request ----------
// `conn` is an open transaction. Used for single requests and for kits.
export async function createRequestTx(conn, { borrower, itemId, start, end, kitId = null, note = null }) {
  if (borrower.role !== 'resident') throw forbidden('Only residents can borrow.', 'residents_only');
  if (borrower.verification_status !== 'approved') throw forbidden('Your account must be verified by the barangay first.', 'not_verified');
  assertDates(start, end);

  const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
  if (!item || item.status !== 'available' || item.review_status !== 'ok') throw bad('This item is not available right now.', 'item_unavailable');
  if (item.owner_id === borrower.id) throw bad('You cannot borrow your own item.', 'own_item');

  // The same person asking again for overlapping dates (a double tap, or a kit sent twice).
  const [[dup]] = await conn.query(
    `SELECT id FROM requests WHERE item_id = ? AND borrower_id = ? AND status IN ('pending','approved')
       AND start_date <= ? AND end_date >= ? LIMIT 1`, [itemId, borrower.id, end, start]);
  if (dup) throw bad('You already asked for this item for those dates.', 'duplicate_request');

  if (await findClash(conn, itemId, start, end)) throw bad('Those dates are already booked. Try other dates.', 'dates_booked');

  const cost = creditCost(item);
  const [[me]] = await conn.query('SELECT credits FROM users WHERE id = ? FOR UPDATE', [borrower.id]);
  if (me.credits < cost) throw bad(`You need ${cost} credit${cost === 1 ? '' : 's'} for this item. Lend something to earn more.`, 'insufficient_credits');

  const staffHandled = handledByStaff(item);
  const status = autoApproves(item) ? 'approved' : 'pending';
  const [ins] = await conn.query(
    `INSERT INTO requests (item_id, borrower_id, kit_id, start_date, end_date, status, credit_cost, credits_held, handled_by_staff, note, approved_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, IF(? = 'approved', NOW(), NULL))`,
    [itemId, borrower.id, kitId, start, end, status, cost, cost > 0 ? 1 : 0, staffHandled ? 1 : 0, note, status]);
  const requestId = ins.insertId;
  if (cost > 0) await addCredits(conn, borrower.id, -cost, 'borrow_hold', requestId);

  if (item.owner_id) {
    const first = borrower.name.split(' ')[0];
    if (status === 'pending' && !staffHandled) {
      await notify(conn, item.owner_id, 'request_new', `${first} wants to borrow ${item.title}`, `${start} to ${end}. Open Requests to approve or reject.`, requestId,
        { name: first, item: item.title, start, end });
    } else if (status === 'approved') {
      await notify(conn, item.owner_id, 'request_auto', `${first} is borrowing ${item.title}`, `${start} to ${end}. Hand it over at ${staffHandled ? 'the barangay hall' : 'the pickup point'}.`, requestId,
        { name: first, item: item.title, start, end, hall: staffHandled });
    } else {
      await notify(conn, item.owner_id, 'request_staff', `${first} requested ${item.title}`, 'The barangay will handle approval and handover for this item.', requestId,
        { name: first, item: item.title });
    }
  }
  return { id: requestId, status, credit_cost: cost, handled_by_staff: staffHandled, item_title: item.title };
}

export const createRequest = (args) => withTx((conn) => createRequestTx(conn, args));

// ---------- approve / reject / cancel ----------
export function decideRequest(requestId, actor, decision, reason = null) {
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    assertCanManage(r, actor);
    if (r.status !== 'pending') throw bad('This request is not waiting for a decision.', 'bad_state');
    if (decision === 'approve') {
      // Re-check that nobody else got these dates while we waited, and that the item is not still out.
      if (await findClash(conn, r.item_id, r.start_date, r.end_date, r.id)) throw bad('Those dates were booked by another request.', 'dates_booked');
      await conn.query("UPDATE requests SET status = 'approved', approved_at = NOW() WHERE id = ?", [r.id]);
      await notify(conn, r.borrower_id, 'request_approved', `Approved: ${r.item_title}`,
        r.handled_by_staff ? 'Pick it up at the barangay hall.' : 'Open the request to call or message the owner and agree on the pickup.', r.id,
        { item: r.item_title, hall: !!r.handled_by_staff });
    } else {
      await conn.query("UPDATE requests SET status = 'rejected', note = COALESCE(?, note) WHERE id = ?", [reason, r.id]);
      if (r.credits_held) {
        await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_rejected', r.id);
        await conn.query('UPDATE requests SET credits_held = 0 WHERE id = ?', [r.id]);
      }
      await notify(conn, r.borrower_id, 'request_rejected', `Not approved: ${r.item_title}`, reason || 'Your credits were returned.', r.id,
        { item: r.item_title, reason: reason || null });
    }
    if (actor.role !== 'resident') await audit(actor.id, `request_${decision}`, `request #${r.id}`, conn);
    return { id: r.id, status: decision === 'approve' ? 'approved' : 'rejected' };
  });
}

export function cancelRequest(requestId, actor) {
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    if (r.borrower_id !== actor.id) throw forbidden('Only the borrower can cancel.', 'cannot_manage');
    if (!['pending', 'approved'].includes(r.status)) throw bad('This request can no longer be cancelled.', 'bad_state');
    await conn.query("UPDATE requests SET status = 'cancelled' WHERE id = ?", [r.id]);
    if (r.credits_held) {
      await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_cancelled', r.id);
      await conn.query('UPDATE requests SET credits_held = 0 WHERE id = ?', [r.id]);
    }
    if (r.owner_id) await notify(conn, r.owner_id, 'request_cancelled', `Cancelled: ${r.item_title}`, 'The borrower cancelled the request.', r.id, { item: r.item_title });
    return { id: r.id, status: 'cancelled' };
  });
}

// ---------- change dates while waiting ----------
// The borrower may move a request that is still waiting for an answer. Same checks as a new request.
export function changeRequestDates(requestId, actor, start, end) {
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    if (r.borrower_id !== actor.id) throw forbidden('Only the borrower can change the dates.', 'cannot_manage');
    if (r.status !== 'pending') throw bad('Dates can be changed only while the request is waiting.', 'bad_state');
    assertDates(start, end);
    const [[dup]] = await conn.query(
      `SELECT id FROM requests WHERE item_id = ? AND borrower_id = ? AND id <> ? AND status IN ('pending','approved')
         AND start_date <= ? AND end_date >= ? LIMIT 1`, [r.item_id, r.borrower_id, r.id, end, start]);
    if (dup) throw bad('You already asked for this item for those dates.', 'duplicate_request');
    if (await findClash(conn, r.item_id, start, end, r.id)) throw bad('Those dates are already booked. Try other dates.', 'dates_booked');
    await conn.query('UPDATE requests SET start_date = ?, end_date = ? WHERE id = ?', [start, end, r.id]);
    if (r.owner_id && !r.handled_by_staff) {
      await notify(conn, r.owner_id, 'request_dates_changed', `New dates for ${r.item_title}`, `${start} to ${end}. Open Requests to approve or reject.`, r.id,
        { item: r.item_title, start, end });
    }
    return { id: r.id, start_date: start, end_date: end };
  });
}

// ---------- hand over ----------
export function handOver(requestId, actor, photo = null) {
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    assertCanManage(r, actor);
    if (r.status !== 'approved') throw bad('Only an approved request can be handed over.', 'bad_state');
    if (photoRequired(r) && !photo) throw bad('A condition photo is required for this item.', 'photo_required');
    await conn.query("UPDATE requests SET status = 'handed_over', handed_over_at = NOW(), handover_photo = ?, checkin_since = ? WHERE id = ?", [photo, todayPH(), r.id]);
    await notify(conn, r.borrower_id, 'handover', `You have ${r.item_title}`, `Please return it by ${r.end_date}. Check in once a day in the app until you return it.`, r.id,
      { item: r.item_title, end: r.end_date });
    if (actor.role !== 'resident') await audit(actor.id, 'handover_confirmed', `request #${r.id}`, conn);
    return { id: r.id, status: 'handed_over' };
  });
}

// ---------- return ----------
// The normal credit rules for a good return: the lender earns a reward if it came back on time and they are
// under the monthly cap for this borrower; a late borrower loses the late penalty (never below 0).
async function normalReturnCredits(conn, r, onTime) {
  const out = { lender_reward: 0, late_penalty: 0 };
  if (r.owner_id && onTime) {
    const [[cap]] = await conn.query(
      `SELECT COUNT(*) AS n FROM credit_ledger l JOIN requests rr ON rr.id = l.request_id
        WHERE l.user_id = ? AND l.reason = 'lend_reward' AND rr.borrower_id = ?
          AND l.created_at >= (NOW() - INTERVAL 30 DAY)`, [r.owner_id, r.borrower_id]);
    if (cap.n < RULES.pairRewardCapPerMonth) {
      out.lender_reward = await addCredits(conn, r.owner_id, RULES.lenderReward, 'lend_reward', r.id);
      await notify(conn, r.owner_id, 'credit_earned', `+${RULES.lenderReward} credit`, `Thank you for lending ${r.item_title}.`, r.id, { n: RULES.lenderReward, item: r.item_title });
    } else {
      await notify(conn, r.owner_id, 'credit_capped', 'Thanks for lending again', 'You reached the monthly reward limit for this neighbor, so no credit this time.', r.id, { item: r.item_title });
    }
  }
  if (!onTime) {
    out.late_penalty = -(await addCredits(conn, r.borrower_id, -RULES.latePenalty, 'late_penalty', r.id));
    await notify(conn, r.borrower_id, 'late_return', 'Returned late', `${RULES.latePenalty} credit was taken. Please return on time next time.`, r.id, { n: RULES.latePenalty, item: r.item_title });
  }
  return out;
}

// Credits move only on a confirmed return (here) or when staff settle a dispute (settleDisputeTx).
export function returnItem(requestId, actor, { condition = 'good', note = null, photo = null } = {}) {
  if (!['good', 'damaged', 'lost'].includes(condition)) throw bad('Choose the item condition.', 'bad_condition');
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    assertCanManage(r, actor);
    if (r.status !== 'handed_over') throw bad('This item is not out on loan.', 'bad_state');
    if (photoRequired(r) && condition === 'good' && !photo) throw bad('A condition photo is required for this item.', 'photo_required');

    // Lateness is judged by the day the borrower said "I returned it", so a slow confirmation never costs them.
    const returnedDay = r.borrower_returned_at ? String(r.borrower_returned_at).slice(0, 10) : todayPH();
    const onTime = returnedDay <= r.end_date ? 1 : 0;
    const result = { id: r.id, on_time: !!onTime, lender_reward: 0, late_penalty: 0 };

    if (condition === 'good') {
      await conn.query(
        "UPDATE requests SET status='closed', returned_at=NOW(), return_condition='good', on_time=?, return_photo=?, note=COALESCE(?, note) WHERE id=?",
        [onTime, photo, note, r.id]);
      result.status = 'closed';
      Object.assign(result, await normalReturnCredits(conn, r, onTime));
      await notify(conn, r.borrower_id, 'return_confirmed', `Return confirmed: ${r.item_title}`, 'Quick question: would you have bought or rented this otherwise?', r.id, { item: r.item_title });
    } else {
      // Damaged or lost goes to barangay mediation. No lender reward until it is settled.
      await conn.query(
        "UPDATE requests SET status='disputed', returned_at=NOW(), return_condition=?, on_time=?, return_photo=?, note=COALESCE(?, note) WHERE id=?",
        [condition, onTime, photo, note, r.id]);
      await conn.query(
        'INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?)',
        [actor.id, 'request', r.id, `item_${condition}`, note || `Item reported ${condition} at return.`]);
      await notify(conn, r.borrower_id, 'dispute', `Return of ${r.item_title} needs review`, 'The barangay will contact you to settle this.', r.id, { item: r.item_title });
      result.status = 'disputed';
    }
    if (actor.role !== 'resident') await audit(actor.id, `return_${condition}`, `request #${r.id}`, conn);
    return result;
  });
}

// ---------- removing an item ----------
// The item stops being listed. Its waiting and booked requests are rejected and their credits refunded.
// `conn` is an open transaction. The caller decides whether an item out on loan may be removed.
// `reason` tells the app which sentence to show: removed (by staff), lost, owner_left, or hidden.
export async function removeItemTx(conn, item, { exceptRequestId = 0, why = 'Your credits were returned.', by = 'staff', reason = 'removed' } = {}) {
  await conn.query("UPDATE items SET status = 'removed', removed_by = ? WHERE id = ?", [by, item.id]);
  return closeOpenRequestsTx(conn, item, { exceptRequestId, why, reason });
}

// The item's waiting and booked requests are rejected and their credits refunded (a loan already out is not touched).
export async function closeOpenRequestsTx(conn, item, { exceptRequestId = 0, why = 'Your credits were returned.', reason = 'removed' } = {}) {
  const [open] = await conn.query("SELECT * FROM requests WHERE item_id = ? AND id <> ? AND status IN ('pending','approved') FOR UPDATE", [item.id, exceptRequestId]);
  for (const r of open) {
    await conn.query("UPDATE requests SET status = 'rejected', credits_held = 0 WHERE id = ?", [r.id]);
    if (r.credits_held) await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_item_removed', r.id);
    await notify(conn, r.borrower_id, 'request_rejected', `Item removed: ${item.title}`, why, r.id, { item: item.title, removed: reason });
  }
  return open.length;
}

// ---------- deleting an account ----------
// The person is removed, the loan records stay (without them) so the barangay's totals still add up.
// Refused while a loan they are part of is approved, out or disputed. Their waiting requests are cancelled and
// refunded, their listings removed (others' waiting requests on them are refunded), and their name, contact
// details, ID photo, messages, notes and notifications are deleted.
export async function deleteAccountTx(conn, userId, actor, { newPasswordHash, removeFile }) {
  const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (!u || u.role !== 'resident') throw notFound('Resident not found.');
  if (u.deleted_at) return { id: u.id, deleted: true };
  const [[busy]] = await conn.query(
    `SELECT COUNT(*) AS n FROM requests r JOIN items i ON i.id = r.item_id
      WHERE (r.borrower_id = ? OR i.owner_id = ?) AND r.status IN ('approved','handed_over','disputed')`, [u.id, u.id]);
  if (busy.n) throw bad('This person has an active loan. Finish or cancel it first.', 'active_loans');

  const [mine] = await conn.query("SELECT * FROM requests WHERE borrower_id = ? AND status = 'pending' FOR UPDATE", [u.id]);
  for (const r of mine) {
    await conn.query("UPDATE requests SET status = 'cancelled', credits_held = 0 WHERE id = ?", [r.id]);
    if (r.credits_held) await addCredits(conn, u.id, r.credit_cost, 'refund_cancelled', r.id);
  }
  const [items] = await conn.query("SELECT * FROM items WHERE owner_id = ? AND status <> 'removed' FOR UPDATE", [u.id]);
  for (const item of items) await removeItemTx(conn, item, { why: 'The owner left Hiraman. Your credits were returned.', by: 'owner', reason: 'owner_left' });
  await conn.query('UPDATE items SET description = NULL, photo_url = NULL WHERE owner_id = ?', [u.id]);

  if (u.id_photo_path) removeFile(u.id_photo_path);
  await conn.query(
    `UPDATE users SET name = 'Deleted user', email = ?, phone = NULL, purok = NULL, password_hash = ?, id_photo_path = NULL,
       reject_reason = NULL, suspended = 1, deletion_requested_at = NULL, deleted_at = NOW(), token_version = token_version + 1 WHERE id = ?`,
    [`deleted-${u.id}@hiraman.invalid`, newPasswordHash, u.id]);
  await conn.query('DELETE FROM request_messages WHERE sender_id = ?', [u.id]);
  await conn.query('DELETE FROM wanted_posts WHERE user_id = ?', [u.id]);
  await conn.query('UPDATE request_checkins c JOIN requests r ON r.id = c.request_id SET c.note = NULL WHERE r.borrower_id = ?', [u.id]);
  await conn.query('UPDATE requests SET note = NULL WHERE borrower_id = ?', [u.id]);
  await conn.query('UPDATE ratings SET comment = NULL WHERE rater_id = ?', [u.id]);
  await conn.query('DELETE FROM notifications WHERE user_id = ?', [u.id]);
  await audit(actor.id, 'account_deleted', `user #${u.id}`, conn);
  return { id: u.id, deleted: true };
}

// ---------- verifying residents ----------
// Approving needs an ID photo (unless already approved) and gives the starter credits once.
export function approveResident(userId, actor) {
  return withTx(async (conn) => {
    const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? AND role = ? FOR UPDATE', [userId, 'resident']);
    if (!u) throw notFound('Resident not found.');
    if (!u.id_photo_path && u.verification_status !== 'approved') throw bad('This resident has not sent an ID photo yet.', 'no_id_photo');
    await conn.query("UPDATE users SET verification_status = 'approved', reject_reason = NULL, verification_decided_at = NOW() WHERE id = ?", [u.id]);
    const [[given]] = await conn.query("SELECT COUNT(*) n FROM credit_ledger WHERE user_id = ? AND reason = 'starter'", [u.id]);
    const starter = given.n ? 0 : await addCredits(conn, u.id, RULES.starterCredits, 'starter');
    await notify(conn, u.id, 'verified', 'Welcome to Hiraman!', `Your account is verified. You have ${RULES.starterCredits} starter credits.`, null, { n: RULES.starterCredits });
    await audit(actor.id, 'verification_approved', `user #${u.id} ${u.name}`, conn);
    return { id: u.id, verification_status: 'approved', starter_credits: starter };
  });
}

// Rejecting needs a reason the resident can act on.
export async function rejectResident(userId, actor, reasonText) {
  const reason = String(reasonText || '').trim();
  if (!reason) throw bad('Please give a reason so the resident can fix it.', 'reason_required');
  const u = await one('SELECT * FROM users WHERE id = ? AND role = ?', [userId, 'resident']);
  if (!u) throw notFound('Resident not found.');
  await withTx(async (conn) => {
    await conn.query("UPDATE users SET verification_status = 'rejected', reject_reason = ?, verification_decided_at = NOW() WHERE id = ?", [reason.slice(0, 255), u.id]);
    await notify(conn, u.id, 'verification_rejected', 'Verification needs a fix', reason, null, { reason });
    await audit(actor.id, 'verification_rejected', `user #${u.id} ${u.name}: ${reason}`, conn);
  });
  return { id: u.id, verification_status: 'rejected' };
}

// ---------- booking a whole kit ----------
// One request per kit line, using the first free matching item (shelf items first). Lines that cannot be
// covered (nothing free, not enough credits, already asked for) are listed as missing.
export async function bookKit(kitId, borrower, start, end) {
  assertDates(start, end);
  const kit = await one('SELECT * FROM kits WHERE id = ? AND active = 1', [kitId]);
  if (!kit) throw notFound('Kit not found.');
  const lines = await q('SELECT * FROM kit_items WHERE kit_id = ? ORDER BY id', [kit.id]);
  return withTx(async (conn) => {
    const created = [];
    const missing = [];
    const usedItems = new Set();
    for (const l of lines) {
      const [cands] = await conn.query(
        `SELECT i.id FROM items i WHERE i.status = 'available' AND i.review_status = 'ok' AND i.category_id = ?
            AND (? IS NULL OR i.title LIKE CONCAT('%', ?, '%')) AND (i.owner_id IS NULL OR i.owner_id <> ?)
            AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.item_id = i.id AND ${TAKEN_SQL('r')})
          ORDER BY i.is_shelf DESC, i.id`,
        [l.category_id, l.keyword, l.keyword, borrower.id, end, todayPH(), start]);
      const pick = cands.find((c) => !usedItems.has(c.id));
      if (!pick) { missing.push(l.label); continue; }
      usedItems.add(pick.id);
      try {
        created.push({ label: l.label, ...(await createRequestTx(conn, { borrower, itemId: pick.id, start, end, kitId: kit.id })) });
      } catch (e) {
        if (e.code === 'insufficient_credits') { missing.push(`${l.label} (not enough credits)`); continue; }
        if (e.code === 'duplicate_request') { missing.push(`${l.label} (you already asked for it)`); continue; }
        throw e;
      }
    }
    if (!created.length) throw bad('None of the items in this kit are free for those dates.', 'kit_unavailable');
    return { created, missing };
  });
}

// ---------- staff step in ----------
// Staff may cancel any request that is waiting or booked (not one already out), with a reason both sides see.
export function staffCancelRequest(requestId, actor, reason) {
  const why = String(reason || '').trim().slice(0, 200);
  if (!why) throw bad('Write the reason the neighbors will see.', 'reason_required');
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    if (!['pending', 'approved'].includes(r.status)) throw bad('Only a waiting or booked request can be cancelled.', 'bad_state');
    await conn.query("UPDATE requests SET status = 'cancelled', credits_held = 0, note = ? WHERE id = ?", [why, r.id]);
    if (r.credits_held) await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_cancelled', r.id);
    for (const userId of [r.borrower_id, r.owner_id].filter(Boolean)) {
      await notify(conn, userId, 'request_cancelled_by_staff', `Cancelled by the barangay: ${r.item_title}`, why, r.id, { item: r.item_title, reason: why });
    }
    await audit(actor.id, 'request_cancelled_by_staff', `request #${r.id}: ${why}`, conn);
    return { id: r.id, status: 'cancelled' };
  });
}

// The automatic checks hold a listing back: hidden from neighbors until staff decide. The owner is told it
// is being checked (not which check, so the filter cannot be gamed); staff see the reasons, at the top.
export async function flagItemTx(conn, itemId, flags) {
  const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
  if (!item || item.status === 'removed' || item.review_status === 'hidden' || !flags.length) return false;
  const all = [...new Set([...(item.review_flags ? item.review_flags.split(',') : []), ...flags])];
  const wasOk = item.review_status === 'ok';
  await conn.query("UPDATE items SET review_status = 'flagged', review_flags = ?, review_note = NULL WHERE id = ?", [all.join(','), item.id]);
  if (wasOk) {
    await closeOpenRequestsTx(conn, item, { why: 'The barangay is checking this item. Your credits were returned.', reason: 'hidden' });
    if (item.owner_id) {
      await notify(conn, item.owner_id, 'item_flagged', `The barangay is checking: ${item.title}`,
        'Neighbors will see it once it has been checked. This keeps everyone safe.', item.id, { item: item.title });
    }
    await audit(null, 'item_flagged', `item #${item.id} ${item.title}: ${all.join(', ')}`, conn);
  }
  return true;
}

// Staff hide a listing (neighbors stop seeing it; its open requests are refunded) or show it again.
export function hideItem(itemId, actor, reason) {
  const why = String(reason || '').trim().slice(0, 255);
  if (!why) throw bad('Write the reason the owner will see.', 'reason_required');
  return withTx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item || item.status === 'removed') throw notFound('Item not found.');
    await conn.query("UPDATE items SET review_status = 'hidden', review_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [why, actor.id, item.id]);
    await closeOpenRequestsTx(conn, item, { why: 'The barangay is checking this item. Your credits were returned.', reason: 'hidden' });
    if (item.owner_id) {
      await notify(conn, item.owner_id, 'item_hidden', `Hidden by the barangay: ${item.title}`, why, item.id, { item: item.title, reason: why });
    }
    await audit(actor.id, 'item_hidden', `item #${item.id} ${item.title}: ${why}`, conn);
    return { id: item.id, review_status: 'hidden' };
  });
}

export function showItem(itemId, actor) {
  return withTx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item || item.status === 'removed') throw notFound('Item not found.');
    await conn.query("UPDATE items SET review_status = 'ok', review_note = NULL, review_flags = NULL, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [actor.id, item.id]);
    if (item.owner_id && item.review_status !== 'ok') {
      await notify(conn, item.owner_id, 'item_shown', `Visible again: ${item.title}`, 'Neighbors can see and borrow it again.', item.id, { item: item.title });
    }
    await audit(actor.id, 'item_shown', `item #${item.id} ${item.title}`, conn);
    return { id: item.id, review_status: 'ok' };
  });
}

// ---------- settling a dispute ----------
// Staff choose one outcome (DISPUTE_OUTCOMES in rules.js); every credit change is a ledger row and nobody
// goes below 0. Only a loan that is still disputed is settled, so a second call never pays twice.
export async function settleDisputeTx(conn, requestId, outcome, actor) {
  const rule = DISPUTE_OUTCOMES[outcome];
  if (!rule) throw bad('Choose how the dispute was settled.', 'bad_outcome');
  const r = await loadRequest(conn, requestId);
  if (r.status !== 'disputed') return null;
  const result = { outcome, owner: 0, borrower: 0 };
  if (rule.normalRules) {
    const normal = await normalReturnCredits(conn, r, !!r.on_time);
    result.owner = normal.lender_reward;
    result.borrower = -normal.late_penalty;
  } else {
    if (r.owner_id && rule.owner) result.owner = await addCredits(conn, r.owner_id, rule.owner, `settle_${outcome}`, r.id);
    if (rule.borrower) result.borrower = await addCredits(conn, r.borrower_id, rule.borrower, `settle_${outcome}`, r.id);
  }
  if (rule.removeItem) {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [r.item_id]);
    await removeItemTx(conn, item, { exceptRequestId: r.id, why: 'The item was lost. Your credits were returned.', reason: 'lost' });
  }
  await conn.query("UPDATE requests SET status = 'closed', dispute_outcome = ?, settled_at = NOW() WHERE id = ?", [outcome, r.id]);
  const words = { fine: 'It was fine after all.', accident: 'It was an accident.', borrower_fault: 'The borrower was responsible.', lost: 'The item was lost.' }[outcome];
  const change = (n) => (n > 0 ? `+${n}` : String(n));
  await notify(conn, r.borrower_id, 'dispute_settled', `Settled: ${r.item_title}`, `${words} Your credits: ${change(result.borrower)}.`, r.id,
    { item: r.item_title, outcome, credits: change(result.borrower) });
  if (r.owner_id) {
    await notify(conn, r.owner_id, 'dispute_settled', `Settled: ${r.item_title}`, `${words} Your credits: ${change(result.owner)}.`, r.id,
      { item: r.item_title, outcome, credits: change(result.owner) });
  }
  await audit(actor.id, `dispute_${outcome}`, `request #${r.id}`, conn);
  return result;
}

// ---------- daily check-in while the item is out ----------
// One answer per day; answering again the same day replaces it. "I returned it" records the moment
// lateness is judged by. "There's a problem" tells the owner and opens a report for staff.
export function checkIn(requestId, actor, answer, note = null) {
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    if (r.borrower_id !== actor.id) throw forbidden('Only the borrower can check in.', 'cannot_manage');
    if (!['with_me', 'returned', 'problem'].includes(answer)) throw bad('Choose one of the check-in answers.', 'bad_checkin');
    if (r.status !== 'handed_over') throw bad('You can check in only while you have the item.', 'bad_state');
    if (r.borrower_returned_at) throw bad('You already said you returned this item.', 'already_returned');
    const text = String(note || '').trim().slice(0, 300) || null;
    if (answer === 'problem' && !text) throw bad('Tell us briefly what happened.', 'note_required');

    const today = todayPH();
    await conn.query(
      `INSERT INTO request_checkins (request_id, day, answer, note) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE answer = VALUES(answer), note = VALUES(note), created_at = CURRENT_TIMESTAMP`,
      [r.id, today, answer, text]);
    await conn.query('UPDATE requests SET checkin_alerted_on = NULL WHERE id = ?', [r.id]);
    const first = actor.name.split(' ')[0];
    if (answer === 'returned') {
      await conn.query('UPDATE requests SET borrower_returned_at = NOW() WHERE id = ?', [r.id]);
      if (r.owner_id) {
        await notify(conn, r.owner_id, 'borrower_returned', `${first} says ${r.item_title} is back`,
          r.handled_by_staff ? 'The barangay will check it and confirm the return.' : 'Check the item, then tap Confirm return.', r.id,
          { name: first, item: r.item_title, hall: !!r.handled_by_staff });
      }
    } else if (answer === 'problem') {
      await conn.query('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?)',
        [actor.id, 'request', r.id, 'checkin_problem', text]);
      if (r.owner_id) await notify(conn, r.owner_id, 'checkin_problem', `${first} reported a problem with ${r.item_title}`, text, r.id, { name: first, item: r.item_title, note: text });
    }
    return { id: r.id, day: today, answer };
  });
}

// ---------- survey and ratings ----------
export async function saveSurvey(requestId, user, answer) {
  if (!['yes', 'no', 'maybe'].includes(answer)) throw bad('Choose yes, no or maybe.', 'bad_answer');
  const r = await one('SELECT * FROM requests WHERE id = ?', [requestId]);
  if (!r || r.borrower_id !== user.id) throw forbidden('Only the borrower can answer this.', 'cannot_manage');
  if (!['closed', 'disputed'].includes(r.status)) throw bad('You can answer after the item is returned.', 'bad_state');
  await q('INSERT INTO impact_surveys (request_id, would_have_bought) VALUES (?,?) ON DUPLICATE KEY UPDATE would_have_bought = VALUES(would_have_bought)', [requestId, answer]);
  return { ok: true };
}

export async function saveRating(requestId, user, stars, comment = null) {
  stars = Number(stars);
  if (!(stars >= 1 && stars <= 5)) throw bad('Choose 1 to 5 stars.', 'bad_stars');
  const r = await one('SELECT r.*, i.owner_id FROM requests r JOIN items i ON i.id = r.item_id WHERE r.id = ?', [requestId]);
  if (!r) throw notFound('Request not found.');
  if (!['closed', 'disputed'].includes(r.status)) throw bad('You can rate after the item is returned.', 'bad_state');
  let rateeId;
  if (user.id === r.borrower_id) rateeId = r.owner_id;
  else if (user.id === r.owner_id) rateeId = r.borrower_id;
  else throw forbidden('You were not part of this loan.', 'cannot_manage');
  if (!rateeId) throw bad('Shelf items are not rated.', 'shelf_item');
  await requireKind(user, `rating on request #${requestId}`, comment);
  await q(
    'INSERT INTO ratings (request_id, rater_id, ratee_id, stars, comment) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE stars = VALUES(stars), comment = VALUES(comment)',
    [requestId, user.id, rateeId, stars, comment]);
  return { ok: true };
}
