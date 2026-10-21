// Booking safety: no duplicate requests, and approval respects items that are overdue.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ben; let carlo; let elena; let fidel;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const userId = async (email) => (await one('SELECT id FROM users WHERE email = ?', [email])).id;
const credits = async (token) => (await s.api('GET', '/me', token)).json.credits;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ben, carlo, elena, fidel] = await Promise.all(['ben', 'carlo', 'elena', 'fidel'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('duplicate requests', () => {
  test('asking twice for the same item and dates is refused, and only one credit is held', async () => {
    const drill = await itemId('Electric drill');
    const before = await credits(ben);
    const first = await s.api('POST', '/requests', ben, { item_id: drill, start_date: day(5), end_date: day(6) });
    assert.equal(first.status, 201); assert.equal(first.json.status, 'pending');
    const again = await s.api('POST', '/requests', ben, { item_id: drill, start_date: day(5), end_date: day(6) });
    assert.equal(again.status, 400); assert.equal(again.json.code, 'duplicate_request');
    const overlapping = await s.api('POST', '/requests', ben, { item_id: drill, start_date: day(6), end_date: day(7) });
    assert.equal(overlapping.status, 400); assert.equal(overlapping.json.code, 'duplicate_request');
    assert.equal(await credits(ben), before - 1);
  });

  test('the same dates after cancelling, or other dates, are fine', async () => {
    // Ben has 1 credit left in the demo data, so each new request is made after the previous one is cancelled.
    const drill = await itemId('Electric drill');
    const cancelFirst = async (start) => {
      const mine = (await s.api('GET', '/requests?as=borrower', ben)).json.find((r) => r.item.id === drill && r.start_date === start && r.status === 'pending');
      assert.equal((await s.api('POST', `/requests/${mine.id}/cancel`, ben)).status, 200);
    };
    await cancelFirst(day(5));
    const retry = await s.api('POST', '/requests', ben, { item_id: drill, start_date: day(5), end_date: day(6) });
    assert.equal(retry.status, 201, JSON.stringify(retry.json));
    await cancelFirst(day(5));
    const later = await s.api('POST', '/requests', ben, { item_id: drill, start_date: day(9), end_date: day(9) });
    assert.equal(later.status, 201, JSON.stringify(later.json));
  });

  test('sending the same kit request twice does not book everything twice', async () => {
    const kit = (await s.api('GET', '/kits', fidel)).json.find((k) => k.name_en === 'Home repair kit');
    const first = await s.api('POST', `/kits/${kit.id}/request`, fidel, { start_date: day(20), end_date: day(21) });
    assert.equal(first.status, 201); assert.ok(first.json.created.length >= 1);
    const again = await s.api('POST', `/kits/${kit.id}/request`, fidel, { start_date: day(20), end_date: day(21) });
    assert.equal(again.status, 400);
    const mine = await q("SELECT COUNT(*) n FROM requests WHERE borrower_id = ? AND start_date = ? AND status IN ('pending','approved')", [await userId('fidel@hiraman.test'), day(20)]);
    assert.equal(mine[0].n, first.json.created.length);
  });
});

describe('kit dates', () => {
  test('a kit request without dates gets a clear 400, not a server error', async () => {
    const kit = (await s.api('GET', '/kits', fidel)).json[0];
    const r = await s.api('POST', `/kits/${kit.id}/request`, fidel, {});
    assert.equal(r.status, 400); assert.equal(r.json.code, 'bad_dates');
  });
});

describe('approving respects overdue loans', () => {
  test('an owner cannot approve dates while the item is still out and overdue', async () => {
    const ladder = await itemId('Ladder (6 ft)');
    const pending = await s.api('POST', '/requests', elena, { item_id: ladder, start_date: day(0), end_date: day(1) });
    assert.equal(pending.status, 201); assert.equal(pending.json.status, 'pending');
    // Meanwhile the ladder turns out to be out with Fidel, overdue since yesterday.
    await q(`INSERT INTO requests (item_id, borrower_id, start_date, end_date, status, credit_cost, credits_held, handed_over_at)
             VALUES (?,?,?,?, 'handed_over', 1, 1, NOW() - INTERVAL 4 DAY)`, [ladder, await userId('fidel@hiraman.test'), day(-4), day(-1)]);
    const approve = await s.api('POST', `/requests/${pending.json.id}/approve`, carlo);
    assert.equal(approve.status, 400);
    assert.equal(approve.json.code, 'dates_booked');
  });
});
