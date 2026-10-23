// Hiraman 2.0, batch 28: Barangay vs Kapitbahay (neighbor) items, the Barangay item rules, extending a
// loan, the one-time lender terms, and rating the barangay's service.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let carlo; let dina; let staff; let admin;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const userId = async (who) => (await one('SELECT id FROM users WHERE email = ?', [`${who}@hiraman.test`])).id;
const borrow = (token, item, from, to) => s.api('POST', '/requests', token, { item_id: item, start_date: day(from), end_date: day(to) });

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, staff, admin] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'staff', 'admin'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('origin labels and filters', () => {
  test('every item says whether it belongs to the barangay or a neighbor', async () => {
    const all = (await s.api('GET', '/items?limit=100', carlo)).json;
    assert.ok(all.length > 0);
    for (const i of all) assert.equal(i.origin, i.is_shelf ? 'barangay' : 'kapitbahay');
  });
  test('Browse filters by origin', async () => {
    const brgy = (await s.api('GET', '/items?origin=barangay', carlo)).json;
    const kap = (await s.api('GET', '/items?origin=kapitbahay', carlo)).json;
    assert.ok(brgy.length > 0 && brgy.every((i) => i.origin === 'barangay'));
    assert.ok(kap.length > 0 && kap.every((i) => i.origin === 'kapitbahay'));
  });
});

describe('Barangay item rules', () => {
  test('staff set a shorter loan limit on a Barangay item only', async () => {
    const tent = await itemId('Shelf: Event tent (3 x 3 m)');
    const r = await s.api('PATCH', `/admin/items/${tent}`, staff, { max_loan_days: 3 });
    assert.equal(r.status, 200); assert.equal(r.json.max_loan_days, 3);
    const cooler = await itemId('Cooler box');
    assert.equal((await s.api('PATCH', `/admin/items/${cooler}`, staff, { max_loan_days: 3 })).json.code, 'barangay_only');
    assert.equal((await s.api('PATCH', `/admin/items/${tent}`, staff, { max_loan_days: 40 })).json.code, 'bad_max_days');
    assert.equal((await s.api('GET', `/items/${cooler}`, carlo)).json.max_loan_days, 14, 'neighbors\' items keep the normal limit');
  });
  test('a request longer than the item\'s limit is refused', async () => {
    const tent = await itemId('Shelf: Event tent (3 x 3 m)');
    const long = await borrow(carlo, tent, 1, 4);
    assert.equal(long.status, 400); assert.equal(long.json.code, 'too_long'); assert.match(long.json.error, /3 days/);
    assert.equal((await borrow(carlo, tent, 1, 3)).status, 201);
  });

  test('two late returns of Barangay items in 90 days pause Barangay borrowing for 30 days', async () => {
    const tables = await itemId('Shelf: Folding tables (4)');
    for (let n = 0; n < 2; n++) {
      const r = await borrow(dina, tables, 0, 0);
      assert.equal(r.json.status, 'approved');
      await s.api('POST', `/requests/${r.json.id}/handover`, staff);
      await q('UPDATE requests SET start_date = ?, end_date = ? WHERE id = ?', [day(-3), day(-2), r.json.id]);
      const back = await s.api('POST', `/requests/${r.json.id}/return`, staff, { condition: 'good' });
      assert.equal(back.json.on_time, false);
    }
    const u = await one('SELECT shelf_paused_until FROM users WHERE id = ?', [await userId('dina')]);
    assert.equal(u.shelf_paused_until, day(30));
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'shelf_paused' AND user_id = ?", [await userId('dina')]));
    const again = await borrow(dina, await itemId('Shelf: Portable whiteboard'), 1, 1);
    assert.equal(again.status, 403); assert.equal(again.json.code, 'shelf_paused');
    assert.equal((await borrow(dina, await itemId('Badminton rackets (2) with shuttlecocks'), 20, 20)).status, 201, 'neighbors\' items are still fine');
  });
  test('staff can lift the pause', async () => {
    const dinaId = await userId('dina');
    assert.equal((await s.api('POST', `/admin/users/${dinaId}/shelf-pause`, staff, { paused: false })).status, 200);
    assert.equal((await borrow(dina, await itemId('Shelf: Portable whiteboard'), 1, 1)).status, 201);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'shelf_pause_lifted'"));
  });
});

describe('extending a loan', () => {
  let loan;
  test('setup: Carlo has Ben\'s cooler out for 2 days', async () => {
    const r = await borrow(carlo, await itemId('Cooler box'), 0, 1);
    await s.api('POST', `/requests/${r.json.id}/handover`, ben);
    loan = r.json.id;
    assert.equal((await s.api('GET', `/requests/${loan}`, ben)).json.extend_max, 7);
  });
  test('only the owner extends a neighbor\'s loan, within the limits', async () => {
    assert.equal((await s.api('POST', `/requests/${loan}/extend`, carlo, { days: 2 })).status, 403);
    assert.equal((await s.api('POST', `/requests/${loan}/extend`, ben, { days: 8 })).json.code, 'bad_days');
    const ok = await s.api('POST', `/requests/${loan}/extend`, ben, { days: 2 });
    assert.equal(ok.status, 200); assert.equal(ok.json.end_date, day(3));
    const n = await one("SELECT params FROM notifications WHERE type = 'request_extended' AND ref_id = ?", [loan]);
    assert.equal(n.params.end, day(3));
  });
  test('a loan is extended once', async () => {
    assert.equal((await s.api('GET', `/requests/${loan}`, ben)).json.extend_max, 0);
    assert.equal((await s.api('POST', `/requests/${loan}/extend`, ben, { days: 1 })).json.code, 'already_extended');
  });
  test('an extension never runs into the next booking', async () => {
    const cooler = await itemId('Cooler box');
    const next = await borrow(ana, cooler, 5, 6);
    await s.api('POST', `/requests/${next.json.id}/approve`, ben);
    await q("UPDATE users SET credits = credits + 2 WHERE email = 'dina@hiraman.test'"); // her late returns cost credits above
    const r = await borrow(dina, cooler, 8, 8);
    await s.api('POST', `/requests/${r.json.id}/approve`, ben);
    await q('UPDATE requests SET status = ?, start_date = ?, end_date = ? WHERE id = ?', ['handed_over', day(0), day(4), next.json.id]);
    const blocked = await s.api('POST', `/requests/${next.json.id}/extend`, ben, { days: 5 });
    assert.equal(blocked.json.code, 'dates_booked');
  });
  test('staff extend Barangay loans', async () => {
    const r = await borrow(carlo, await itemId('Shelf: Basic hand-tool set'), 0, 1);
    await s.api('POST', `/requests/${r.json.id}/handover`, staff);
    assert.equal((await s.api('POST', `/requests/${r.json.id}/extend`, staff, { days: 3 })).status, 200);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'request_extended'"));
  });
});

describe('lender terms, once before the first listing', () => {
  let newbie;
  test('setup: a newly verified resident', async () => {
    const reg = await s.api('POST', '/auth/register', null, { name: 'Lito Garcia', email: 'lito@hiraman.test', password: 'goodpass1', accept_privacy: true });
    await q("UPDATE users SET verification_status = 'approved', credits = 3 WHERE id = ?", [reg.json.user.id]);
    newbie = reg.json.token;
  });
  test('the first listing asks to accept the terms; later ones do not', async () => {
    const item = { title: 'Rice cooker', category_id: 1, pickup_point_id: 1, tier: 'low' };
    const first = await s.api('POST', '/items', newbie, item);
    assert.equal(first.status, 400); assert.equal(first.json.code, 'terms_required');
    assert.equal((await s.api('POST', '/items', newbie, { ...item, accept_terms: true })).status, 201);
    assert.equal((await s.api('POST', '/items', newbie, { ...item, title: 'Electric fan' })).status, 201);
    assert.equal((await s.api('GET', '/me', newbie)).json.lender_terms_accepted, true);
  });
});

describe('rating the barangay\'s service', () => {
  test('a borrower rates a closed Barangay loan; staff see the average', async () => {
    const r = await borrow(ana, await itemId('Shelf: Monobloc chairs (30)'), 0, 0);
    await s.api('POST', `/requests/${r.json.id}/handover`, staff);
    await s.api('POST', `/requests/${r.json.id}/return`, staff, { condition: 'good' });
    const rated = await s.api('POST', `/requests/${r.json.id}/rate`, ana, { stars: 4 });
    assert.equal(rated.status, 200);
    assert.equal((await one('SELECT ratee_id FROM ratings WHERE request_id = ?', [r.json.id])).ratee_id, null);
    const stats = (await s.api('GET', '/admin/stats', admin)).json;
    assert.deepEqual(stats.barangay_service_rating, { average: 4, count: 1 });
  });
});
