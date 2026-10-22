// Business logic that both the resident API and the LGU portal API share.
import { q, one, withTx, todayPH } from './db.js';
import { bad, forbidden, notFound } from './errors.js';
import { RULES, DISPUTE_OUTCOMES, creditCost, handledByStaff, autoApproves } from './rules.js';

// ---------- small helpers ----------
export async function notify(conn, userId, type, title, body = null, refId = null) {
  await conn.query(
    'INSERT INTO notifications (user_id, type, title, body, ref_id) VALUES (?,?,?,?,?)',
    [userId, type, title, body, refId],
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
  if (!item || item.status !== 'available') throw bad('This item is not available right now.', 'item_unavailable');
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
      await notify(conn, item.owner_id, 'request_new', `${first} wants to borrow ${item.title}`, `${start} to ${end}. Open Requests to approve or reject.`, requestId);
    } else if (status === 'approved') {
      await notify(conn, item.owner_id, 'request_auto', `${first} is borrowing ${item.title}`, `${start} to ${end}. Hand it over at ${staffHandled ? 'the barangay hall' : 'the pickup point'}.`, requestId);
    } else {
      await notify(conn, item.owner_id, 'request_staff', `${first} requested ${item.title}`, 'The barangay will handle approval and handover for this item.', requestId);
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
        r.handled_by_staff ? 'Pick it up at the barangay hall.' : 'Message the owner and agree on the pickup point.', r.id);
    } else {
      await conn.query("UPDATE requests SET status = 'rejected', note = COALESCE(?, note) WHERE id = ?", [reason, r.id]);
      if (r.credits_held) {
        await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_rejected', r.id);
        await conn.query('UPDATE requests SET credits_held = 0 WHERE id = ?', [r.id]);
      }
      await notify(conn, r.borrower_id, 'request_rejected', `Not approved: ${r.item_title}`, reason || 'Your credits were returned.', r.id);
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
    if (r.owner_id) await notify(conn, r.owner_id, 'request_cancelled', `Cancelled: ${r.item_title}`, 'The borrower cancelled the request.', r.id);
    return { id: r.id, status: 'cancelled' };
  });
}

// ---------- hand over ----------
export function handOver(requestId, actor, photo = null) {
  return withTx(async (conn) => {
    const r = await loadRequest(conn, requestId);
    assertCanManage(r, actor);
    if (r.status !== 'approved') throw bad('Only an approved request can be handed over.', 'bad_state');
    if (r.tier !== 'low' && !photo) throw bad('A condition photo is required for this item.', 'photo_required');
    await conn.query("UPDATE requests SET status = 'handed_over', handed_over_at = NOW(), handover_photo = ?, checkin_since = ? WHERE id = ?", [photo, todayPH(), r.id]);
    await notify(conn, r.borrower_id, 'handover', `You have ${r.item_title}`, `Please return it by ${r.end_date}. Check in once a day in the app until you return it.`, r.id);
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
      await notify(conn, r.owner_id, 'credit_earned', `+${RULES.lenderReward} credit`, `Thank you for lending ${r.item_title}.`, r.id);
    } else {
      await notify(conn, r.owner_id, 'credit_capped', 'Thanks for lending again', 'You reached the monthly reward limit for this neighbor, so no credit this time.', r.id);
    }
  }
  if (!onTime) {
    out.late_penalty = -(await addCredits(conn, r.borrower_id, -RULES.latePenalty, 'late_penalty', r.id));
    await notify(conn, r.borrower_id, 'late_return', 'Returned late', `${RULES.latePenalty} credit was taken. Please return on time next time.`, r.id);
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
    if (r.tier !== 'low' && condition === 'good' && !photo) throw bad('A condition photo is required for this item.', 'photo_required');

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
      await notify(conn, r.borrower_id, 'return_confirmed', `Return confirmed: ${r.item_title}`, 'Quick question: would you have bought or rented this otherwise?', r.id);
    } else {
      // Damaged or lost goes to barangay mediation. No lender reward until it is settled.
      await conn.query(
        "UPDATE requests SET status='disputed', returned_at=NOW(), return_condition=?, on_time=?, return_photo=?, note=COALESCE(?, note) WHERE id=?",
        [condition, onTime, photo, note, r.id]);
      await conn.query(
        'INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?)',
        [actor.id, 'request', r.id, `item_${condition}`, note || `Item reported ${condition} at return.`]);
      await notify(conn, r.borrower_id, 'dispute', `Return of ${r.item_title} needs review`, 'The barangay will contact you to settle this.', r.id);
      result.status = 'disputed';
    }
    if (actor.role !== 'resident') await audit(actor.id, `return_${condition}`, `request #${r.id}`, conn);
    return result;
  });
}

// ---------- removing an item ----------
// The item stops being listed. Its waiting and booked requests are rejected and their credits refunded.
// `conn` is an open transaction. The caller decides whether an item out on loan may be removed.
export async function removeItemTx(conn, item, { exceptRequestId = 0, why = 'Your credits were returned.' } = {}) {
  await conn.query("UPDATE items SET status = 'removed' WHERE id = ?", [item.id]);
  const [open] = await conn.query("SELECT * FROM requests WHERE item_id = ? AND id <> ? AND status IN ('pending','approved') FOR UPDATE", [item.id, exceptRequestId]);
  for (const r of open) {
    await conn.query("UPDATE requests SET status = 'rejected', credits_held = 0 WHERE id = ?", [r.id]);
    if (r.credits_held) await addCredits(conn, r.borrower_id, r.credit_cost, 'refund_item_removed', r.id);
    await notify(conn, r.borrower_id, 'request_rejected', `Item removed: ${item.title}`, why, r.id);
  }
  return open.length;
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
    await removeItemTx(conn, item, { exceptRequestId: r.id, why: 'The item was lost. Your credits were returned.' });
  }
  await conn.query("UPDATE requests SET status = 'closed', dispute_outcome = ?, settled_at = NOW() WHERE id = ?", [outcome, r.id]);
  const words = { fine: 'It was fine after all.', accident: 'It was an accident.', borrower_fault: 'The borrower was responsible.', lost: 'The item was lost.' }[outcome];
  const change = (n) => (n > 0 ? `+${n}` : String(n));
  await notify(conn, r.borrower_id, 'dispute_settled', `Settled: ${r.item_title}`, `${words} Your credits: ${change(result.borrower)}.`, r.id);
  if (r.owner_id) await notify(conn, r.owner_id, 'dispute_settled', `Settled: ${r.item_title}`, `${words} Your credits: ${change(result.owner)}.`, r.id);
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
          r.handled_by_staff ? 'The barangay will check it and confirm the return.' : 'Check the item, then tap Confirm return.', r.id);
      }
    } else if (answer === 'problem') {
      await conn.query('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?)',
        [actor.id, 'request', r.id, 'checkin_problem', text]);
      if (r.owner_id) await notify(conn, r.owner_id, 'checkin_problem', `${first} reported a problem with ${r.item_title}`, text, r.id);
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
  await q(
    'INSERT INTO ratings (request_id, rater_id, ratee_id, stars, comment) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE stars = VALUES(stars), comment = VALUES(comment)',
    [requestId, user.id, rateeId, stars, comment]);
  return { ok: true };
}
