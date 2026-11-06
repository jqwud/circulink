// Ambag points (batches 35-37): recognition for verified sharing, spent on LGU rewards at the barangay hall.
//
// They live in the same credit_ledger as borrow credits, in their own account ('reward'), with a cached
// balance in users.reward_points updated in the same transaction. Borrow credits are never touched here, the
// Tiwala score never reads or writes points, points cannot be moved between residents and have no cash value.
//
// Every earned award is a "lot": it expires RULES.pointsExpiryMonths after it was earned and tracks what is
// left of it (remaining). Spending takes the oldest lots first and records which lots paid (points_allocations),
// so a refund puts the points back where they came from. At all times, per resident:
//   users.reward_points = SUM(ledger amounts, account 'reward') = SUM(remaining of the lots)
// The nightly reconciliation checks both and reports any difference to admins instead of changing balances.
//
// Duplicates: every award, spend, refund and expiry has an award_key (UNIQUE in the database). It is checked
// while the resident's row is locked, and the unique index is the last line of defence.
import { q, one, withTx, todayPH } from './db.js';
import { RULES } from './rules.js';
import { bad, forbidden, notFound } from './errors.js';
import { addDays, audit as logAudit, ledgerEntry, notify } from './services.js';
import { TIWALA } from './tiwala.js';

export const ACTIVITIES = ['loan_lender', 'loan_borrower', 'donation_donor', 'wanted_helper', 'community'];
const first = (n) => String(n || '').split(' ')[0];

// ---------- dates ----------
export function addMonths(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export const quarterOf = (ymd) => `${ymd.slice(0, 4)}-Q${Math.floor((Number(ymd.slice(5, 7)) - 1) / 3) + 1}`;
export const quarterStart = (ymd) => `${ymd.slice(0, 4)}-${String(Math.floor((Number(ymd.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
const ymdOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));

// ---------- the ledger (reward account) ----------
async function lockUser(conn, userId) {
  const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (!u) throw notFound('Resident not found.');
  return u;
}

async function keyUsed(conn, key) {
  const [[row]] = await conn.query('SELECT id FROM credit_ledger WHERE award_key = ?', [key]);
  return !!row;
}

// One reward-account row plus the cached balance (services.ledgerEntry). The caller has locked the user row.
const writeRow = (conn, userId, amount, reason, o = {}) =>
  ledgerEntry(conn, userId, amount, reason, { ...o, account: 'reward', requestId: o.sourceType === 'request' ? o.sourceId : null });

// audit_log.target holds 120 characters.
const audit = (actorId, action, target, conn) => logAudit(actorId, action, String(target).slice(0, 120), conn);

// Earned points: a new lot that expires RULES.pointsExpiryMonths from today.
async function earnLot(conn, userId, amount, reason, o = {}) {
  return writeRow(conn, userId, amount, reason, { ...o, expiresOn: addMonths(todayPH(), RULES.pointsExpiryMonths), remaining: amount });
}

// What a resident can spend now: lots not yet expired, oldest first. Expired points never count, even before
// the nightly expiry job has written them off.
async function spendableLots(conn, userId, today = todayPH()) {
  const [lots] = await conn.query(
    `SELECT id, remaining, expires_on FROM credit_ledger
      WHERE user_id = ? AND account = 'reward' AND remaining > 0 AND expires_on >= ? ORDER BY expires_on, id FOR UPDATE`, [userId, today]);
  return lots;
}
export async function spendableNow(userId, today = todayPH()) {
  const r = await one(
    "SELECT COALESCE(SUM(remaining), 0) AS n FROM credit_ledger WHERE user_id = ? AND account = 'reward' AND remaining > 0 AND expires_on >= ?", [userId, today]);
  return Number(r.n);
}

// Spends points (a redemption, or an admin correction downwards). Refuses rather than going below zero.
export async function spendPoints(conn, userId, amount, reason, o = {}) {
  if (!Number.isInteger(amount) || amount <= 0) throw bad('Points must be a whole number above zero.', 'bad_points');
  await lockUser(conn, userId);
  if (o.key && (await keyUsed(conn, o.key))) throw bad('This was already done.', 'duplicate');
  const lots = await spendableLots(conn, userId);
  const have = lots.reduce((a, l) => a + l.remaining, 0);
  if (have < amount) throw bad(`Not enough Ambag points: you have ${have}, this needs ${amount}.`, 'not_enough_points');
  const spendId = await writeRow(conn, userId, -amount, reason, o);
  let left = amount;
  for (const lot of lots) {
    if (!left) break;
    const take = Math.min(left, lot.remaining);
    await conn.query('UPDATE credit_ledger SET remaining = remaining - ? WHERE id = ?', [take, lot.id]);
    await conn.query('INSERT INTO points_allocations (spend_id, lot_id, amount) VALUES (?,?,?)', [spendId, lot.id, take]);
    left -= take;
  }
  return spendId;
}

// Gives back a spend exactly once (a rejected, cancelled or expired redemption). Points return to their own
// lots with their own expiry dates; any part whose lot has expired in the meantime is written off at once.
export async function refundSpend(conn, spendId, reason, o = {}) {
  const [[spend]] = await conn.query("SELECT * FROM credit_ledger WHERE id = ? AND account = 'reward' FOR UPDATE", [spendId]);
  if (!spend || spend.amount >= 0) return 0;
  await lockUser(conn, spend.user_id);
  const key = `refund:${spendId}`;
  if (await keyUsed(conn, key)) return 0;
  const today = todayPH();
  const amount = -spend.amount;
  const refundId = await writeRow(conn, spend.user_id, amount, reason, { ...o, reversalOf: spendId, key });
  const [allocs] = await conn.query(
    'SELECT a.lot_id, a.amount, l.expires_on FROM points_allocations a JOIN credit_ledger l ON l.id = a.lot_id WHERE a.spend_id = ? FOR UPDATE', [spendId]);
  let gone = 0;
  for (const a of allocs) {
    if (ymdOf(a.expires_on) >= today) await conn.query('UPDATE credit_ledger SET remaining = remaining + ? WHERE id = ?', [a.amount, a.lot_id]);
    else gone += a.amount;
  }
  if (gone) await writeRow(conn, spend.user_id, -gone, 'points_expired', { reversalOf: refundId, key: `expire:refund:${refundId}`, note: 'Returned points whose time had already ended' });
  return amount - gone;
}

// ---------- who may earn ----------
// A verified resident in good standing. A Tiwala collusion freeze pauses earning and redeeming; nothing else
// about the Tiwala score matters here, and points never change the score.
export function residentOk(u, today = todayPH()) {
  return !!u && u.role === 'resident' && u.verification_status === 'approved' && !u.suspended && !u.deleted_at
    && !(u.tiwala_frozen_until && ymdOf(u.tiwala_frozen_until) >= today);
}

function parsePuroks(v) {
  if (!v) return null;
  const list = typeof v === 'string' ? JSON.parse(v) : v;
  return Array.isArray(list) && list.length ? list : null;
}

export function campaignEligible(u, c, today = todayPH()) {
  if (!residentOk(u, today)) return false;
  const puroks = parsePuroks(c.puroks);
  if (puroks && !puroks.includes(u.purok)) return false;
  if (c.min_account_days) {
    const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ymdOf(u.created_at)}T00:00:00Z`)) / 864e5);
    if (days < c.min_account_days) return false;
  }
  return true;
}

export const campaignRunning = (c, today = todayPH()) =>
  c.status === 'active' && (!c.starts_on || ymdOf(c.starts_on) <= today) && (!c.ends_on || ymdOf(c.ends_on) >= today);

async function earnedSince(conn, userId, since, campaignId = null) {
  const [[r]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS n FROM credit_ledger
      WHERE user_id = ? AND account = 'reward' AND reason LIKE 'earn\\_%' AND created_at >= ? ${campaignId ? 'AND campaign_id = ?' : ''}`,
    campaignId ? [userId, since, campaignId] : [userId, since]);
  return Number(r.n);
}

// ---------- earning ----------
// Awards points for one verified event to one resident, from every running campaign with a rule for this
// activity. Each campaign's award has its own key, so replaying the event (a retry, a job running twice, a
// second confirmation) never pays again. The quarterly cap covers all activities and campaigns together;
// each campaign can also cap a resident and its own total. Returns the points given.
export async function awardPoints(conn, { userId, activity, sourceType, sourceId, item = null, points = null, campaignId = null, actorId = null, note = null }) {
  if (!ACTIVITIES.includes(activity)) throw new Error(`Unknown activity ${activity}`);
  const today = todayPH();
  const u = await lockUser(conn, userId);
  if (!residentOk(u, today)) return 0;
  const [camps] = await conn.query(
    `SELECT c.*, r.points AS rule_points FROM reward_campaigns c JOIN campaign_rules r ON r.campaign_id = c.id AND r.activity = ?
      WHERE c.status = 'active' ${campaignId ? 'AND c.id = ?' : ''} ORDER BY c.is_base DESC, c.id`,
    campaignId ? [activity, campaignId] : [activity]);
  const qStart = quarterStart(today);
  let total = 0;
  for (const c of camps) {
    if (!campaignRunning(c, today) || !campaignEligible(u, c, today)) continue;
    const key = `${activity}:${sourceType}:${sourceId}:c${c.id}`;
    if (await keyUsed(conn, key)) continue;
    let pts = points ?? c.rule_points;
    pts = Math.min(pts, RULES.pointsQuarterCap - (await earnedSince(conn, userId, qStart)));
    let usedHere = 0;
    if (c.resident_cap) {
      usedHere = await earnedSince(conn, userId, '1970-01-01', c.id);
      pts = Math.min(pts, c.resident_cap - usedHere);
    }
    if (c.total_cap) {
      await conn.query('SELECT id FROM reward_campaigns WHERE id = ? FOR UPDATE', [c.id]);
      const [[all]] = await conn.query("SELECT COALESCE(SUM(amount), 0) AS n FROM credit_ledger WHERE campaign_id = ? AND account = 'reward' AND reason LIKE 'earn\\_%'", [c.id]);
      pts = Math.min(pts, c.total_cap - Number(all.n));
    }
    if (!(pts > 0)) continue;
    await earnLot(conn, userId, pts, `earn_${activity}`, { sourceType, sourceId, campaignId: c.id, key, actorId, note });
    total += pts;
    if (c.resident_cap && usedHere < c.resident_cap && usedHere + pts >= c.resident_cap) {
      await notify(conn, userId, 'campaign_milestone', `You completed ${c.name_en}`, `You earned the most points this campaign gives: ${c.resident_cap}. Salamat!`, c.id,
        { campaign: c.name_en, campaign_fil: c.name_fil, n: c.resident_cap });
    }
  }
  if (total) {
    await notify(conn, userId, 'points_earned', `+${total} Ambag points`, item ? `Thank you for sharing: ${item}.` : 'Thank you for helping your community.', sourceId,
      { n: total, activity, item });
  }
  return total;
}

// The pair rules the Tiwala score uses, so points cannot be farmed between friends: in 90 days at most
// TIWALA.perBorrowerMax awarded loans per pair and TIWALA.perItemMax per item, and lending back and forth with
// the same person TIWALA.loopLoans times stops both sides earning from each other.
async function pairCount(conn, userId, reason, otherSql, otherId) {
  const [[r]] = await conn.query(
    `SELECT COUNT(DISTINCT l.source_id) AS n FROM credit_ledger l JOIN requests x ON x.id = l.source_id JOIN items i ON i.id = x.item_id
      WHERE l.user_id = ? AND l.account = 'reward' AND l.reason = ? AND l.source_type = 'request' AND ${otherSql} = ?
        AND l.created_at >= NOW() - INTERVAL ? DAY`, [userId, reason, otherId, TIWALA.windowDays]);
  return Number(r.n);
}

async function inLoop(conn, a, b) {
  if (!a || !b) return false;
  const [[r]] = await conn.query(
    `SELECT SUM(i.owner_id = ? AND x.borrower_id = ?) AS ab, SUM(i.owner_id = ? AND x.borrower_id = ?) AS ba
       FROM requests x JOIN items i ON i.id = x.item_id
      WHERE x.status IN ('closed','disputed') AND x.returned_at >= NOW() - INTERVAL ? DAY
        AND ((i.owner_id = ? AND x.borrower_id = ?) OR (i.owner_id = ? AND x.borrower_id = ?))`,
    [a, b, b, a, TIWALA.windowDays, a, b, b, a]);
  const ab = Number(r.ab || 0); const ba = Number(r.ba || 0);
  return ab > 0 && ba > 0 && ab + ba >= TIWALA.loopLoans;
}

// A loan that came back good and on time (a normal return, or a dispute settled as "fine"). The lender earns
// for lending; the borrower earns a little for returning on time. Nothing for same-day loans.
export async function awardLoanPoints(conn, r, onTime) {
  const out = { lender: 0, borrower: 0 };
  if (!onTime || !r.handed_over_at) return out;
  const returnedDay = r.borrower_returned_at ? ymdOf(r.borrower_returned_at) : r.returned_at ? ymdOf(r.returned_at) : todayPH();
  if (returnedDay <= ymdOf(r.handed_over_at)) return out;
  const loop = await inLoop(conn, r.owner_id, r.borrower_id);
  if (r.owner_id && r.owner_id !== r.borrower_id && !loop) {
    const [[b]] = await conn.query('SELECT verification_decided_at FROM users WHERE id = ?', [r.borrower_id]);
    const verifiedDays = b?.verification_decided_at ? Math.floor((Date.parse(r.handed_over_at) - Date.parse(b.verification_decided_at)) / 864e5) : 0;
    if (verifiedDays >= TIWALA.borrowerVerifiedDays
      && (await pairCount(conn, r.owner_id, 'earn_loan_lender', 'x.borrower_id', r.borrower_id)) < TIWALA.perBorrowerMax
      && (await pairCount(conn, r.owner_id, 'earn_loan_lender', 'x.item_id', r.item_id)) < TIWALA.perItemMax) {
      out.lender = await awardPoints(conn, { userId: r.owner_id, activity: 'loan_lender', sourceType: 'request', sourceId: r.id, item: r.item_title });
    }
  }
  if (r.owner_id !== r.borrower_id && !loop) {
    const pair = r.owner_id
      ? await pairCount(conn, r.borrower_id, 'earn_loan_borrower', 'i.owner_id', r.owner_id)
      : await pairCount(conn, r.borrower_id, 'earn_loan_borrower', 'x.item_id', r.item_id);
    if (pair < TIWALA.perBorrowerMax) {
      out.borrower = await awardPoints(conn, { userId: r.borrower_id, activity: 'loan_borrower', sourceType: 'request', sourceId: r.id, item: r.item_title });
    }
  }
  return out;
}

// A donation that reached 'given' (both sides confirmed). Only the donor earns, only for a listing that
// passed the barangay's review, only to a receiver verified long enough, and at most TIWALA.perBorrowerMax
// times per donor and receiver in 90 days. The receiver never earns and never pays points.
export async function awardDonationPoints(conn, c) {
  if (!c.donor_id || c.donor_id === c.claimer_id) return 0;
  const [[item]] = await conn.query('SELECT review_status, title FROM items WHERE id = ?', [c.item_id]);
  if (!item || item.review_status !== 'ok') return 0;
  const [[claimer]] = await conn.query('SELECT verification_decided_at FROM users WHERE id = ?', [c.claimer_id]);
  const verifiedDays = claimer?.verification_decided_at ? Math.floor((Date.now() - Date.parse(claimer.verification_decided_at)) / 864e5) : 0;
  if (verifiedDays < TIWALA.borrowerVerifiedDays) return 0;
  const [[pair]] = await conn.query(
    `SELECT COUNT(*) AS n FROM credit_ledger l JOIN donation_claims d ON d.id = l.source_id
      WHERE l.user_id = ? AND l.account = 'reward' AND l.reason = 'earn_donation_donor' AND l.source_type = 'claim' AND d.claimer_id = ?
        AND l.created_at >= NOW() - INTERVAL ? DAY`, [c.donor_id, c.claimer_id, TIWALA.windowDays]);
  if (Number(pair.n) >= TIWALA.perBorrowerMax) return 0;
  return awardPoints(conn, { userId: c.donor_id, activity: 'donation_donor', sourceType: 'claim', sourceId: c.id, item: item.title });
}

// ---------- the wanted board ----------
// The loans and donations that could have fulfilled a wanted post: the poster received them after posting,
// they finished well, and no other post claims them.
export async function wantedMatches(post) {
  const loans = await q(
    `SELECT r.id, i.title, o.name AS helper FROM requests r JOIN items i ON i.id = r.item_id JOIN users o ON o.id = i.owner_id
      WHERE r.borrower_id = ? AND r.status = 'closed' AND r.return_condition = 'good' AND r.created_at >= ? AND i.owner_id <> r.borrower_id
        AND NOT EXISTS (SELECT 1 FROM wanted_posts w WHERE w.fulfilled_request_id = r.id) ORDER BY r.id DESC LIMIT 20`, [post.user_id, post.created_at]);
  const gifts = await q(
    `SELECT c.id, i.title, o.name AS helper FROM donation_claims c JOIN items i ON i.id = c.item_id JOIN users o ON o.id = i.owner_id
      WHERE c.claimer_id = ? AND c.status = 'given' AND c.created_at >= ? AND i.owner_id <> c.claimer_id
        AND NOT EXISTS (SELECT 1 FROM wanted_posts w WHERE w.fulfilled_claim_id = c.id) ORDER BY c.id DESC LIMIT 20`, [post.user_id, post.created_at]);
  return [
    ...loans.map((l) => ({ kind: 'request', id: l.id, title: l.title, helper: first(l.helper) })),
    ...gifts.map((g) => ({ kind: 'claim', id: g.id, title: g.title, helper: first(g.helper) })),
  ];
}

// Closing a wanted post. "Fulfilled" alone earns nobody anything; linking it to the loan or donation that
// fulfilled it (one of wantedMatches) gives the helper points once.
export function closeWanted(postId, user, { fulfilled, requestId = null, claimId = null }) {
  return withTx(async (conn) => {
    const [[w]] = await conn.query('SELECT * FROM wanted_posts WHERE id = ? FOR UPDATE', [postId]);
    if (!w || w.user_id !== user.id) throw forbidden('This is not your post.', 'cannot_manage');
    if (w.status !== 'open' && !(fulfilled && w.status === 'fulfilled' && !w.fulfilled_request_id && !w.fulfilled_claim_id)) {
      throw bad('This post is already closed.', 'bad_state');
    }
    if (!fulfilled) {
      await conn.query("UPDATE wanted_posts SET status = 'closed' WHERE id = ?", [w.id]);
      return { id: w.id, status: 'closed', points: 0 };
    }
    let helper = null; let ref = null;
    if (requestId || claimId) {
      const match = (await wantedMatches(w)).find((m) => (requestId ? m.kind === 'request' && m.id === Number(requestId) : m.kind === 'claim' && m.id === Number(claimId)));
      if (!match) throw bad('Choose a loan or gift you received after posting.', 'bad_match');
      const [[row]] = requestId
        ? await conn.query('SELECT i.owner_id AS helper FROM requests r JOIN items i ON i.id = r.item_id WHERE r.id = ?', [match.id])
        : await conn.query('SELECT i.owner_id AS helper FROM donation_claims c JOIN items i ON i.id = c.item_id WHERE c.id = ?', [match.id]);
      helper = row.helper; ref = match;
    }
    await conn.query("UPDATE wanted_posts SET status = 'fulfilled', fulfilled_request_id = ?, fulfilled_claim_id = ? WHERE id = ?",
      [ref?.kind === 'request' ? ref.id : null, ref?.kind === 'claim' ? ref.id : null, w.id]);
    const points = helper ? await awardPoints(conn, { userId: helper, activity: 'wanted_helper', sourceType: 'wanted', sourceId: w.id, item: w.title }) : 0;
    return { id: w.id, status: 'fulfilled', points };
  });
}

// ---------- community activities that staff record (a clean-up drive, a repair day) ----------
export async function recordActivity(campaignId, userIds, note, actor) {
  const text = String(note || '').trim();
  if (text.length < 3) throw bad('Write what the residents did.', 'note_required');
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length || ids.length > 200) throw bad('Choose 1 to 200 residents.', 'bad_residents');
  const c = await one('SELECT c.*, r.points FROM reward_campaigns c LEFT JOIN campaign_rules r ON r.campaign_id = c.id AND r.activity = ? WHERE c.id = ?', ['community', campaignId]);
  if (!c) throw notFound('Campaign not found.');
  if (!c.points) throw bad('This campaign gives no points for community activities. Add the activity to the campaign first.', 'no_rule');
  if (!campaignRunning(c)) throw bad('This campaign is not running.', 'campaign_closed');
  const results = [];
  for (const uid of ids) {
    results.push(await withTx(async (conn) => {
      const [ins] = await conn.query('INSERT INTO campaign_activities (campaign_id, user_id, note, recorded_by) VALUES (?,?,?,?)', [c.id, uid, text.slice(0, 255), actor.id]);
      const pts = await awardPoints(conn, { userId: uid, activity: 'community', sourceType: 'activity', sourceId: ins.insertId, campaignId: c.id, actorId: actor.id, note: text, item: text });
      await conn.query('UPDATE campaign_activities SET points = ? WHERE id = ?', [pts, ins.insertId]);
      await audit(actor.id, 'campaign_activity', `campaign #${c.id} user #${uid}: ${pts} points (${text.slice(0, 80)})`, conn);
      return { user_id: uid, points: pts };
    }));
  }
  return results;
}

// ---------- admin corrections ----------
// Admins correct a balance with a reason. Nobody corrects their own account. Big corrections wait for a
// second admin. Every step is audited; the correction itself is an ordinary ledger row.
export async function requestAdjustment(userId, amount, reason, actor) {
  const n = Number(amount);
  const why = String(reason || '').trim();
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > RULES.pointsAdjustMax) throw bad(`Write a whole number of points from 1 to ${RULES.pointsAdjustMax}, with - to take away.`, 'bad_points');
  if (why.length < 5) throw bad('Write the reason for this correction.', 'reason_required');
  if (Number(userId) === actor.id) throw forbidden('You cannot correct your own points.', 'own_account');
  return withTx(async (conn) => {
    const u = await lockUser(conn, Number(userId));
    if (u.role !== 'resident') throw bad('Only residents have Ambag points.', 'not_resident');
    const [ins] = await conn.query('INSERT INTO points_adjustments (user_id, amount, reason, requested_by) VALUES (?,?,?,?)', [u.id, n, why.slice(0, 255), actor.id]);
    await audit(actor.id, 'points_adjust_requested', `user #${u.id} ${n > 0 ? '+' : ''}${n}: ${why.slice(0, 120)}`, conn);
    if (Math.abs(n) > RULES.pointsAdjustSecondAbove) return { id: ins.insertId, status: 'pending' };
    return applyAdjustment(conn, ins.insertId, actor);
  });
}

async function applyAdjustment(conn, id, actor) {
  const [[a]] = await conn.query('SELECT * FROM points_adjustments WHERE id = ? FOR UPDATE', [id]);
  const o = { sourceType: 'adjustment', sourceId: a.id, actorId: actor.id, note: a.reason, key: `adjust:${a.id}` };
  const ledgerId = a.amount > 0
    ? await (async () => { await lockUser(conn, a.user_id); return earnLot(conn, a.user_id, a.amount, 'adjustment', o); })()
    : await spendPoints(conn, a.user_id, -a.amount, 'adjustment', o);
  await conn.query("UPDATE points_adjustments SET status = 'approved', decided_by = ?, decided_at = NOW(), ledger_id = ? WHERE id = ?", [actor.id, ledgerId, a.id]);
  await notify(conn, a.user_id, 'points_adjusted', `Ambag points ${a.amount > 0 ? '+' : ''}${a.amount}`, `The barangay corrected your points: ${a.reason}`, a.id,
    { n: a.amount, reason: a.reason });
  await audit(actor.id, 'points_adjusted', `adjustment #${a.id} user #${a.user_id} ${a.amount > 0 ? '+' : ''}${a.amount}`, conn);
  return { id: a.id, status: 'approved', ledger_id: ledgerId };
}

export function decideAdjustment(id, approve, actor) {
  return withTx(async (conn) => {
    const [[a]] = await conn.query('SELECT * FROM points_adjustments WHERE id = ? FOR UPDATE', [id]);
    if (!a) throw notFound('Correction not found.');
    if (a.status !== 'pending') throw bad('This correction was already decided.', 'bad_state');
    if (a.requested_by === actor.id) throw forbidden('A second admin must approve this correction.', 'second_admin');
    if (a.user_id === actor.id) throw forbidden('You cannot correct your own points.', 'own_account');
    if (!approve) {
      await conn.query("UPDATE points_adjustments SET status = 'rejected', decided_by = ?, decided_at = NOW() WHERE id = ?", [actor.id, a.id]);
      await audit(actor.id, 'points_adjust_rejected', `adjustment #${a.id}`, conn);
      return { id: a.id, status: 'rejected' };
    }
    return applyAdjustment(conn, a.id, actor);
  });
}

// ---------- daily: expiry, reminders, reconciliation ----------
export async function runPoints(now = new Date()) {
  const today = todayPH(now);
  const out = { expired: 0, residents_expired: 0, reminded: 0, mismatches: 0 };
  const due = await q("SELECT DISTINCT user_id FROM credit_ledger WHERE account = 'reward' AND remaining > 0 AND expires_on < ?", [today]);
  for (const { user_id: uid } of due) {
    const n = await withTx(async (conn) => {
      await lockUser(conn, uid);
      const [lots] = await conn.query(
        "SELECT id, remaining FROM credit_ledger WHERE user_id = ? AND account = 'reward' AND remaining > 0 AND expires_on < ? FOR UPDATE", [uid, today]);
      let sum = 0;
      for (const lot of lots) {
        const [[k]] = await conn.query("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason = 'points_expired' AND source_type = 'lot' AND source_id = ?", [lot.id]);
        await writeRow(conn, uid, -lot.remaining, 'points_expired', { sourceType: 'lot', sourceId: lot.id, key: `expire:${lot.id}:${Number(k.n) + 1}` });
        await conn.query('UPDATE credit_ledger SET remaining = 0 WHERE id = ?', [lot.id]);
        sum += lot.remaining;
      }
      if (sum) await notify(conn, uid, 'points_expired', `${sum} Ambag points expired`, 'Points last 12 months. Keep sharing to earn more.', null, { n: sum, months: RULES.pointsExpiryMonths });
      return sum;
    });
    if (n) { out.expired += n; out.residents_expired++; }
  }
  const warnOn = addDays(today, RULES.pointsExpiryWarnDays);
  const soon = await q(
    "SELECT user_id, SUM(remaining) AS n FROM credit_ledger WHERE account = 'reward' AND remaining > 0 AND expires_on > ? AND expires_on <= ? GROUP BY user_id",
    [today, warnOn]);
  for (const s of soon) {
    const told = await one(
      "SELECT id FROM notifications WHERE user_id = ? AND type = 'points_expiring' AND created_at >= NOW() - INTERVAL ? DAY LIMIT 1", [s.user_id, RULES.pointsExpiryWarnDays]);
    if (told) continue;
    await notify({ query: q }, s.user_id, 'points_expiring', 'Ambag points expiring soon', `${s.n} points expire by ${warnOn}. Use them for a reward at the barangay hall.`, null,
      { n: Number(s.n), date: warnOn });
    out.reminded++;
  }
  const wrong = await reconcile();
  out.mismatches = wrong.length;
  if (wrong.length) {
    console.error(`[hiraman] Ambag points do not add up for ${wrong.length} resident(s): ${wrong.map((b) => `#${b.user_id}`).join(', ')}`);
    await audit(null, 'points_mismatch', wrong.slice(0, 5).map((b) => `#${b.user_id} cached ${b.cached} ledger ${b.ledger} lots ${b.lots}`).join('; '));
  }
  return out;
}

// Compares the cached balance with the ledger and with the lots. Read-only: differences are reported, never fixed silently.
export async function reconcile() {
  const rows = await q(
    `SELECT u.id AS user_id, u.reward_points AS cached,
            COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.user_id = u.id AND l.account = 'reward'), 0) AS ledger,
            COALESCE((SELECT SUM(remaining) FROM credit_ledger l WHERE l.user_id = u.id AND l.account = 'reward' AND l.remaining IS NOT NULL), 0) AS lots
       FROM users u`);
  return rows.map((r) => ({ user_id: r.user_id, cached: Number(r.cached), ledger: Number(r.ledger), lots: Number(r.lots) }))
    .filter((r) => r.cached !== r.ledger || r.ledger !== r.lots);
}

// ---------- what a resident sees ----------
const SOURCE_SQL = `
  LEFT JOIN requests rq ON l.source_type = 'request' AND rq.id = l.source_id LEFT JOIN items ri ON ri.id = rq.item_id
  LEFT JOIN donation_claims dc ON l.source_type = 'claim' AND dc.id = l.source_id LEFT JOIN items di ON di.id = dc.item_id
  LEFT JOIN wanted_posts wp ON l.source_type = 'wanted' AND wp.id = l.source_id
  LEFT JOIN vouchers vo ON l.source_type = 'voucher' AND vo.id = l.source_id LEFT JOIN reward_catalog vc ON vc.id = vo.catalog_id
  LEFT JOIN reward_campaigns cp ON cp.id = l.campaign_id`;
const SOURCE_COLS = `COALESCE(ri.title, di.title, wp.title, vc.name_en) AS about, vc.name_fil AS about_fil, cp.name_en AS campaign, cp.name_fil AS campaign_fil,
  (SELECT MIN(x.reason) FROM credit_ledger x WHERE x.reversal_of = l.id AND x.reason LIKE 'refund%') AS refunded`;

export const ledgerRow = (l) => ({
  id: l.id, amount: l.amount, reason: l.reason, created_at: l.created_at, source_type: l.source_type, source_id: l.source_id,
  about: l.about || null, about_fil: l.about_fil || l.about || null, campaign: l.campaign || null, campaign_fil: l.campaign_fil || null,
  note: l.reason === 'adjustment' || l.reason === 'earn_community' ? l.note : null,
  expires_on: l.expires_on || null, remaining: l.remaining,
  status: l.refunded ? 'reversed' : l.reversal_of ? 'reversal' : 'completed',
  ...(l.user_name !== undefined ? { user_id: l.user_id, user_name: l.user_name, actor_name: l.actor_name || null } : {}),
});

export async function myPoints(userId) {
  const today = todayPH();
  const [u, sums, soon, history] = await Promise.all([
    one('SELECT reward_points, tiwala_frozen_until, verification_status, role, suspended, deleted_at FROM users WHERE id = ?', [userId]),
    one(`SELECT COALESCE(SUM(IF(reason LIKE 'earn\\_%' OR (reason = 'adjustment' AND amount > 0), amount, 0)), 0) AS earned,
                COALESCE(-SUM(IF(reason = 'redeem', amount, 0)), 0) - COALESCE(SUM(IF(reason LIKE 'refund%', amount, 0)), 0) AS redeemed,
                COALESCE(-SUM(IF(reason = 'points_expired', amount, 0)), 0) AS expired,
                COALESCE(SUM(IF(reason LIKE 'earn\\_%' AND created_at >= ?, amount, 0)), 0) AS this_quarter
           FROM credit_ledger WHERE user_id = ? AND account = 'reward'`, [quarterStart(today), userId]),
    one(`SELECT COALESCE(SUM(remaining), 0) AS n, MIN(expires_on) AS first FROM credit_ledger
          WHERE user_id = ? AND account = 'reward' AND remaining > 0 AND expires_on >= ? AND expires_on <= ?`, [userId, today, addDays(today, RULES.pointsExpiryWarnDays)]),
    q(`SELECT l.*, ${SOURCE_COLS} FROM credit_ledger l ${SOURCE_SQL} WHERE l.user_id = ? AND l.account = 'reward' ORDER BY l.id DESC LIMIT 100`, [userId]),
  ]);
  return {
    balance: u.reward_points,
    available: await spendableNow(userId, today),
    earned: Number(sums.earned),
    redeemed: Number(sums.redeemed),
    expired: Number(sums.expired),
    expiring_soon: { points: Number(soon.n), first_date: soon.first || null, within_days: RULES.pointsExpiryWarnDays },
    quarter: { label: quarterOf(today), earned: Number(sums.this_quarter), cap: RULES.pointsQuarterCap, left: Math.max(0, RULES.pointsQuarterCap - Number(sums.this_quarter)) },
    can_earn: residentOk(u, today),
    expiry_months: RULES.pointsExpiryMonths,
    history: history.map(ledgerRow),
  };
}

// ---------- campaigns ----------
const campaignOut = (c, rules) => ({
  id: c.id, name_en: c.name_en, name_fil: c.name_fil, objective_en: c.objective_en, objective_fil: c.objective_fil,
  starts_on: c.starts_on, ends_on: c.ends_on, status: c.status, is_base: !!c.is_base, resident_cap: c.resident_cap, total_cap: c.total_cap,
  min_account_days: c.min_account_days, puroks: parsePuroks(c.puroks) || [],
  rules: rules.filter((r) => r.campaign_id === c.id).map((r) => ({ activity: r.activity, points: r.points })),
});

// What residents see: running campaigns with my progress and whether I can take part.
export async function campaignsFor(user) {
  const today = todayPH();
  const camps = (await q("SELECT * FROM reward_campaigns WHERE status = 'active' ORDER BY is_base DESC, ends_on IS NULL, ends_on, id")).filter((c) => campaignRunning(c, today));
  if (!camps.length) return [];
  const rules = await q(`SELECT * FROM campaign_rules WHERE campaign_id IN (${camps.map(() => '?').join(',')}) AND points > 0`, camps.map((c) => c.id));
  const mine = await q(
    `SELECT campaign_id, SUM(amount) AS n, COUNT(*) AS times FROM credit_ledger WHERE user_id = ? AND account = 'reward' AND reason LIKE 'earn\\_%' GROUP BY campaign_id`, [user.id]);
  const u = await one('SELECT * FROM users WHERE id = ?', [user.id]);
  return camps.map((c) => {
    const m = mine.find((x) => x.campaign_id === c.id);
    const earned = Number(m?.n || 0);
    return {
      ...campaignOut(c, rules),
      eligible: campaignEligible(u, c, today),
      mine: { earned, times: Number(m?.times || 0), left: c.resident_cap ? Math.max(0, c.resident_cap - earned) : null },
    };
  });
}

function readCampaign(b, partial) {
  const out = {};
  for (const k of ['name_en', 'name_fil']) {
    if (!partial || b[k] !== undefined) {
      const v = String(b[k] || '').trim();
      if (v.length < 3) throw bad('Write the campaign name in English and Filipino.', 'bad_name');
      out[k] = v.slice(0, 120);
    }
  }
  for (const k of ['objective_en', 'objective_fil']) if (b[k] !== undefined) out[k] = String(b[k] || '').trim().slice(0, 1000) || null;
  for (const k of ['starts_on', 'ends_on']) {
    if (b[k] !== undefined) {
      if (b[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(b[k]))) throw bad('Dates must look like 2026-12-31.', 'bad_date');
      out[k] = b[k] || null;
    }
  }
  if (out.starts_on && out.ends_on && out.ends_on < out.starts_on) throw bad('The campaign must end after it starts.', 'bad_date');
  for (const k of ['resident_cap', 'total_cap']) {
    if (b[k] !== undefined) {
      const n = b[k] === null || b[k] === '' ? null : Number(b[k]);
      if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1000000)) throw bad('Limits must be whole numbers above zero (or empty for no limit).', 'bad_cap');
      out[k] = n;
    }
  }
  if (b.min_account_days !== undefined) {
    const n = Number(b.min_account_days || 0);
    if (!Number.isInteger(n) || n < 0 || n > 3650) throw bad('Account age must be 0 to 3650 days.', 'bad_eligibility');
    out.min_account_days = n;
  }
  if (b.puroks !== undefined) {
    if (b.puroks !== null && !Array.isArray(b.puroks)) throw bad('Choose puroks from the list.', 'bad_purok');
    out.puroks = b.puroks && b.puroks.length ? JSON.stringify(b.puroks.map((p) => String(p).slice(0, 60))) : null;
  }
  let rules = null;
  if (b.rules !== undefined) {
    if (!Array.isArray(b.rules)) throw bad('List the activities and their points.', 'bad_rules');
    rules = b.rules.map((r) => {
      const pts = Number(r.points);
      if (!ACTIVITIES.includes(r.activity)) throw bad('Choose activities from the list.', 'bad_rules');
      if (!Number.isInteger(pts) || pts < 0 || pts > 1000) throw bad('Points per activity must be 0 to 1000.', 'bad_rules');
      return { activity: r.activity, points: pts };
    });
    if (new Set(rules.map((r) => r.activity)).size !== rules.length) throw bad('Each activity once only.', 'bad_rules');
  }
  return { fields: out, rules };
}

async function saveRules(conn, campaignId, rules) {
  if (!rules) return;
  await conn.query('DELETE FROM campaign_rules WHERE campaign_id = ?', [campaignId]);
  for (const r of rules) await conn.query('INSERT INTO campaign_rules (campaign_id, activity, points) VALUES (?,?,?)', [campaignId, r.activity, r.points]);
}

export async function listCampaigns() {
  const camps = await q("SELECT * FROM reward_campaigns ORDER BY FIELD(status,'active','paused','draft','archived'), is_base DESC, id DESC");
  const rules = await q('SELECT * FROM campaign_rules');
  const stats = await q(
    `SELECT campaign_id, COALESCE(SUM(amount), 0) AS points, COUNT(DISTINCT user_id) AS residents, COUNT(*) AS awards
       FROM credit_ledger WHERE account = 'reward' AND reason LIKE 'earn\\_%' AND campaign_id IS NOT NULL GROUP BY campaign_id`);
  const byActivity = await q(
    `SELECT campaign_id, SUBSTRING(reason, 6) AS activity, COUNT(*) AS n, SUM(amount) AS points
       FROM credit_ledger WHERE account = 'reward' AND reason LIKE 'earn\\_%' AND campaign_id IS NOT NULL GROUP BY campaign_id, reason`);
  return camps.map((c) => {
    const s = stats.find((x) => x.campaign_id === c.id);
    return {
      ...campaignOut(c, rules), running: campaignRunning(c), announced_at: c.announced_at, created_at: c.created_at,
      stats: {
        points: Number(s?.points || 0), residents: Number(s?.residents || 0), awards: Number(s?.awards || 0),
        by_activity: byActivity.filter((a) => a.campaign_id === c.id).map((a) => ({ activity: a.activity, awards: Number(a.n), points: Number(a.points) })),
      },
    };
  });
}

export async function createCampaign(body, actor) {
  const { fields, rules } = readCampaign(body || {}, false);
  return withTx(async (conn) => {
    const keys = Object.keys(fields);
    const [r] = await conn.query(`INSERT INTO reward_campaigns (${keys.join(', ')}, created_by) VALUES (${keys.map(() => '?').join(', ')}, ?)`,
      [...keys.map((k) => fields[k]), actor.id]);
    await saveRules(conn, r.insertId, rules || []);
    await audit(actor.id, 'campaign_created', `campaign #${r.insertId} ${fields.name_en}`, conn);
    return { id: r.insertId, status: 'draft' };
  });
}

export async function updateCampaign(id, body, actor) {
  const { fields, rules } = readCampaign(body || {}, true);
  return withTx(async (conn) => {
    const [[c]] = await conn.query('SELECT * FROM reward_campaigns WHERE id = ? FOR UPDATE', [id]);
    if (!c) throw notFound('Campaign not found.');
    if (c.status === 'archived') throw bad('An archived campaign cannot be changed.', 'bad_state');
    if (c.is_base && (fields.starts_on || fields.ends_on)) throw bad('The Base Program has no dates.', 'bad_date');
    const keys = Object.keys(fields);
    if (!keys.length && !rules) throw bad('Nothing to change.', 'bad_name');
    if (keys.length) await conn.query(`UPDATE reward_campaigns SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), c.id]);
    await saveRules(conn, c.id, rules);
    await audit(actor.id, 'campaign_edited', `campaign #${c.id}${rules ? ` rules: ${rules.map((r) => `${r.activity}=${r.points}`).join(' ')}` : ''}`.slice(0, 255), conn);
    return { id: c.id };
  });
}

// draft -> active <-> paused -> archived. The first activation announces the campaign to the residents who
// can take part (one notification each, through the normal notifications).
export async function setCampaignStatus(id, status, actor) {
  const next = { activate: 'active', pause: 'paused', archive: 'archived' }[status];
  if (!next) throw bad('Choose activate, pause or archive.', 'bad_state');
  return withTx(async (conn) => {
    const [[c]] = await conn.query('SELECT * FROM reward_campaigns WHERE id = ? FOR UPDATE', [id]);
    if (!c) throw notFound('Campaign not found.');
    if (c.status === 'archived') throw bad('This campaign is archived.', 'bad_state');
    if (c.is_base && next === 'archived') throw bad('The Base Program can be paused but not archived.', 'bad_state');
    if (next === 'active') {
      const [[r]] = await conn.query('SELECT COUNT(*) AS n FROM campaign_rules WHERE campaign_id = ? AND points > 0', [c.id]);
      if (!r.n) throw bad('Give at least one activity some points first.', 'no_rule');
    }
    await conn.query('UPDATE reward_campaigns SET status = ? WHERE id = ?', [next, c.id]);
    let announced = 0;
    if (next === 'active' && !c.announced_at && !c.is_base) {
      const [users] = await conn.query("SELECT * FROM users WHERE role = 'resident' AND verification_status = 'approved' AND suspended = 0 AND deleted_at IS NULL");
      for (const u of users.filter((x) => campaignEligible(x, c))) {
        await notify(conn, u.id, 'campaign_new', `New campaign: ${c.name_en}`, c.objective_en || 'Open Rewards in the app to see how to take part.', c.id,
          { campaign: c.name_en, campaign_fil: c.name_fil });
        announced++;
      }
      await conn.query('UPDATE reward_campaigns SET announced_at = NOW() WHERE id = ?', [c.id]);
    }
    await audit(actor.id, `campaign_${next}`, `campaign #${c.id} ${c.name_en}`, conn);
    return { id: c.id, status: next, announced };
  });
}
