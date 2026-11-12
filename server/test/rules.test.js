// The rule numbers agree with the spec (docs/CIRCULAR_HUB_SPEC.md). The rule functions R1 to R13 and their
// tests are added in build step 2.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RULES, OUTCOMES, OUTCOME_MULTIPLIER, BADGES } from '../src/rules.js';

describe('rule numbers', () => {
  test('outcomes and multipliers match the spec; a rejected item earns nothing (R5)', () => {
    assert.deepEqual(OUTCOMES, ['reuse', 'repair', 'recycle', 'reject']);
    assert.deepEqual(OUTCOME_MULTIPLIER, { reuse: 1.0, repair: 0.8, recycle: 0.5, reject: 0 });
  });
  test('codes and declarations (R9)', () => {
    assert.equal(RULES.codeLength, 6);
    assert.equal(RULES.codeValidDays, 7);
    assert.equal(RULES.maxOpenDeclarations, 3);
  });
  test('review thresholds (R7) and food (R11)', () => {
    assert.equal(RULES.flagDropOffOverKg, 50);
    assert.equal(RULES.flagResidentOverKgPer30Days, 100);
    assert.equal(RULES.flagHubDayOverAverageTimes, 3);
    assert.equal(RULES.foodMinDaysToExpiry, 3);
  });
  test('badge tiers start at 0 and go up', () => {
    assert.equal(BADGES[0].min, 0);
    for (let i = 1; i < BADGES.length; i++) assert.ok(BADGES[i].min > BADGES[i - 1].min);
  });
});
