// Automatic flags: listings that look unusual or possibly harmful are held back (hidden) until staff check them.
//   disguised_word: a banned word written to slip past the filter ("g u n", "g@mot", "p1stol")
//   value_tier: something valuable listed below the high tier (laptop, generator, projector)
//   new_account_burst: many listings from a brand-new account
//   reported: an item reported by two or more different neighbors
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { screenListing, normalizeDisguise } from '../src/rules.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, PNG } from './helpers/api.js';

let s; let ana; let ben; let carlo; let dina; let staff;
const share = (token, title, extra = {}) => s.api('POST', '/items', token, { title, category_id: 2, pickup_point_id: 1, tier: 'low', ...extra });

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('the checks themselves', () => {
  const cases = [
    ['Old g u n for display', 'low', ['disguised_word']],
    ['g.u.n holder', 'low', ['disguised_word']],
    ['Leftover g@mot', 'low', ['disguised_word']],
    ['P1STOL case', 'low', ['disguised_word']],
    ['Laptop for school', 'low', ['value_tier']],
    ['Laptop for school', 'medium', ['value_tier']],
    ['Laptop for school', 'high', []],
    ['Portable generator', 'medium', ['value_tier']],
    ['Gunting at tape', 'low', []],
    ['Big unit cabinet', 'low', []],
    ['Folding chairs (set of 12)', 'low', []],
    ['Large cooking pot (30 L)', 'low', []],
  ];
  for (const [title, tier, flags] of cases) {
    test(`"${title}" (${tier}) -> ${flags.join(', ') || 'no flag'}`, () => assert.deepEqual(screenListing({ title, tier }), flags));
  }
  test('a plainly banned word is not "disguised": it is refused outright, as before', () => {
    assert.deepEqual(screenListing({ title: 'Old gun', tier: 'low' }), []);
    assert.match(normalizeDisguise('g u n'), /\bgun\b/);
  });
});

describe('a flagged listing is held back', () => {
  let id;
  test('sharing it works, but it is flagged and neighbors cannot see or book it', async () => {
    const r = await share(ana, 'Old g.u.n for display');
    assert.equal(r.status, 201);
    assert.equal(r.json.review_status, 'flagged');
    id = r.json.id;
    assert.ok(!(await s.api('GET', '/items', ben)).json.some((i) => i.id === id));
    assert.equal((await s.api('GET', `/items/${id}`, ben)).status, 404);
  });

  test('the owner is told it is being checked, and staff get a high-priority count and the reasons', async () => {
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'item_flagged' AND ref_id = ?", [id]));
    assert.ok((await s.api('GET', '/admin/stats', staff)).json.flagged_listings >= 1);
    const row = (await s.api('GET', '/admin/items?review=flagged', staff)).json.find((i) => i.id === id);
    assert.deepEqual(row.review_flags, ['disguised_word']);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'item_flagged' AND target LIKE ?", [`item #${id}%`]));
  });

  test('staff can clear it; an owner edit that looks suspicious again is flagged again', async () => {
    assert.equal((await s.api('POST', `/admin/items/${id}/show`, staff)).status, 200);
    assert.ok((await s.api('GET', '/items', ben)).json.some((i) => i.id === id));
    await s.api('PATCH', `/items/${id}`, ana, { description: 'Display piece only' });
    assert.equal((await one('SELECT review_status FROM items WHERE id = ?', [id])).review_status, 'ok', 'a harmless edit keeps it visible');
    await s.api('PATCH', `/items/${id}`, ana, { title: 'p1stol display' });
    assert.equal((await one('SELECT review_status FROM items WHERE id = ?', [id])).review_status, 'flagged');
  });

  test('valuable things listed below the high tier are held back too', async () => {
    const r = await share(carlo, 'Gaming laptop', { tier: 'medium' });
    assert.equal(r.json.review_status, 'flagged');
    const ok = await share(carlo, 'Gaming laptop', { tier: 'high' });
    assert.equal(ok.json.review_status, 'ok');
  });
});

describe('patterns across listings and reports', () => {
  test('a brand-new account sharing many items in its first day is held back from the third item', async () => {
    const reg = await s.api('POST', '/auth/register', null, { name: 'New Lender', email: 'newlender@hiraman.test', password: 'goodpass1', accept_privacy: true });
    const t = reg.json.token;
    await s.api('POST', '/me/id-consent', t);
    await s.upload('/me/id-photo', t, PNG, 'image/png', 'id.png');
    await s.api('POST', `/admin/users/${reg.json.user.id}/approve`, staff);
    assert.equal((await share(t, 'Extension cord')).json.review_status, 'ok');
    assert.equal((await share(t, 'Measuring tape')).json.review_status, 'ok');
    const third = await share(t, 'Hammer');
    assert.equal(third.json.review_status, 'flagged');
    assert.ok((await one('SELECT review_flags FROM items WHERE id = ?', [third.json.id])).review_flags.includes('new_account_burst'));
  });

  test('an item reported by two different neighbors is held back; one neighbor reporting twice is not enough', async () => {
    const pot = (await one("SELECT id FROM items WHERE title = 'Large cooking pot (30 L)'")).id;
    const report = (token) => s.api('POST', '/reports', token, { target_type: 'item', target_id: pot, reason: 'Unsafe or prohibited item', details: 'Smells of fuel' });
    await report(carlo);
    await report(carlo);
    assert.equal((await one('SELECT review_status FROM items WHERE id = ?', [pot])).review_status, 'ok');
    await report(dina);
    const row = await one('SELECT review_status, review_flags FROM items WHERE id = ?', [pot]);
    assert.equal(row.review_status, 'flagged');
    assert.equal(row.review_flags, 'reported');
    assert.equal((await q("SELECT id FROM notifications WHERE type = 'item_flagged' AND ref_id = ?", [pot])).length, 1);
  });
});
