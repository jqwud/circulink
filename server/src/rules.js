// CircuLink rules in one place, so the spec (docs/CIRCULAR_HUB_SPEC.md), the API, the app and the portal
// agree. Every anti-abuse rule (R1 to R13) is a small pure function here: no database, no clock of its own
// (callers pass "now"), so test/rules.test.js can check each one on its own. The routes call these functions
// and never re-implement them.
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export const RULES = {
  // Declarations and drop-off codes (R9)
  codeLength: 6,
  codeValidDays: 7,
  maxOpenDeclarations: 3,

  // Weights (kg) and flags for review (R7)
  maxItemWeightKg: 500,
  flagDropOffOverKg: 50,
  flagResidentOverKgPer30Days: 100,
  flagHubDayOverAverageTimes: 3,
  flagHubDayMinimumKg: 20,    // a hub's day is compared with its average only once it passes this many kg

  // Food (R11): days the expiry date must still be ahead when the food is received or released
  foodMinDaysToExpiry: 3,

  // R13: drop-off code check-ins one staff member may try per 15 minutes (guessing codes is slow)
  codeCheckinsPer15Min: 30,

  // Housekeeping
  unusedUploadGraceHours: 24,  // a photo nobody attached to anything is deleted after this long
  notificationsKeptDays: 180,  // read notifications are deleted after this long
};

// What can happen to an item at the hub, and how much of the category rate it earns (R5).
export const OUTCOMES = ['reuse', 'repair', 'recycle', 'reject'];
export const OUTCOME_MULTIPLIER = { reuse: 1.0, repair: 0.8, recycle: 0.5, reject: 0 };

// Badge tiers by confirmed points. Points cannot be transferred and have no cash value.
export const BADGES = [
  { key: 'seed', min: 0 },
  { key: 'sprout', min: 100 },
  { key: 'tree', min: 500 },
  { key: 'forest', min: 2000 },
];

export const ROLES = ['resident', 'staff', 'partner', 'admin'];
export const HUB_TYPES = ['school', 'barangay', 'other'];

// A broken rule: the route answers 400 (or 403) with the code, so the apps can translate it.
const broken = (message, code, status = 400) => new HttpError(status, message, code);

// ---------- R8: one account per person ----------

// Phone: digits, spaces, + and -. Stored without spaces or dashes, so "0917 123 4567" and "0917-123-4567"
// are the same number and cannot open two accounts.
export function normalizePhone(p) {
  const v = String(p ?? '').trim();
  if (!v) return null;
  if (!/^\+?[0-9][0-9 -]{5,18}[0-9]$/.test(v)) throw broken('Enter a phone number with digits only, like 0917 123 4567.', 'bad_phone');
  // +63 917... and 0917... are the same Philippine number.
  return v.replace(/[ -]/g, '').replace(/^\+63(?=9\d{9}$)/, '0');
}

// Student ID: letters, digits and dashes, stored in capitals.
export function normalizeStudentId(s) {
  const v = String(s ?? '').trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9-]{4,30}$/.test(v)) throw broken('Enter your student ID as printed on your school ID.', 'bad_student_id');
  return v;
}

// ---------- R1 and R4: who may create points, and where ----------

// Only staff (or an admin) working at this hub may check in drop-offs, weigh and sort items, and so create
// points. `staffHubIds` are the hubs the person is assigned to (hub_staff). Admins may act at any hub.
export function canActAtHub(user, hubId, staffHubIds = []) {
  if (!user || user.suspended) return false;
  if (user.role === 'admin') return true;
  return user.role === 'staff' && staffHubIds.map(Number).includes(Number(hubId));
}
export function assertCanActAtHub(user, hubId, staffHubIds) {
  if (!canActAtHub(user, hubId, staffHubIds)) throw broken('Only staff working at this hub can do this.', 'not_your_hub', 403);
}

// ---------- R2: only approved partner organizations receive items ----------

export function canReceiveItems(user, partner) {
  return !!user && !user.suspended && user.role === 'partner'
    && !!partner && Number(partner.user_id) === Number(user.id) && partner.status === 'approved';
}
export function assertCanReceiveItems(user, partner) {
  if (!canReceiveItems(user, partner)) throw broken('Only approved partner organizations can receive items.', 'partner_not_approved', 403);
}

// ---------- R3: staff never process their own drop-off ----------

// The same person: the same account, or the same phone number or student ID on another account.
export function samePerson(a, b) {
  if (!a || !b) return false;
  if (Number(a.id) === Number(b.id)) return true;
  const phone = (u) => { try { return normalizePhone(u.phone); } catch { return null; } };
  const sid = (u) => { try { return normalizeStudentId(u.student_id); } catch { return null; } };
  return (!!phone(a) && phone(a) === phone(b)) || (!!sid(a) && sid(a) === sid(b));
}
export function assertNotOwnDropOff(staff, resident) {
  if (samePerson(staff, resident)) throw broken('You cannot process your own drop-off. Ask another staff member.', 'own_drop_off', 403);
}

// ---------- R5: points follow weight and outcome ----------

export function checkWeight(kg) {
  const w = Number(kg);
  if (!Number.isFinite(w) || w <= 0 || w > RULES.maxItemWeightKg) {
    throw broken(`Enter a weight above 0 and at most ${RULES.maxItemWeightKg} kg.`, 'bad_weight');
  }
  return Math.round(w * 100) / 100;   // the database keeps 2 decimals
}

export function checkOutcome(outcome) {
  if (!OUTCOMES.includes(outcome)) throw broken('Choose reuse, repair, recycle or reject.', 'bad_outcome');
  return outcome;
}

// points = floor(weight_kg x category rate x outcome multiplier). A rejected item earns 0.
// Splitting one bag into many small items earns no more than weighing it once (floor never rounds up).
export function pointsFor(weightKg, ratePerKg, outcome) {
  const w = checkWeight(weightKg);
  const rate = Number(ratePerKg);
  if (!Number.isFinite(rate) || rate < 0) throw broken('This category has no valid rate.', 'bad_category');
  // The small epsilon keeps 0.1 x 3 x 10 = 3 (not 2.9999...) without ever adding a point.
  return Math.floor(w * rate * OUTCOME_MULTIPLIER[checkOutcome(outcome)] + 1e-9);
}

// kg kept in use (everything but rejected items) and the estimated kg CO2e avoided.
export function impactOf(items) {
  let kg = 0;
  let co2 = 0;
  for (const i of items) {
    if (!i.weight_kg || i.outcome === 'reject' || !i.outcome) continue;
    kg += Number(i.weight_kg);
    co2 += Number(i.weight_kg) * Number(i.co2_per_kg || 0);
  }
  return { kg_kept: Math.round(kg * 100) / 100, co2e_avoided_kg: Math.round(co2 * 10) / 10 };
}

export function badgeFor(confirmedPoints) {
  return [...BADGES].reverse().find((b) => confirmedPoints >= b.min).key;
}

// ---------- certificates: recognition for keeping things in use ----------
// Not goods or credit: a certificate signed by the hub's head and the CircuLink programme lead. Only confirmed
// points count, and the drop-off and month minimums reward a habit, not one big delivery made to qualify.
// Champion certificates also need an admin's approval.
export const CERTIFICATE_LEVELS = [
  { key: 'participation', points: 100, dropoffs: 3, months: 1, review: false },
  { key: 'recognition', points: 500, dropoffs: 8, months: 3, review: false },
  { key: 'champion', points: 2000, dropoffs: 15, months: 6, review: true },
];

// What a resident still needs for each level, from their confirmed points, received drop-offs and the number
// of different months they dropped off in.
export function certificateProgress({ points, dropoffs, months }) {
  return CERTIFICATE_LEVELS.map((l) => ({
    ...l,
    eligible: points >= l.points && dropoffs >= l.dropoffs && months >= l.months,
    missing: {
      points: Math.max(0, l.points - points),
      dropoffs: Math.max(0, l.dropoffs - dropoffs),
      months: Math.max(0, l.months - months),
    },
  }));
}

// ---------- R6: points stay pending until the item is final ----------

// The item life cycle. Anything not listed is refused.
export const ITEM_TRANSITIONS = {
  declared: ['received'],
  received: ['in_stock', 'in_repair', 'in_recycle_batch', 'rejected'],
  in_repair: ['in_stock', 'in_recycle_batch', 'rejected'],
  in_stock: ['released', 'in_repair', 'in_recycle_batch', 'rejected'],
  in_recycle_batch: ['recycled', 'in_stock'],
  released: [],
  recycled: [],
  rejected: [],
};
export const FINAL_STATES = ['released', 'recycled', 'rejected'];

// Where a sorted item goes first, by outcome.
export const STATE_FOR_OUTCOME = { reuse: 'in_stock', repair: 'in_repair', recycle: 'in_recycle_batch', reject: 'rejected' };

export function assertTransition(from, to) {
  if (!(ITEM_TRANSITIONS[from] || []).includes(to)) throw broken(`An item that is ${from.replace(/_/g, ' ')} cannot become ${to.replace(/_/g, ' ')}.`, 'bad_state');
}

// What a points row should say now: pending while the item is still moving, while other items of the same
// drop-off are not sorted yet, or while an admin is looking at it; confirmed once the item is final;
// cancelled if a reviewer upheld a flag (the points were not earned). Waiting for the whole drop-off means a
// flag raised by its last item (R7) always comes before any of its points are confirmed.
export function pointsStatus({ itemState, dropOffSorted = true, openFlag = false, flagUpheld = false }) {
  if (flagUpheld) return 'cancelled';
  if (openFlag || !dropOffSorted) return 'pending';
  return FINAL_STATES.includes(itemState) ? 'confirmed' : 'pending';
}

// Points that changed outcome before they were confirmed are worked out again; confirmed points never change.
export function repricePending(row, newPoints) {
  if (row.status !== 'pending') throw broken('Confirmed or cancelled points cannot change.', 'points_locked');
  return newPoints;
}

// After sorting, staff may still move an item (a repair failed, stock spoiled, a recyclable turned out to be
// reusable). The item's outcome follows the move, but its points can only go down, never up: sorting as
// "recycle" and then moving to stock cannot be used to raise points later.
export const MOVES = {
  in_repair: ['in_stock', 'in_recycle_batch', 'rejected'],
  in_stock: ['in_repair', 'in_recycle_batch', 'rejected'],
  in_recycle_batch: ['in_stock', 'rejected'],
};
export function assertMove(from, to) {
  if (!(MOVES[from] || []).includes(to)) throw broken(`An item that is ${from.replace(/_/g, ' ')} cannot be moved to ${to.replace(/_/g, ' ')}.`, 'bad_state');
}
export function outcomeAfterMove(outcome, to) {
  if (to === 'rejected') return 'reject';
  if (to === 'in_recycle_batch') return 'recycle';
  if (to === 'in_repair') return 'repair';
  return outcome;   // back to stock: it keeps what it was sorted as
}
export function pointsAfterMove(currentPoints, weightKg, ratePerKg, newOutcome) {
  return Math.min(Number(currentPoints), pointsFor(weightKg, ratePerKg, newOutcome));
}

// ---------- R7: unusual weights go to an admin ----------

// Returns the flags to raise (empty when nothing is unusual). Flagged points stay pending (R6).
//   dropOffKg       this drop-off's total weight so far
//   residentKg30    the resident's total over the last 30 days, this drop-off included
//   hubTodayKg      the hub's total today, this drop-off included
//   hubDailyAvg30   the hub's average per open day over the 30 days before today (0 for a new hub)
export function flagsFor({ dropOffKg = 0, residentKg30 = 0, hubTodayKg = 0, hubDailyAvg30 = 0 }) {
  const flags = [];
  if (dropOffKg > RULES.flagDropOffOverKg) flags.push('heavy_drop_off');
  if (residentKg30 > RULES.flagResidentOverKgPer30Days) flags.push('heavy_resident_month');
  if (hubTodayKg > RULES.flagHubDayMinimumKg && hubDailyAvg30 > 0 && hubTodayKg > hubDailyAvg30 * RULES.flagHubDayOverAverageTimes) {
    flags.push('hub_day_spike');
  }
  return flags;
}

// ---------- R9: drop-off codes ----------

// 6 characters without look-alikes (no 0/O, 1/I/L), from a secure random source, so codes are easy to read
// aloud and hard to guess: 31^6, about 887 million codes.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(random = (n) => crypto.randomInt(n)) {
  return Array.from({ length: RULES.codeLength }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join('');
}
// What staff type: spaces and dashes ignored, lower case accepted, O read as 0 is not possible (no 0 used).
export const cleanCode = (c) => String(c ?? '').toUpperCase().replace(/[\s-]/g, '');
export const codeLooksValid = (c) => new RegExp(`^[${CODE_ALPHABET}]{${RULES.codeLength}}$`).test(cleanCode(c));

export function assertCanDeclare(openCount) {
  if (openCount >= RULES.maxOpenDeclarations) {
    throw broken(`You can have up to ${RULES.maxOpenDeclarations} open drop-off codes. Bring those items first, or cancel one.`, 'too_many_open');
  }
}

export function codeExpiry(now = new Date()) {
  return new Date(now.getTime() + RULES.codeValidDays * 86400000);
}

// A code works once, only while open and not expired. `expiresAt` is a Date or a timestamp string in PH time.
export function assertCodeUsable(declaration, now = new Date()) {
  if (!declaration) throw broken('No drop-off has this code. Check it with the resident.', 'bad_code', 404);
  if (declaration.status === 'received') throw broken('This code was already used.', 'code_used');
  if (declaration.status !== 'open') throw broken('This code is no longer valid. The resident can make a new one.', 'code_expired');
  const exp = declaration.expires_at instanceof Date ? declaration.expires_at
    : new Date(`${String(declaration.expires_at).replace(' ', 'T')}+08:00`);
  if (exp.getTime() <= now.getTime()) throw broken('This code is no longer valid. The resident can make a new one.', 'code_expired');
}

// ---------- R10: hazardous items go only to accredited recyclers ----------

export function canSendToRecycler(category, recycler) {
  if (!recycler || recycler.status === 'inactive') return false;
  return !category?.hazardous || !!recycler.accredited;
}
export function assertCanSendToRecycler(category, recycler) {
  if (!canSendToRecycler(category, recycler)) {
    throw broken('E-waste and batteries can only go to an accredited recycler.', 'recycler_not_accredited');
  }
}

// ---------- R11: food ----------

// Food must still have foodMinDaysToExpiry days left, both when received and when released.
// `today` and `expiry` are YYYY-MM-DD (Philippine dates).
export function foodOk(expiry, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ''))) return false;
  const days = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return days >= RULES.foodMinDaysToExpiry;
}
export function assertFoodOk(category, expiry, today) {
  if (!category?.food) return;
  if (!foodOk(expiry, today)) {
    throw broken(`Sealed food needs an expiry date at least ${RULES.foodMinDaysToExpiry} days away.`, 'food_expiring');
  }
}
// Sealed food is either given out as it is (reuse) or disposed of (reject): never repaired or recycled.
export function assertFoodOutcome(category, outcome) {
  if (category?.food && !['reuse', 'reject'].includes(outcome)) {
    throw broken('Sealed food can only be given out (reuse) or rejected.', 'food_outcome');
  }
}

// Food may be released only to a partner organization (never to anyone else), and only while still fresh.
export function assertFoodRelease(category, expiry, today, user, partner) {
  if (!category?.food) return;
  assertCanReceiveItems(user, partner);
  assertFoodOk(category, expiry, today);
}
