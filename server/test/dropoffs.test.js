// The drop-off flow end to end (spec section 3): declare, check in, weigh and sort, points, flags.
// Every anti-abuse rule that guards it is tried the way a cheater would try it, over real HTTP.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { pool, q, one } from '../src/db.js';
import { expireDeclarations } from '../src/dropoffs.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let carlo; let staff; let staff2; let partner; let admin; let twin;
let hubSchool; let hubBrgy; const cat = {};

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, staff, staff2, partner, admin] = await Promise.all(['ana', 'ben', 'carlo', 'staff', 'staff2', 'partner', 'admin'].map((w) => s.login(w)));
  hubSchool = (await one("SELECT id FROM hubs WHERE type = 'school'")).id;
  hubBrgy = (await one("SELECT id FROM hubs WHERE type = 'barangay'")).id;
  for (const c of await q('SELECT id, slug FROM categories')) cat[c.slug] = c.id;
  // A staff member at the school hub whose phone number is Carlo's, written differently: a second account (R3).
  const [r] = await pool.query("INSERT INTO users (name, email, phone, password_hash, role) VALUES ('Carlo Again', 'twin@circulink.test', '+639170000003', ?, 'staff')",
    [await bcrypt.hash('circulink123', 10)]);
  await q('INSERT INTO hub_staff (hub_id, user_id) VALUES (?,?)', [hubSchool, r.insertId]);
  twin = await s.login('twin');
});
after(async () => { await s.close(); await pool.end(); });

const declare = (token, items, hub = hubSchool) => s.api('POST', '/declarations', token, { hub_id: hub, items: items.map((slug) => ({ category_id: cat[slug] })) });
const checkIn = (token, code) => s.api('POST', '/staff/checkin', token, { code });
const sort = (token, itemId, body) => s.api('POST', `/staff/items/${itemId}/sort`, token, body);

describe('declaring items', () => {
  test('a resident declares items at a hub and gets a 6-character code', async () => {
    const r = await declare(ana, ['clothes', 'books']);
    assert.equal(r.status, 201);
    assert.match(r.json.code, /^[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.equal(r.json.status, 'open');
    assert.deepEqual(r.json.items.map((i) => i.state), ['declared', 'declared']);
    assert.equal((await s.api('GET', '/declarations', ana)).json[0].code, r.json.code);
  });
  test('wrong input is refused', async () => {
    assert.equal((await declare(ana, [])).json.code, 'bad_items');
    assert.equal((await declare(ana, ['clothes'], 9999)).json.code, 'bad_hub');
    assert.equal((await s.api('POST', '/declarations', ana, { hub_id: hubSchool, items: [{ category_id: 9999 }] })).json.code, 'bad_category');
  });
  test('R9: at most 3 open codes', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await declare(ben, ['plastic'])).status, 201);
    const fourth = await declare(ben, ['plastic']);
    assert.equal(fourth.status, 400); assert.equal(fourth.json.code, 'too_many_open');
    const mine = (await s.api('GET', '/declarations', ben)).json;
    assert.equal((await s.api('DELETE', `/declarations/${mine[0].id}`, ben)).json.status, 'cancelled');
    assert.equal((await declare(ben, ['plastic'])).status, 201, 'cancelling one frees a place');
  });
  test('nobody sees or cancels someone else\'s drop-off', async () => {
    const theirs = (await s.api('GET', '/declarations', ana)).json[0].id;
    assert.equal((await s.api('GET', `/declarations/${theirs}`, ben)).status, 404);
    assert.equal((await s.api('DELETE', `/declarations/${theirs}`, ben)).status, 404);
  });
  test('open codes and past drop-offs load separately, the past a page at a time', async () => {
    const open = (await s.api('GET', '/declarations?status=open', ben)).json;
    assert.ok(open.length >= 1 && open.every((d) => d.status === 'open'));
    const page1 = (await s.api('GET', '/declarations?status=past&limit=1&offset=0', ben)).json;
    assert.equal(page1.length, 1);
    assert.notEqual(page1[0].status, 'open');
    const all = (await s.api('GET', '/declarations?status=past&limit=50', ben)).json;
    const page2 = (await s.api('GET', '/declarations?status=past&limit=1&offset=1', ben)).json;
    assert.deepEqual(page2.map((d) => d.id), all.slice(1, 2).map((d) => d.id));
  });
  test('only residents declare; staff, partners and admins cannot', async () => {
    for (const t of [staff, partner, admin]) assert.equal((await declare(t, ['clothes'])).status, 403);
  });
});

describe('checking in at the hub', () => {
  test('R1: residents and partners cannot use staff routes', async () => {
    const code = (await s.api('GET', '/declarations', ana)).json[0].code;
    for (const t of [ana, partner]) {
      const r = await checkIn(t, code);
      assert.equal(r.status, 403); assert.equal(r.json.code, 'staff_only');
    }
  });
  test('R4: staff at another hub cannot check the code in', async () => {
    const code = (await s.api('GET', '/declarations', ana)).json[0].code;
    const r = await checkIn(staff2, code);
    assert.equal(r.status, 403); assert.equal(r.json.code, 'not_your_hub');
  });
  test('staff at the right hub check it in (typed with spaces and lower case), and it works only once', async () => {
    const code = (await s.api('GET', '/declarations', ana)).json[0].code;
    const r = await checkIn(staff, ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'received');
    assert.equal(r.json.resident.name, 'Ana Dela Cruz');
    assert.equal(r.json.code, undefined, 'staff never get the code back');
    assert.ok(r.json.items.every((i) => i.state === 'received'));
    const again = await checkIn(staff, code);
    assert.equal(again.json.code, 'code_used');
    const n = await one("SELECT COUNT(*) AS n FROM notifications WHERE type = 'dropoff_received' AND ref_id = ?", [r.json.id]);
    assert.equal(n.n, 1, 'the resident is told');
  });
  test('a code that does not exist, or is badly typed', async () => {
    assert.equal((await checkIn(staff, 'ABC')).json.code, 'bad_code');
    const r = await checkIn(staff, 'ZZZZZZ');
    assert.equal(r.status, 404); assert.equal(r.json.code, 'bad_code');
  });
  test('R3: staff cannot check in their own drop-off, even from a second account with the same phone', async () => {
    const d = (await declare(carlo, ['clothes'])).json;
    const r = await checkIn(twin, d.code);
    assert.equal(r.status, 403); assert.equal(r.json.code, 'own_drop_off');
    assert.equal((await checkIn(staff, d.code)).status, 200, 'another staff member can');
  });
});

describe('weighing and sorting', () => {
  let decl;
  before(async () => {
    decl = (await s.api('GET', '/declarations', ana)).json[0];   // received above: clothes + books
  });

  test('R5: points = kg x rate x outcome; pending until the item reaches its new home (R6)', async () => {
    const clothes = decl.items[0].id;
    const r = await sort(staff, clothes, { weight_kg: 2, outcome: 'reuse' });
    assert.equal(r.status, 200);
    assert.deepEqual({ points: r.json.points, status: r.json.points_status, state: r.json.state }, { points: 20, status: 'pending', state: 'in_stock' });
  });
  test('a rejected item earns 0, settled once the whole drop-off is sorted', async () => {
    const r = await sort(staff, decl.items[1].id, { weight_kg: 3, outcome: 'reject' });
    assert.deepEqual({ points: r.json.points, status: r.json.points_status }, { points: 0, status: 'confirmed' });
  });
  test('R6 + R7: nothing is confirmed while other items of the drop-off wait, so a late flag still holds every point', async () => {
    const d = (await declare(carlo, ['books', 'books'], hubSchool)).json;
    await checkIn(staff, d.code);
    const first = await sort(staff, d.items[0].id, { weight_kg: 1, outcome: 'reject' });
    assert.equal(first.json.points_status, 'pending', 'its sibling is not sorted yet');
    const second = await sort(staff, d.items[1].id, { weight_kg: 1, outcome: 'reject' });
    assert.equal(second.json.points_status, 'confirmed');
    assert.equal((await one('SELECT status FROM points_ledger WHERE item_id = ?', [d.items[0].id])).status, 'confirmed');
  });
  test('an item is sorted once: no second points', async () => {
    const r = await sort(staff, decl.items[0].id, { weight_kg: 50, outcome: 'reuse' });
    assert.equal(r.json.code, 'bad_state');
    assert.equal((await one('SELECT COUNT(*) AS n FROM points_ledger WHERE item_id = ?', [decl.items[0].id])).n, 1);
  });
  test('the resident sees their impact; rejected kilograms do not count', async () => {
    const r = (await s.api('GET', '/me/impact', ana)).json;
    assert.deepEqual({ kg: r.kg_kept, pending: r.points_pending, confirmed: r.points_confirmed, badge: r.badge }, { kg: 2, pending: 20, confirmed: 0, badge: 'seed' });
    assert.equal(r.co2e_avoided_kg, 30, 'clothes: 2 kg x 15 kg CO2e (estimate)');
    const n = await one("SELECT body FROM notifications WHERE type = 'dropoff_sorted' AND ref_id = ?", [decl.id]);
    assert.match(n.body, /^2 kg kept in use, 20 points/);
  });
  test('weights and outcomes are checked', async () => {
    const d = (await declare(ana, ['plastic'])).json;
    await checkIn(staff, d.code);
    const item = d.items[0].id;
    assert.equal((await sort(staff, item, { weight_kg: 0, outcome: 'recycle' })).json.code, 'bad_weight');
    assert.equal((await sort(staff, item, { weight_kg: 600, outcome: 'recycle' })).json.code, 'bad_weight');
    assert.equal((await sort(staff, item, { weight_kg: 1, outcome: 'sell' })).json.code, 'bad_outcome');
    assert.equal((await sort(staff2, item, { weight_kg: 1, outcome: 'recycle' })).json.code, 'not_your_hub');
    const ok = await sort(staff, item, { weight_kg: 1.5, outcome: 'recycle' });
    assert.deepEqual({ points: ok.json.points, state: ok.json.state }, { points: 3, state: 'in_recycle_batch' });   // floor(1.5 x 5 x 0.5)
  });
  test('an item cannot be sorted before its code is checked in', async () => {
    const d = (await declare(ana, ['toys'])).json;
    assert.equal((await sort(staff, d.items[0].id, { weight_kg: 1, outcome: 'reuse' })).json.code, 'not_received');
    await s.api('DELETE', `/declarations/${d.id}`, ana);
  });
  test('staff add an item the resident brought but did not list, then sort it', async () => {
    const d = (await s.api('GET', '/declarations', ana)).json.find((x) => x.status === 'received' && x.items.some((i) => i.state === 'in_recycle_batch'));
    const r = await s.api('POST', `/staff/declarations/${d.id}/items`, staff, { category_id: cat.cans, description: 'Bag of cans' });
    assert.equal(r.status, 201);
    const added = r.json.items.find((i) => i.description === 'Bag of cans');
    assert.equal(added.state, 'received');
    assert.equal((await sort(staff, added.id, { weight_kg: 2, outcome: 'recycle' })).json.points, 5);
  });
  test('the staff queue lists checked-in drop-offs at my hub only', async () => {
    const mine = (await s.api('GET', '/staff/queue', staff)).json;
    const other = (await s.api('GET', '/staff/queue', staff2)).json;
    assert.ok(mine.every((r) => r.hub_name === 'Campus Green Hub'));
    assert.ok(other.every((r) => r.hub_name !== 'Campus Green Hub'));
    assert.deepEqual((await s.api('GET', '/staff/hubs', staff)).json.map((h) => h.name), ['Campus Green Hub']);
  });
});

describe('R11: food', () => {
  let item;
  before(async () => {
    const d = (await declare(carlo, ['food'])).json;
    await checkIn(staff, d.code);
    item = d.items[0].id;
  });
  test('sealed food is never recycled or repaired', async () => {
    assert.equal((await sort(staff, item, { weight_kg: 1, outcome: 'recycle' })).json.code, 'food_outcome');
    assert.equal((await sort(staff, item, { weight_kg: 1, outcome: 'repair' })).json.code, 'food_outcome');
  });
  test('food to give out needs 3 days before it expires', async () => {
    assert.equal((await sort(staff, item, { weight_kg: 1, outcome: 'reuse', expiry_date: day(1) })).json.code, 'food_expiring');
    assert.equal((await sort(staff, item, { weight_kg: 1, outcome: 'reuse' })).json.code, 'food_expiring', 'no date, no reuse');
    const ok = await sort(staff, item, { weight_kg: 1, outcome: 'reuse', expiry_date: day(10) });
    assert.equal(ok.status, 200); assert.equal(ok.json.points, 8);
  });
});

describe('R7: unusual weights go to an admin', () => {
  let flagged;
  test('a drop-off over 50 kg is flagged, and its points stay pending even when settled', async () => {
    const d = (await declare(carlo, ['furniture', 'furniture'])).json;
    await checkIn(staff, d.code);
    flagged = d;
    const first = await sort(staff, d.items[0].id, { weight_kg: 30, outcome: 'reject' });
    assert.deepEqual(first.json.flags, []);
    const second = await sort(staff, d.items[1].id, { weight_kg: 25, outcome: 'reject' });
    assert.deepEqual(second.json.flags, ['heavy_drop_off']);
    const rows = await q('SELECT status FROM points_ledger p JOIN items i ON i.id = p.item_id WHERE i.declaration_id = ?', [d.id]);
    assert.deepEqual(rows.map((r) => r.status), ['pending', 'pending'], 'rejected items are final, but the flag holds them');
  });
  test('only admins see and decide flags, and nobody decides on their own drop-off', async () => {
    assert.equal((await s.api('GET', '/admin/flags', staff)).status, 403);
    const list = (await s.api('GET', '/admin/flags', admin)).json;
    const f = list.find((x) => x.entity_id === flagged.id);
    assert.equal(f.kind, 'heavy_drop_off');
    assert.equal(f.resident_name, 'Carlo Mendoza');
    assert.equal((await s.api('POST', `/admin/flags/${f.id}/maybe`, admin)).json.code, 'bad_decision');
  });
  test('cleared: the points go on and are confirmed once final', async () => {
    const f = (await s.api('GET', '/admin/flags', admin)).json.find((x) => x.entity_id === flagged.id);
    assert.equal((await s.api('POST', `/admin/flags/${f.id}/clear`, admin)).status, 200);
    const rows = await q('SELECT status FROM points_ledger p JOIN items i ON i.id = p.item_id WHERE i.declaration_id = ?', [flagged.id]);
    assert.deepEqual(rows.map((r) => r.status), ['confirmed', 'confirmed']);
    assert.equal((await s.api('POST', `/admin/flags/${f.id}/uphold`, admin)).json.code, 'bad_state', 'decided once');
  });
  test('upheld: the points of that drop-off are cancelled, and the resident is told', async () => {
    const d = (await declare(carlo, ['clothes'])).json;
    await checkIn(staff, d.code);
    const r = await sort(staff, d.items[0].id, { weight_kg: 60, outcome: 'reuse' });
    assert.ok(r.json.flags.includes('heavy_drop_off'));
    assert.ok(r.json.flags.includes('heavy_resident_month'), 'Carlo is over 100 kg in 30 days now');
    for (const f of (await s.api('GET', '/admin/flags', admin)).json.filter((x) => x.entity_id === d.id)) {
      await s.api('POST', `/admin/flags/${f.id}/uphold`, admin);
    }
    assert.equal((await one('SELECT status FROM points_ledger WHERE item_id = ?', [d.items[0].id])).status, 'cancelled');
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'points_cancelled' AND ref_id = ?", [d.id]));
  });
});

describe('R12: every step is in the audit log', () => {
  test('declaring, checking in and sorting each leave a row', async () => {
    const actions = (await q('SELECT DISTINCT action FROM audit_log')).map((r) => r.action);
    for (const a of ['declaration_created', 'declaration_cancelled', 'declaration_received', 'item_added', 'item_sorted', 'flag_cleared', 'flag_upheld']) {
      assert.ok(actions.includes(a), a);
    }
  });
});

describe('R9: expired codes', () => {
  test('codes not used within 7 days expire and stop working', async () => {
    const d = (await declare(ana, ['books'], hubBrgy)).json;
    const r = await expireDeclarations(new Date(Date.now() + 8 * 86400000));
    assert.ok(r.expired >= 1);
    assert.equal((await checkIn(staff2, d.code)).json.code, 'code_expired');
  });
});

describe('R13: guessing codes', () => {
  test('after 30 wrong codes a staff member must wait', async () => {
    const codes = [];   // the admin has not checked any code in yet, so all 30 tries are left
    for (let i = 0; i < 31; i++) codes.push((await checkIn(admin, 'ZZZZZZ')).status);
    assert.deepEqual(codes.slice(0, 30), Array(30).fill(404));
    assert.equal(codes[30], 429);
  });
});
