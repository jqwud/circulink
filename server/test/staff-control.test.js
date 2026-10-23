// Staff can step in: cancel any waiting or booked request (with refunds), and hide or show any listing.
// A hidden listing disappears for neighbors everywhere (browse, kits, booking) but its owner still sees why.
// Seeded credits: Ana 4, Ben 1, Carlo 2, Dina 3, Elena 2, Fidel 3.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let carlo; let dina; let staff;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const credits = async (token) => (await s.api('GET', '/me', token)).json.credits;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('staff cancel a request', () => {
  test('a waiting or booked request can be cancelled by staff with a reason; held credits come back; both sides are told', async () => {
    const r = await s.api('POST', '/requests', carlo, { item_id: await itemId('Bluetooth speaker'), start_date: day(9), end_date: day(10) });
    const before = await credits(carlo);
    const noReason = await s.api('POST', `/admin/requests/${r.json.id}/cancel`, staff, {});
    assert.equal(noReason.status, 400); assert.equal(noReason.json.code, 'reason_required');
    const ok = await s.api('POST', `/admin/requests/${r.json.id}/cancel`, staff, { reason: 'Owner asked the barangay to stop it' });
    assert.equal(ok.status, 200);
    assert.equal((await one('SELECT status FROM requests WHERE id = ?', [r.json.id])).status, 'cancelled');
    assert.equal(await credits(carlo), before + 1);
    assert.equal((await q("SELECT id FROM notifications WHERE type = 'request_cancelled_by_staff' AND ref_id = ?", [r.json.id])).length, 2);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'request_cancelled_by_staff' AND target LIKE ?", [`request #${r.json.id}%`]));
  });

  test('residents cannot use it, and a loan that is already out cannot be cancelled', async () => {
    const out = await one("SELECT id FROM requests WHERE status = 'handed_over' LIMIT 1");
    assert.equal((await s.api('POST', `/admin/requests/${out.id}/cancel`, ana, { reason: 'x' })).status, 403);
    const r = await s.api('POST', `/admin/requests/${out.id}/cancel`, staff, { reason: 'x' });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'bad_state');
  });

  test('staff can also approve a request for an item its owner handles', async () => {
    const r = await s.api('POST', '/requests', dina, { item_id: await itemId('Ladder (6 ft)'), start_date: day(12), end_date: day(13) });
    assert.equal(r.json.status, 'pending');
    assert.equal((await s.api('POST', `/requests/${r.json.id}/approve`, staff)).status, 200);
  });
});

describe('staff hide and show a listing', () => {
  let cooler;
  test('setup: Carlo has a request waiting for Ben\'s cooler', async () => {
    cooler = await itemId('Cooler box');
    const r = await s.api('POST', '/requests', carlo, { item_id: cooler, start_date: day(15), end_date: day(16) });
    assert.equal(r.status, 201);
  });

  test('hiding needs a reason, refunds open requests and tells the owner', async () => {
    const carloBefore = await credits(carlo);
    assert.equal((await s.api('POST', `/admin/items/${cooler}/hide`, staff, {})).json.code, 'reason_required');
    const r = await s.api('POST', `/admin/items/${cooler}/hide`, staff, { reason: 'Photo shows a different item' });
    assert.equal(r.status, 200);
    assert.equal(await credits(carlo), carloBefore + 1, 'the booking was refunded');
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'item_hidden' AND user_id = (SELECT id FROM users WHERE email = 'ben@hiraman.test')"));
  });

  test('neighbors no longer find it, cannot open it and cannot book it', async () => {
    assert.ok(!(await s.api('GET', '/items', ana)).json.some((i) => i.id === cooler));
    assert.equal((await s.api('GET', `/items/${cooler}`, ana)).status, 404);
    const book = await s.api('POST', '/requests', dina, { item_id: cooler, start_date: day(20), end_date: day(21) });
    assert.equal(book.status, 400); assert.equal(book.json.code, 'item_unavailable');
  });

  test('the owner still sees it, marked hidden with the reason', async () => {
    const mine = (await s.api('GET', '/my/items', ben)).json.find((i) => i.id === cooler);
    assert.equal(mine.review_status, 'hidden');
    assert.equal(mine.review_note, 'Photo shows a different item');
    assert.equal((await s.api('GET', `/items/${cooler}`, ben)).status, 200);
  });

  test('showing it again makes it visible and tells the owner', async () => {
    assert.equal((await s.api('POST', `/admin/items/${cooler}/show`, staff)).status, 200);
    assert.ok((await s.api('GET', '/items', ana)).json.some((i) => i.id === cooler));
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'item_shown'"));
  });

  test('staff can edit any listing, and the portal list shows hidden items with their state', async () => {
    const e = await s.api('PATCH', `/admin/items/${cooler}`, staff, { title: 'Cooler box (60 L)' });
    assert.equal(e.status, 200); assert.equal(e.json.title, 'Cooler box (60 L)');
    await s.api('POST', `/admin/items/${cooler}/hide`, staff, { reason: 'Check again' });
    const row = (await s.api('GET', '/admin/items?review=hidden', staff)).json.find((i) => i.id === cooler);
    assert.equal(row.review_status, 'hidden');
  });
});
