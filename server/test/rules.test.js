// Fast unit tests for the rules in src/rules.js. No database or server needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULES, AVG_WEIGHT_KG, creditCost, handledByStaff, autoApproves, findProhibited } from '../src/rules.js';

const item = (tier, isShelf = false) => ({ tier, is_shelf: isShelf ? 1 : 0 });

describe('the rule numbers', () => {
  test('match what the app, the portal and the docs promise', () => {
    assert.equal(RULES.starterCredits, 3);
    assert.equal(RULES.lenderReward, 1);
    assert.equal(RULES.latePenalty, 1);
    assert.equal(RULES.maxLoanDays, 14);
    assert.equal(RULES.pairRewardCapPerMonth, 2);
    assert.equal(RULES.costLowMedium, 1);
    assert.equal(RULES.costHigh, 2);
    assert.equal(RULES.shelfCost, 0);
    assert.equal(RULES.pendingExpiryDays, 7);
    assert.equal(RULES.idPhotoRetentionDays, 7);
    assert.equal(RULES.unusedUploadGraceHours, 24);
  });
});

describe('creditCost', () => {
  test('low and medium items cost 1 credit', () => {
    assert.equal(creditCost(item('low')), 1);
    assert.equal(creditCost(item('medium')), 1);
  });
  test('high items cost 2 credits', () => {
    assert.equal(creditCost(item('high')), 2);
  });
  test('Barangay Shelf items are free, whatever their tier', () => {
    for (const tier of ['low', 'medium', 'high']) assert.equal(creditCost(item(tier, true)), 0);
  });
});

describe('who handles the loan', () => {
  test('staff handle high-tier and shelf items at the barangay hall', () => {
    assert.equal(handledByStaff(item('high')), true);
    assert.equal(handledByStaff(item('low', true)), true);
  });
  test('owners handle their own low and medium items', () => {
    assert.equal(handledByStaff(item('low')), false);
    assert.equal(handledByStaff(item('medium')), false);
  });
  test('only low-tier requests are approved at once', () => {
    assert.equal(autoApproves(item('low')), true);
    assert.equal(autoApproves(item('medium')), false);
    assert.equal(autoApproves(item('high')), false);
  });
});

describe('findProhibited', () => {
  const cases = [
    ['Pistol', 'pistol'],
    ['old gun for display', 'gun'],
    ['two guns', 'gun'],                 // plural
    ['Fireworks for New Year', 'fireworks'],
    ['firecrackers', 'firecracker'],     // plural
    ['Gamot sa ubo', 'gamot'],           // Filipino: medicine
    ['garden chemicals', 'chemical'],
  ];
  for (const [text, word] of cases) {
    test(`refuses "${text}"`, () => assert.equal(findProhibited(text), word));
  }
  const allowed = ['Gunting at tape', 'Folding chairs (6)', 'Extension ladder', 'Alcohol-free hand soap dispenser stand'];
  for (const text of allowed.slice(0, 3)) {
    test(`allows "${text}"`, () => assert.equal(findProhibited(text), null));
  }
  test('checks every text it is given (title and description together)', () => {
    assert.equal(findProhibited('Speaker', 'comes with a free vape'), 'vape');
    assert.equal(findProhibited('Speaker', null, undefined, ''), null);
  });
  test('whole words only: "alcohol-free" still contains the word "alcohol"', () => {
    // Documents current behavior: hyphens count as word boundaries, so this listing is refused.
    assert.equal(findProhibited(allowed[3]), 'alcohol');
  });
});

describe('impact estimate weights', () => {
  test('there is a weight for every category in the schema', () => {
    const schema = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'schema.sql'), 'utf8');
    const block = schema.slice(schema.indexOf('INSERT INTO categories'));
    const slugs = [...block.slice(0, block.indexOf(';')).matchAll(/\('([a-z]+)'/g)].map((m) => m[1]);
    assert.ok(slugs.length >= 4, 'found the category slugs');
    for (const slug of slugs) assert.ok(AVG_WEIGHT_KG[slug] > 0, `weight for "${slug}"`);
  });
});
