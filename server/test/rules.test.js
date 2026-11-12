// The anti-abuse rules R1 to R13 (docs/CIRCULAR_HUB_SPEC.md, section 5), each tested on its own.
// No database: `npm run test:unit` runs this file alone in about a second.
// R12 (append-only audit log) is checked in audit.test.js; R8 and R13 also end to end in api-basics.test.js.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  RULES, OUTCOMES, OUTCOME_MULTIPLIER, BADGES, CODE_ALPHABET, ITEM_TRANSITIONS, FINAL_STATES, STATE_FOR_OUTCOME,
  normalizePhone, normalizeStudentId, canActAtHub, assertCanActAtHub, canReceiveItems, assertCanReceiveItems,
  samePerson, assertNotOwnDropOff, checkWeight, checkOutcome, pointsFor, impactOf, badgeFor, assertTransition,
  pointsStatus, repricePending, flagsFor, newCode, cleanCode, codeLooksValid, assertCanDeclare, codeExpiry,
  assertCodeUsable, canSendToRecycler, assertCanSendToRecycler, foodOk, assertFoodOk, assertFoodRelease, assertMove, outcomeAfterMove,
  pointsAfterMove,
} from '../src/rules.js';

// Asserts that `fn` breaks a rule with this error code (and HTTP status).
const breaks = (fn, code, status = 400) => assert.throws(fn, (e) => {
  assert.equal(e.code, code);
  assert.equal(e.status, status);
  return true;
});

const resident = { id: 10, role: 'resident', phone: '09170000001', student_id: '2023-00123' };
const staff = { id: 2, role: 'staff', phone: '09170000101', student_id: null };
const admin = { id: 1, role: 'admin' };
const partnerUser = { id: 5, role: 'partner' };
const approved = { user_id: 5, status: 'approved' };

describe('R1 + R4: only staff at this hub create points', () => {
  test('staff act only at the hubs they are assigned to', () => {
    assert.equal(canActAtHub(staff, 1, [1]), true);
    assert.equal(canActAtHub(staff, 2, [1]), false);
    assert.equal(canActAtHub(staff, '1', ['1']), true, 'ids from the database or a URL compare as numbers');
  });
  test('admins may act at any hub', () => {
    assert.equal(canActAtHub(admin, 99, []), true);
  });
  test('residents and partners never create points, even if somehow listed at a hub', () => {
    assert.equal(canActAtHub(resident, 1, [1]), false);
    assert.equal(canActAtHub(partnerUser, 1, [1]), false);
  });
  test('a suspended staff member cannot act', () => {
    assert.equal(canActAtHub({ ...staff, suspended: 1 }, 1, [1]), false);
  });
  test('the refusal is a 403 the apps can translate', () => {
    breaks(() => assertCanActAtHub(staff, 2, [1]), 'not_your_hub', 403);
  });
});

describe('R2: only approved partner organizations receive items', () => {
  test('an approved partner receives', () => {
    assert.equal(canReceiveItems(partnerUser, approved), true);
  });
  test('a pending or suspended partner does not', () => {
    assert.equal(canReceiveItems(partnerUser, { ...approved, status: 'pending' }), false);
    assert.equal(canReceiveItems(partnerUser, { ...approved, status: 'suspended' }), false);
  });
  test('a resident can never receive, so nobody gives to themselves or a second account', () => {
    assert.equal(canReceiveItems(resident, { user_id: resident.id, status: 'approved' }), false);
  });
  test('a partner cannot use another organization\'s approval', () => {
    assert.equal(canReceiveItems({ id: 6, role: 'partner' }, approved), false);
  });
  test('the refusal is a 403', () => {
    breaks(() => assertCanReceiveItems(resident, approved), 'partner_not_approved', 403);
  });
});

describe('R3: staff never process their own drop-off', () => {
  test('the same account', () => {
    breaks(() => assertNotOwnDropOff(staff, { ...staff, role: 'resident' }), 'own_drop_off', 403);
  });
  test('a second account with the same phone, written differently', () => {
    assert.equal(samePerson(staff, { id: 77, phone: '0917-000-0101' }), true);
    assert.equal(samePerson(staff, { id: 77, phone: '+639170000101' }), true);
  });
  test('a second account with the same student ID, in lower case', () => {
    assert.equal(samePerson({ id: 3, student_id: 'ABCD-1' }, { id: 4, student_id: 'abcd-1' }), true);
  });
  test('different people pass, and empty phones or IDs never match each other', () => {
    assert.equal(samePerson(staff, resident), false);
    assert.equal(samePerson({ id: 3, phone: null, student_id: null }, { id: 4, phone: null, student_id: null }), false);
    assertNotOwnDropOff(staff, resident);
  });
});

describe('R5: points follow weight and outcome', () => {
  test('outcomes and multipliers match the spec', () => {
    assert.deepEqual(OUTCOMES, ['reuse', 'repair', 'recycle', 'reject']);
    assert.deepEqual(OUTCOME_MULTIPLIER, { reuse: 1.0, repair: 0.8, recycle: 0.5, reject: 0 });
  });
  test('points = floor(kg x rate x multiplier)', () => {
    assert.equal(pointsFor(2.5, 10, 'reuse'), 25);
    assert.equal(pointsFor(2.5, 10, 'repair'), 20);
    assert.equal(pointsFor(2.5, 10, 'recycle'), 12);   // 12.5 rounds down
    assert.equal(pointsFor(0.1, 3, 'reuse'), 0);       // 0.3 rounds down
    assert.equal(pointsFor(0.1, 30, 'reuse'), 3, 'no floating-point loss of a point');
  });
  test('a rejected item earns nothing, however heavy', () => {
    assert.equal(pointsFor(400, 15, 'reject'), 0);
  });
  test('splitting one bag into many small items never earns more', () => {
    const whole = pointsFor(3, 7, 'recycle');
    const split = Array.from({ length: 30 }, () => pointsFor(0.1, 7, 'recycle')).reduce((a, b) => a + b, 0);
    assert.ok(split <= whole, `${split} <= ${whole}`);
  });
  test('weights must be above 0 and at most 500 kg', () => {
    for (const bad of [0, -1, 500.01, 'abc', null, Infinity]) breaks(() => checkWeight(bad), 'bad_weight');
    assert.equal(checkWeight('2.345'), 2.35, 'kept to 2 decimals, like the database');
    assert.equal(checkWeight(500), 500);
  });
  test('an unknown outcome or a broken rate is refused', () => {
    breaks(() => checkOutcome('donate'), 'bad_outcome');
    breaks(() => pointsFor(1, -5, 'reuse'), 'bad_category');
  });
  test('impact counts every kept kilogram but never rejected items', () => {
    const r = impactOf([
      { weight_kg: '2.00', outcome: 'reuse', co2_per_kg: '15' },
      { weight_kg: '1.50', outcome: 'recycle', co2_per_kg: '1.5' },
      { weight_kg: '9.00', outcome: 'reject', co2_per_kg: '15' },
      { weight_kg: null, outcome: null, co2_per_kg: '15' },   // not weighed yet
    ]);
    assert.deepEqual(r, { kg_kept: 3.5, co2e_avoided_kg: 32.3 });
  });
  test('badge tiers start at 0 and go up', () => {
    assert.equal(BADGES[0].min, 0);
    for (let i = 1; i < BADGES.length; i++) assert.ok(BADGES[i].min > BADGES[i - 1].min);
    assert.equal(badgeFor(0), 'seed');
    assert.equal(badgeFor(99), 'seed');
    assert.equal(badgeFor(100), 'sprout');
    assert.equal(badgeFor(5000), 'forest');
  });
});

describe('R6: points stay pending until the item is final', () => {
  test('each outcome sends the item to its first state, and every state is known', () => {
    assert.deepEqual(STATE_FOR_OUTCOME, { reuse: 'in_stock', repair: 'in_repair', recycle: 'in_recycle_batch', reject: 'rejected' });
    for (const to of Object.values(ITEM_TRANSITIONS).flat()) assert.ok(to in ITEM_TRANSITIONS, to);
  });
  test('final states lead nowhere', () => {
    for (const s of FINAL_STATES) assert.deepEqual(ITEM_TRANSITIONS[s], [], s);
  });
  test('the life cycle cannot be skipped or run backwards', () => {
    assertTransition('declared', 'received');
    assertTransition('received', 'in_stock');
    assertTransition('in_stock', 'released');
    breaks(() => assertTransition('declared', 'released'), 'bad_state');   // never weighed
    breaks(() => assertTransition('released', 'in_stock'), 'bad_state');   // already given out
    breaks(() => assertTransition('rejected', 'in_stock'), 'bad_state');
  });
  test('pending while moving, confirmed when final', () => {
    assert.equal(pointsStatus({ itemState: 'in_stock' }), 'pending');
    assert.equal(pointsStatus({ itemState: 'in_repair' }), 'pending');
    assert.equal(pointsStatus({ itemState: 'released' }), 'confirmed');
    assert.equal(pointsStatus({ itemState: 'recycled' }), 'confirmed');
    assert.equal(pointsStatus({ itemState: 'rejected' }), 'confirmed');   // 0 points, but settled
  });
  test('nothing is confirmed while other items of the same drop-off still wait to be sorted', () => {
    assert.equal(pointsStatus({ itemState: 'rejected', dropOffSorted: false }), 'pending');
    assert.equal(pointsStatus({ itemState: 'rejected', dropOffSorted: true }), 'confirmed');
  });
  test('an open flag holds the points; an upheld flag cancels them', () => {
    assert.equal(pointsStatus({ itemState: 'released', openFlag: true }), 'pending');
    assert.equal(pointsStatus({ itemState: 'released', flagUpheld: true }), 'cancelled');
  });
  test('only pending points can be worked out again', () => {
    assert.equal(repricePending({ status: 'pending' }, 12), 12);
    breaks(() => repricePending({ status: 'confirmed' }, 99), 'points_locked');
    breaks(() => repricePending({ status: 'cancelled' }, 99), 'points_locked');
  });
});

describe('R7: unusual weights go to an admin', () => {
  test('a normal day raises nothing', () => {
    assert.deepEqual(flagsFor({ dropOffKg: 5, residentKg30: 20, hubTodayKg: 30, hubDailyAvg30: 25 }), []);
  });
  test('one drop-off over 50 kg', () => {
    assert.deepEqual(flagsFor({ dropOffKg: 50 }), [], 'exactly 50 is fine');
    assert.deepEqual(flagsFor({ dropOffKg: 50.5 }), ['heavy_drop_off']);
  });
  test('a resident over 100 kg in 30 days', () => {
    assert.deepEqual(flagsFor({ residentKg30: 100.1 }), ['heavy_resident_month']);
  });
  test('a hub day over 3 times its average', () => {
    assert.deepEqual(flagsFor({ hubTodayKg: 91, hubDailyAvg30: 30 }), ['hub_day_spike']);
    assert.deepEqual(flagsFor({ hubTodayKg: 90, hubDailyAvg30: 30 }), [], 'exactly 3 times is fine');
  });
  test('a new or very small hub is not flagged for its first busy day', () => {
    assert.deepEqual(flagsFor({ hubTodayKg: 400, hubDailyAvg30: 0 }), []);
    assert.deepEqual(flagsFor({ hubTodayKg: 15, hubDailyAvg30: 1 }), [], 'under the minimum kg');
  });
  test('several flags at once', () => {
    assert.deepEqual(flagsFor({ dropOffKg: 80, residentKg30: 150, hubTodayKg: 200, hubDailyAvg30: 20 }),
      ['heavy_drop_off', 'heavy_resident_month', 'hub_day_spike']);
  });
});

describe('R8: one account per person', () => {
  test('phone numbers are stored one way', () => {
    assert.equal(normalizePhone('0917 123 4567'), '09171234567');
    assert.equal(normalizePhone('0917-123-4567'), '09171234567');
    assert.equal(normalizePhone('+63 917 123 4567'), '09171234567');
    assert.equal(normalizePhone(''), null);
    breaks(() => normalizePhone('call me'), 'bad_phone');
  });
  test('student IDs are stored in capitals', () => {
    assert.equal(normalizeStudentId(' 2023-00123 '), '2023-00123');
    assert.equal(normalizeStudentId('abcd-1'), 'ABCD-1');
    assert.equal(normalizeStudentId(''), null);
    breaks(() => normalizeStudentId('id #1'), 'bad_student_id');
  });
});

describe('R9: drop-off codes', () => {
  test('codes are 6 characters with no look-alikes (0/O, 1/I/L)', () => {
    assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
    for (let i = 0; i < 200; i++) {
      const c = newCode();
      assert.equal(c.length, RULES.codeLength);
      assert.ok(codeLooksValid(c), c);
    }
  });
  test('codes come from the random source given (secure by default)', () => {
    assert.equal(newCode(() => 0), 'AAAAAA');
    assert.equal(newCode(() => CODE_ALPHABET.length - 1), '999999');
  });
  test('typed codes are cleaned: spaces, dashes and lower case', () => {
    assert.equal(cleanCode(' ab3-xy7 '), 'AB3XY7');
    assert.ok(codeLooksValid('ab3 xy7'));
    assert.ok(!codeLooksValid('AB0XY7'), '0 is never used');
    assert.ok(!codeLooksValid('AB3XY'), 'too short');
  });
  test('at most 3 open declarations', () => {
    assertCanDeclare(0);
    assertCanDeclare(2);
    breaks(() => assertCanDeclare(3), 'too_many_open');
  });
  test('a code expires after 7 days', () => {
    const now = new Date('2026-11-12T00:00:00Z');
    assert.equal(codeExpiry(now).toISOString(), '2026-11-19T00:00:00.000Z');
  });
  test('a code works once, only while open and not expired', () => {
    const now = new Date('2026-11-12T04:00:00Z');   // 12:00 in Manila
    assertCodeUsable({ status: 'open', expires_at: '2026-11-12 12:00:01' }, now);
    breaks(() => assertCodeUsable({ status: 'open', expires_at: '2026-11-12 12:00:00' }, now), 'code_expired');
    breaks(() => assertCodeUsable({ status: 'received', expires_at: '2026-12-01 00:00:00' }, now), 'code_used');
    breaks(() => assertCodeUsable({ status: 'cancelled', expires_at: '2026-12-01 00:00:00' }, now), 'code_expired');
    breaks(() => assertCodeUsable(null, now), 'bad_code', 404);
  });
});

describe('R10: hazardous items go only to accredited recyclers', () => {
  const ewaste = { hazardous: 1 };
  const plastic = { hazardous: 0 };
  const junkShop = { accredited: 0, status: 'active' };
  const certified = { accredited: 1, status: 'active' };
  test('e-waste needs an accredited recycler', () => {
    assert.equal(canSendToRecycler(ewaste, certified), true);
    breaks(() => assertCanSendToRecycler(ewaste, junkShop), 'recycler_not_accredited');
  });
  test('ordinary recyclables can go to any active recycler', () => {
    assert.equal(canSendToRecycler(plastic, junkShop), true);
  });
  test('an inactive recycler receives nothing', () => {
    assert.equal(canSendToRecycler(plastic, { ...certified, status: 'inactive' }), false);
  });
});

describe('R11: food', () => {
  const food = { food: 1 };
  const today = '2026-11-12';
  test('food needs at least 3 days before it expires', () => {
    assert.equal(foodOk('2026-11-15', today), true);
    assert.equal(foodOk('2026-11-14', today), false);
    assert.equal(foodOk('2026-11-01', today), false);
    assert.equal(foodOk('', today), false);
    breaks(() => assertFoodOk(food, '2026-11-13', today), 'food_expiring');
  });
  test('other categories have no expiry rule', () => {
    assertFoodOk({ food: 0 }, null, today);
  });
  test('food goes only to an approved partner, and only while fresh', () => {
    assertFoodRelease(food, '2026-11-20', today, partnerUser, approved);
    breaks(() => assertFoodRelease(food, '2026-11-20', today, resident, approved), 'partner_not_approved', 403);
    breaks(() => assertFoodRelease(food, '2026-11-13', today, partnerUser, approved), 'food_expiring');
  });
});

describe('R13: rate limits', () => {
  test('code check-ins are limited so codes cannot be guessed', () => {
    // 30 tries per 15 minutes against about 887 million codes.
    assert.ok(RULES.codeCheckinsPer15Min <= 30);
    assert.ok(CODE_ALPHABET.length ** RULES.codeLength > 5e8);
  });
});

describe('moving items after sorting', () => {
  test('only moves inside the life cycle', () => {
    assertMove('in_repair', 'in_stock');
    assertMove('in_stock', 'in_recycle_batch');
    breaks(() => assertMove('in_stock', 'released'), 'bad_state');
    breaks(() => assertMove('released', 'in_stock'), 'bad_state');
  });
  test('the outcome follows the move; back to stock keeps the old one', () => {
    assert.equal(outcomeAfterMove('repair', 'in_stock'), 'repair');
    assert.equal(outcomeAfterMove('recycle', 'in_stock'), 'recycle');
    assert.equal(outcomeAfterMove('reuse', 'in_recycle_batch'), 'recycle');
    assert.equal(outcomeAfterMove('reuse', 'rejected'), 'reject');
  });
  test('points only go down, so a move can never be used to raise them', () => {
    assert.equal(pointsAfterMove(10, 2, 10, 'reuse'), 10, 'recycle points stay when moved to stock');
    assert.equal(pointsAfterMove(16, 2, 10, 'recycle'), 10);
    assert.equal(pointsAfterMove(20, 2, 10, 'reject'), 0);
  });
});
