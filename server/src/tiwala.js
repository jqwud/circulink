// The Tiwala (trust) score, 0 to 100 (Hiraman 2.0, design spec section 8). Separate from credits: it can never
// be spent, bought or moved. Batch 32 runs it in SHADOW MODE: calculated nightly and shown to staff only, so
// the rules can be checked against real use before the barangay promises any reward.
//
// scoreFrom(facts) is pure (the rules); gatherFacts(userId) reads the last 90 days from the database.
import { q, one, todayPH } from './db.js';
import { addDays } from './services.js';

export const TIWALA = {
  start: 40,
  windowDays: 90,
  newAccountDays: 30,       // verified this recently: the score shows, but no tier yet
  lenderLoan: 3, lenderLoanCap: 30,
  borrowerServed: 2, borrowerServedCap: 10,
  goodReturn: 1, goodReturnCap: 5,
  donation: 3, donationCap: 9,
  ratingHigh: 5, ratingGood: 3, ratingsNeeded: 3,
  clean: 5,
  late: -5, borrowerFault: -8, lost: -15, noShow: -3, listingRemoved: -5,
  perBorrowerMax: 2,        // loans counted per borrower in the window
  perItemMax: 4,            // times one item can count in the window
  borrowerVerifiedDays: 30, // a borrower must be verified this long before their loans count for the lender
  loopLoans: 3,             // lending both ways between two people this often flags both, and those loans stop counting
  ringShare: 0.7,           // this share of counted loans with the same 3 people is a "ring" signal
  ringMinLoans: 4,
  frozenDays: 180,          // score held at 0 after staff confirm collusion
};

export const TIERS = [
  { key: 'gold', min: 80, loans: 6, borrowers: 4, accountDays: 90, staffCheck: true },
  { key: 'silver', min: 65, loans: 4, borrowers: 3 },
  { key: 'bronze', min: 50, loans: 2, borrowers: 1 },
];

/**
 * facts = {
 *   verifiedDays, accountDays, frozen,
 *   lent: [{ borrowerId, itemId, onTime, good, overnight, borrowerVerifiedDays }],   // closed loans I lent, in the window
 *   borrowedFrom: { [ownerId]: count },                                             // loans I borrowed, by owner (loops)
 *   returns: [{ onTime, good, outcome }],                                           // my returns as borrower
 *   donations, ratings: [{ raterId, stars }], noShows, listingsRemoved,
 * }
 */
export function scoreFrom(f) {
  const T = TIWALA;
  const signals = [];
  // Back-and-forth: lending both ways with the same person 3+ times in the window. Those loans stop counting.
  const lentTo = {};
  for (const l of f.lent) lentTo[l.borrowerId] = (lentTo[l.borrowerId] || 0) + 1;
  const loopWith = new Set(Object.keys(lentTo).filter((id) => (f.borrowedFrom[id] || 0) > 0 && lentTo[id] + f.borrowedFrom[id] >= T.loopLoans).map(Number));
  if (loopWith.size) signals.push('loop');

  // Which loans count: on time, good, kept at least overnight, a borrower verified 30+ days, no loop,
  // at most 2 per borrower and 4 per item.
  const perBorrower = {}; const perItem = {};
  const counted = [];
  for (const l of f.lent) {
    if (!l.onTime || !l.good || !l.overnight || l.borrowerVerifiedDays < T.borrowerVerifiedDays || loopWith.has(l.borrowerId)) continue;
    if ((perBorrower[l.borrowerId] || 0) >= T.perBorrowerMax || (perItem[l.itemId] || 0) >= T.perItemMax) continue;
    perBorrower[l.borrowerId] = (perBorrower[l.borrowerId] || 0) + 1;
    perItem[l.itemId] = (perItem[l.itemId] || 0) + 1;
    counted.push(l);
  }
  const borrowers = new Set(counted.map((l) => l.borrowerId));
  if (counted.length >= T.ringMinLoans) {
    const top3 = Object.values(perBorrower).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
    if (borrowers.size > 3 && top3 / counted.length >= T.ringShare) signals.push('ring');
  }

  const goodReturns = f.returns.filter((r) => r.onTime && r.good).length;
  const late = f.returns.filter((r) => !r.onTime).length;
  const fault = f.returns.filter((r) => r.outcome === 'borrower_fault').length;
  const lost = f.returns.filter((r) => r.outcome === 'lost').length;
  // Ratings: only from 3+ different people, and never from someone in a lending loop with me.
  const fair = f.ratings.filter((r) => !loopWith.has(r.raterId));
  const raters = new Set(fair.map((r) => r.raterId));
  const avg = fair.length ? fair.reduce((a, r) => a + r.stars, 0) / fair.length : 0;
  const ratingPts = raters.size >= T.ratingsNeeded ? (avg >= 4.5 ? T.ratingHigh : avg >= 4.0 ? T.ratingGood : 0) : 0;

  const parts = {
    start: T.start,
    loans: Math.min(counted.length * T.lenderLoan, T.lenderLoanCap),
    borrowers: Math.min(borrowers.size * T.borrowerServed, T.borrowerServedCap),
    returns: Math.min(goodReturns * T.goodReturn, T.goodReturnCap),
    donations: Math.min(f.donations * T.donation, T.donationCap),
    ratings: ratingPts,
    clean: late + fault + lost === 0 ? T.clean : 0,
    penalties: (late * T.late + fault * T.borrowerFault + lost * T.lost + f.noShows * T.noShow + f.listingsRemoved * T.listingRemoved) || 0, // never -0
  };
  let score = Object.values(parts).reduce((a, b) => a + b, 0);
  score = Math.max(0, Math.min(100, score));
  if (f.frozen) { score = 0; signals.push('frozen'); }

  // Tier: the score AND the activity gate; nothing for accounts verified less than 30 days ago.
  let tier = 'starter';
  let staffCheck = false;
  if (f.verifiedDays >= T.newAccountDays && !f.frozen) {
    for (const t of TIERS) {
      if (score >= t.min && counted.length >= t.loans && borrowers.size >= t.borrowers && (!t.accountDays || f.accountDays >= t.accountDays)) {
        tier = t.key;
        staffCheck = !!t.staffCheck || signals.length > 0;
        break;
      }
    }
  }
  if (tier === 'silver' && signals.includes('ring')) staffCheck = true; // a ring blocks automatic Silver
  return { score, tier, parts, counted_loans: counted.length, borrowers: borrowers.size, signals, needs_staff_check: staffCheck };
}

// The facts for one resident, over the last 90 days.
export async function gatherFacts(userId, today = todayPH()) {
  const since = addDays(today, -TIWALA.windowDays);
  const u = await one('SELECT id, created_at, verification_decided_at, tiwala_frozen_until FROM users WHERE id = ?', [userId]);
  const days = (d) => (d ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`)) / 864e5) : 0);
  const lent = await q(
    `SELECT r.borrower_id, r.item_id, r.on_time, r.return_condition, r.handed_over_at, r.returned_at, b.verification_decided_at AS bv
       FROM requests r JOIN items i ON i.id = r.item_id JOIN users b ON b.id = r.borrower_id
      WHERE i.owner_id = ? AND r.status = 'closed' AND r.returned_at >= ?`, [userId, since]);
  const borrowed = await q(
    `SELECT i.owner_id, COUNT(*) AS n FROM requests r JOIN items i ON i.id = r.item_id
      WHERE r.borrower_id = ? AND r.status IN ('closed','disputed') AND r.returned_at >= ? AND i.owner_id IS NOT NULL GROUP BY i.owner_id`, [userId, since]);
  const returns = await q(
    `SELECT on_time, return_condition, dispute_outcome FROM requests
      WHERE borrower_id = ? AND status IN ('closed','disputed') AND returned_at >= ?`, [userId, since]);
  const donations = await one(
    `SELECT COUNT(*) AS n FROM donation_claims c JOIN items i ON i.id = c.item_id
      WHERE i.owner_id = ? AND c.status = 'given' AND c.closed_at >= ? AND c.closed_at <= DATE_SUB(?, INTERVAL 7 DAY)`, [userId, since, `${today} 23:59:59`]);
  const ratings = await q('SELECT rater_id, stars FROM ratings WHERE ratee_id = ? AND created_at >= ?', [userId, since]);
  const noShows = await one("SELECT COUNT(*) AS n FROM donation_claims WHERE claimer_id = ? AND status = 'no_show' AND closed_at >= ?", [userId, since]);
  const removed = await one("SELECT COUNT(*) AS n FROM items WHERE owner_id = ? AND removed_by = 'staff' AND removed_at >= ?", [userId, since]);
  return {
    verifiedDays: days(u.verification_decided_at),
    accountDays: days(u.created_at),
    frozen: !!u.tiwala_frozen_until && String(u.tiwala_frozen_until).slice(0, 10) >= today,
    lent: lent.map((l) => ({
      borrowerId: l.borrower_id, itemId: l.item_id, onTime: !!l.on_time, good: l.return_condition === 'good',
      overnight: !!l.handed_over_at && String(l.returned_at).slice(0, 10) > String(l.handed_over_at).slice(0, 10),
      borrowerVerifiedDays: l.bv && l.handed_over_at ? Math.floor((Date.parse(l.handed_over_at) - Date.parse(l.bv)) / 864e5) : 0,
    })),
    borrowedFrom: Object.fromEntries(borrowed.map((b) => [b.owner_id, Number(b.n)])),
    returns: returns.map((r) => ({ onTime: !!r.on_time, good: r.return_condition === 'good' || r.dispute_outcome === 'fine' || r.dispute_outcome === 'accident', outcome: r.dispute_outcome })),
    donations: Number(donations.n),
    ratings: ratings.map((r) => ({ raterId: r.rater_id, stars: r.stars })),
    noShows: Number(noShows.n),
    listingsRemoved: Number(removed.n),
  };
}

// Nightly: every verified resident's live score (period 'live'); on the first day of a quarter also a
// snapshot for the quarter that just ended (e.g. '2026-Q3'), which rewards will use once they exist.
export async function runTiwala(now = new Date()) {
  const today = todayPH(now);
  const users = await q("SELECT id FROM users WHERE role = 'resident' AND verification_status = 'approved' AND deleted_at IS NULL");
  const [y, m, d] = today.split('-').map(Number);
  const snapshot = d === 1 && [1, 4, 7, 10].includes(m) ? `${m === 1 ? y - 1 : y}-Q${m === 1 ? 4 : (m - 1) / 3}` : null;
  for (const { id } of users) {
    const r = scoreFrom(await gatherFacts(id, today));
    for (const period of snapshot ? ['live', snapshot] : ['live']) {
      await q(
        `INSERT INTO trust_scores (user_id, period, score, tier, parts, signals, needs_staff_check, counted_loans, computed_on)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), tier = VALUES(tier), parts = VALUES(parts), signals = VALUES(signals),
           needs_staff_check = VALUES(needs_staff_check), counted_loans = VALUES(counted_loans), computed_on = VALUES(computed_on)`,
        [id, period, r.score, r.tier, JSON.stringify(r.parts), JSON.stringify(r.signals), r.needs_staff_check ? 1 : 0, r.counted_loans, today]);
    }
  }
  return { residents: users.length, snapshot };
}
