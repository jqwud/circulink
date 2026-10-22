// Rules and lists from the server, booked days, editing items and request dates, and small data rules.
// Seeded credits: Ana 4, Ben 1, Carlo 2, Dina 3, Elena 2, Fidel 3.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, one, todayPH } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let carlo; let dina; let fidel; let staff;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, fidel, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'fidel', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('rules and lists come from the server', () => {
  test('/meta carries the rule numbers the app shows', async () => {
    const meta = (await s.api('GET', '/meta', ana)).json;
    assert.equal(meta.rules.maxLoanDays, 14);
    assert.equal(meta.rules.starterCredits, 3);
    assert.equal(meta.rules.costHigh, 2);
    assert.ok(meta.puroks.includes('Purok 1'));
  });

  test('anyone can read the puroks (sign-up needs them); staff manage them', async () => {
    const list = (await s.api('GET', '/puroks')).json;
    assert.ok(list.length >= 7 && list.includes('Purok 7'));
    assert.equal((await s.api('POST', '/admin/puroks', ana, { name: 'Purok 8' })).status, 403);
    assert.equal((await s.api('POST', '/admin/puroks', staff, { name: 'Purok 8' })).status, 201);
    assert.ok((await s.api('GET', '/puroks')).json.includes('Purok 8'));
  });

  test('sign-up and profile accept only a listed purok', async () => {
    const odd = await s.api('POST', '/auth/register', null, { name: 'New One', email: 'new1@hiraman.test', password: 'goodpass1', purok: 'Purok 99', accept_privacy: true });
    assert.equal(odd.status, 400); assert.equal(odd.json.code, 'bad_purok');
    const ok = await s.api('POST', '/auth/register', null, { name: 'New One', email: 'new1@hiraman.test', password: 'goodpass1', purok: 'Purok 8', accept_privacy: true });
    assert.equal(ok.status, 201);
    assert.equal((await s.api('PATCH', '/me', carlo, { purok: 'Nowhere' })).json.code, 'bad_purok');
  });

  test('a removed purok is no longer offered, and people who live there keep it', async () => {
    assert.equal((await s.api('DELETE', `/admin/puroks/${encodeURIComponent('Purok 8')}`, staff)).status, 200);
    assert.ok(!(await s.api('GET', '/puroks')).json.includes('Purok 8'));
    assert.equal((await one("SELECT purok FROM users WHERE email = 'new1@hiraman.test'")).purok, 'Purok 8');
  });
});

describe('booked days', () => {
  test('an overdue item counts as booked up to today', async () => {
    const wrench = await itemId('Wrench set');
    const ranges = (await s.api('GET', `/items/${wrench}`, ana)).json.booked_ranges;
    assert.ok(ranges.some((r) => r.end_date === todayPH()), JSON.stringify(ranges));
  });
});

describe('changing the dates of a waiting request', () => {
  let luggage; let dinas; let fidels;
  test('setup: Dina\'s request for the luggage is approved; Fidel\'s waits', async () => {
    luggage = await itemId('Travel luggage (large)');
    dinas = (await s.api('POST', '/requests', dina, { item_id: luggage, start_date: day(5), end_date: day(6) })).json.id;
    assert.equal((await s.api('POST', `/requests/${dinas}/approve`, ana)).status, 200);
    fidels = (await s.api('POST', '/requests', fidel, { item_id: luggage, start_date: day(8), end_date: day(9) })).json.id;
  });

  test('only the borrower can change them, only while waiting', async () => {
    assert.equal((await s.api('PATCH', `/requests/${fidels}/dates`, ana, { start_date: day(9), end_date: day(10) })).status, 403);
    const approved = await s.api('PATCH', `/requests/${dinas}/dates`, dina, { start_date: day(5), end_date: day(7) });
    assert.equal(approved.status, 400); assert.equal(approved.json.code, 'bad_state');
  });

  test('the same checks as a new request: real dates, at most 14 days, not booked', async () => {
    const long = await s.api('PATCH', `/requests/${fidels}/dates`, fidel, { start_date: day(8), end_date: day(30) });
    assert.equal(long.json.code, 'too_long');
    const clash = await s.api('PATCH', `/requests/${fidels}/dates`, fidel, { start_date: day(6), end_date: day(7) });
    assert.equal(clash.status, 400); assert.equal(clash.json.code, 'dates_booked');
  });

  test('a good change is saved and the owner is told', async () => {
    const r = await s.api('PATCH', `/requests/${fidels}/dates`, fidel, { start_date: day(9), end_date: day(10) });
    assert.equal(r.status, 200);
    const row = await one('SELECT start_date, end_date FROM requests WHERE id = ?', [fidels]);
    assert.deepEqual([row.start_date, row.end_date], [day(9), day(10)]);
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'request_dates_changed' AND ref_id = ?", [fidels]));
  });

  test('an item with an active loan cannot change its tier, but can change its name', async () => {
    const tier = await s.api('PATCH', `/items/${luggage}`, ana, { tier: 'low' });
    assert.equal(tier.status, 400); assert.equal(tier.json.code, 'item_busy');
    const name = await s.api('PATCH', `/items/${luggage}`, ana, { title: 'Travel luggage (large, blue)' });
    assert.equal(name.status, 200); assert.equal(name.json.title, 'Travel luggage (large, blue)');
  });
});

describe('small data rules', () => {
  test('staff cannot approve a resident who has not sent an ID photo', async () => {
    const u = await one("SELECT id FROM users WHERE email = 'new1@hiraman.test'");
    const r = await s.api('POST', `/admin/users/${u.id}/approve`, staff);
    assert.equal(r.status, 400); assert.equal(r.json.code, 'no_id_photo');
  });

  test('staff can restore what they removed, but not what the owner deleted', async () => {
    const board = await itemId('Portable whiteboard');
    assert.equal((await s.api('DELETE', `/items/${board}`, ben)).status, 200);
    const owners = await s.api('POST', `/admin/items/${board}/restore`, staff);
    assert.equal(owners.status, 400); assert.equal(owners.json.code, 'owner_removed');
    const glue = await itemId('Glue gun with sticks');
    assert.equal((await s.api('POST', `/admin/items/${glue}/remove`, staff, { reason: 'Photo check' })).status, 200);
    assert.equal((await s.api('POST', `/admin/items/${glue}/restore`, staff)).status, 200);
  });

  test('a phone number can be cleared, and must look like one', async () => {
    assert.equal((await s.api('PATCH', '/me', carlo, { phone: 'call me' })).json.code, 'bad_phone');
    assert.equal((await s.api('PATCH', '/me', carlo, { phone: '' })).json.phone, null);
    assert.equal((await s.api('PATCH', '/me', carlo, { phone: '0917 123 4567' })).json.phone, '0917 123 4567');
  });

  test('searching for % or _ finds nothing instead of everything', async () => {
    assert.equal((await s.api('GET', `/items?q=${encodeURIComponent('%')}`, ana)).json.length, 0);
    assert.equal((await s.api('GET', `/items?q=${encodeURIComponent('_')}`, ana)).json.length, 0);
    assert.equal((await s.api('GET', `/admin/users?q=${encodeURIComponent('%')}`, staff)).json.length, 0);
    assert.ok((await s.api('GET', '/items?q=chairs', ana)).json.length >= 1, 'normal search still works');
  });
});
