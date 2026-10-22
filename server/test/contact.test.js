// Contact between neighbors: phone numbers after approval (until 7 days after the loan closes; items the
// barangay handles show the hall), and a message thread on every request for borrower, owner and staff.
// Seeded credits: Ana 4, Ben 1, Carlo 2, Dina 3, Elena 2, Fidel 3.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let carlo; let dina; let fidel; let staff;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const view = async (id, token) => (await s.api('GET', `/requests/${id}`, token)).json;
const unread = async (email, id) => (await q(
  "SELECT n.id FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ? AND n.type = 'message' AND n.ref_id = ? AND n.read_at IS NULL",
  [email, id])).length;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, fidel, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'fidel', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('phone numbers', () => {
  let speaker;
  test('a waiting request shows no phone number to either side', async () => {
    const r = await s.api('POST', '/requests', carlo, { item_id: await itemId('Bluetooth speaker'), start_date: day(6), end_date: day(7) });
    assert.equal(r.json.status, 'pending'); speaker = r.json.id;
    assert.equal((await view(speaker, carlo)).contact, null);
    assert.equal((await view(speaker, ana)).contact, null);
  });

  test('after approval each side sees the other\'s first name and phone', async () => {
    assert.equal((await s.api('POST', `/requests/${speaker}/approve`, ana)).status, 200);
    const forBorrower = (await view(speaker, carlo)).contact;
    assert.deepEqual(forBorrower, { kind: 'person', name: 'Ana', phone: '0917 000 0001' });
    const forOwner = (await view(speaker, ana)).contact;
    assert.equal(forOwner.kind, 'person'); assert.equal(forOwner.name, 'Carlo'); assert.ok(forOwner.phone);
  });

  test('the list of requests never carries phone numbers for other people\'s loans', async () => {
    const list = (await s.api('GET', '/admin/requests', staff)).json;
    assert.ok(list.every((r) => r.contact === null || r.contact === undefined));
  });

  test('items the barangay handles show the barangay hall, not a person', async () => {
    const shelf = (await s.api('GET', '/items?shelf=1', dina)).json.find((i) => i.tier === 'low');
    const r = await s.api('POST', '/requests', dina, { item_id: shelf.id, start_date: day(2), end_date: day(3) });
    assert.equal(r.json.status, 'approved', 'low-tier shelf items are approved at once');
    const c = (await view(r.json.id, dina)).contact;
    assert.equal(c.kind, 'hall'); assert.equal(c.name, 'Barangay Hall'); assert.ok(c.hours);
  });

  test('a closed loan keeps the numbers for 7 days, then hides them', async () => {
    assert.equal((await s.api('POST', `/requests/${speaker}/cancel`, carlo)).status, 200);
    assert.equal((await view(speaker, carlo)).contact, null, 'a cancelled request shows nothing');
    const mat = await s.api('POST', '/requests', ben, { item_id: await itemId('Badminton rackets (2) with shuttlecocks'), start_date: day(0), end_date: day(1) });
    await s.api('POST', `/requests/${mat.json.id}/handover`, fidel);
    await s.api('POST', `/requests/${mat.json.id}/return`, fidel, { condition: 'good' });
    assert.ok((await view(mat.json.id, ben)).contact, 'just closed: still shown');
    await q('UPDATE requests SET returned_at = NOW() - INTERVAL 7 DAY WHERE id = ?', [mat.json.id]);
    assert.ok((await view(mat.json.id, ben)).contact, 'day 7: still shown');
    await q('UPDATE requests SET returned_at = NOW() - INTERVAL 8 DAY WHERE id = ?', [mat.json.id]);
    assert.equal((await view(mat.json.id, ben)).contact, null, 'day 8: hidden');
  });
});

describe('the message thread', () => {
  let id;
  test('setup: Fidel asks for Ana\'s luggage (a medium item, so it waits for Ana)', async () => {
    const r = await s.api('POST', '/requests', fidel, { item_id: await itemId('Travel luggage (large)'), start_date: day(4), end_date: day(6) });
    assert.equal(r.json.status, 'pending'); id = r.json.id;
  });

  test('borrower and owner can write, even while the request is waiting', async () => {
    const a = await s.api('POST', `/requests/${id}/messages`, fidel, { body: 'Hi Ana, does it have a lock?' });
    assert.equal(a.status, 201);
    const b = await s.api('POST', `/requests/${id}/messages`, ana, { body: 'Yes, a number lock. I will tell you the code.' });
    assert.equal(b.status, 201);
    const thread = (await s.api('GET', `/requests/${id}/messages`, fidel)).json;
    assert.equal(thread.open, true);
    assert.deepEqual(thread.messages.map((m) => [m.from, m.mine]), [['Fidel', true], ['Ana', false]]);
  });

  test('nobody else can read or write; staff can do both', async () => {
    assert.equal((await s.api('GET', `/requests/${id}/messages`, ben)).status, 403);
    assert.equal((await s.api('POST', `/requests/${id}/messages`, ben, { body: 'hello' })).status, 403);
    assert.equal((await s.api('POST', `/requests/${id}/messages`, staff, { body: 'The hall can keep it overnight if needed.' })).status, 201);
    const thread = (await s.api('GET', `/requests/${id}/messages`, staff)).json;
    assert.equal(thread.messages.at(-1).from, 'Barangay staff');
    assert.equal(thread.messages.at(-1).staff, true);
  });

  test('empty and very long messages are refused', async () => {
    const empty = await s.api('POST', `/requests/${id}/messages`, fidel, { body: '   ' });
    assert.equal(empty.status, 400); assert.equal(empty.json.code, 'empty_message');
    const long = await s.api('POST', `/requests/${id}/messages`, fidel, { body: 'x'.repeat(501) });
    assert.equal(long.status, 400); assert.equal(long.json.code, 'message_too_long');
  });

  test('a new message notifies the others once until they open the thread', async () => {
    await s.api('GET', `/requests/${id}/messages`, ana);
    assert.equal(await unread('ana@hiraman.test', id), 0, 'opening the thread marks it read');
    await s.api('POST', `/requests/${id}/messages`, fidel, { body: 'Thanks!' });
    await s.api('POST', `/requests/${id}/messages`, fidel, { body: 'See you Saturday.' });
    assert.equal(await unread('ana@hiraman.test', id), 1);
    assert.equal(await unread('fidel@hiraman.test', id), 1, 'Fidel was told about the staff message');
  });

  test('the request says how many messages it has', async () => {
    assert.equal((await view(id, ana)).message_count, 5);
  });

  test('the thread closes with the contact window, but stays readable', async () => {
    const r = await s.api('POST', '/requests', dina, { item_id: await itemId('Cooler box'), start_date: day(0), end_date: day(1) });
    await s.api('POST', `/requests/${r.json.id}/handover`, ben);
    await s.api('POST', `/requests/${r.json.id}/messages`, dina, { body: 'Got it, thanks Ben.' });
    await s.api('POST', `/requests/${r.json.id}/return`, ben, { condition: 'good' });
    await q('UPDATE requests SET returned_at = NOW() - INTERVAL 9 DAY WHERE id = ?', [r.json.id]);
    const late = await s.api('POST', `/requests/${r.json.id}/messages`, dina, { body: 'One more thing' });
    assert.equal(late.status, 400); assert.equal(late.json.code, 'thread_closed');
    const thread = (await s.api('GET', `/requests/${r.json.id}/messages`, dina)).json;
    assert.equal(thread.open, false); assert.equal(thread.messages.length, 1);
  });
});
