// Where sorted items go: stock released to approved partners (R2), the repair queue, and recycle batches (R10).
// Items become final here, so this is also where pending points are confirmed (R6). Each rule is tried the way
// someone trying to cheat would try it, over real HTTP.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { pool, q, one } from '../src/db.js';
import { handOver } from '../src/stock.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let staff; let staff2; let partner; let partner2; let twin;
let hubSchool; let hubBrgy; let lingap; const cat = {}; const recycler = {};

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, staff, staff2, partner, partner2] = await Promise.all(['ana', 'ben', 'staff', 'staff2', 'partner', 'partner2'].map((w) => s.login(w)));
  hubSchool = (await one("SELECT id FROM hubs WHERE type = 'school'")).id;
  hubBrgy = (await one("SELECT id FROM hubs WHERE type = 'barangay'")).id;
  lingap = (await one("SELECT id FROM partners WHERE org_name = 'Lingap Shelter'")).id;
  for (const c of await q('SELECT id, slug FROM categories')) cat[c.slug] = c.id;
  for (const r of await q('SELECT id, accredited FROM recyclers')) recycler[r.accredited ? 'certified' : 'junkShop'] = r.id;
  // A staff member at the school hub with the same phone as the Lingap Shelter account (R3 for releases).
  const [r] = await pool.query("INSERT INTO users (name, email, phone, password_hash, role) VALUES ('Rosa Again', 'twinp@circulink.test', '0917-000-0201', ?, 'staff')",
    [await bcrypt.hash('circulink123', 10)]);
  await q('INSERT INTO hub_staff (hub_id, user_id) VALUES (?,?)', [hubSchool, r.insertId]);
  twin = await s.login('twinp');
});
after(async () => { await s.close(); await pool.end(); });

// A resident's drop-off, checked in and sorted: [{ slug, kg, outcome, expiry? }] -> the item ids.
async function sorted(resident, list, { hub = hubSchool, hubStaff = staff } = {}) {
  const d = (await s.api('POST', '/declarations', resident, { hub_id: hub, items: list.map((x) => ({ category_id: cat[x.slug] })) })).json;
  assert.equal((await s.api('POST', '/staff/checkin', hubStaff, { code: d.code })).status, 200);
  for (const [i, x] of list.entries()) {
    const r = await s.api('POST', `/staff/items/${d.items[i].id}/sort`, hubStaff, { weight_kg: x.kg, outcome: x.outcome, expiry_date: x.expiry });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  return d.items.map((i) => i.id);
}
const points = async (itemId) => one('SELECT points, status FROM points_ledger WHERE item_id = ?', [itemId]);

describe('R2: only approved partners see and ask for stock', () => {
  let items;
  before(async () => { items = await sorted(ana, [{ slug: 'clothes', kg: 2, outcome: 'reuse' }, { slug: 'books', kg: 1, outcome: 'reuse' }]); });

  test('an approved partner sees stock, and never who gave it', async () => {
    const r = await s.api('GET', '/stock', partner);
    assert.equal(r.status, 200);
    const mine = r.json.filter((i) => items.includes(i.id));
    assert.equal(mine.length, 2);
    assert.ok(!JSON.stringify(r.json).includes('Ana'), 'no names');
    assert.ok(mine.every((i) => i.resident === undefined && i.declaration_id === undefined));
  });
  test('a partner waiting for approval, a resident and staff cannot', async () => {
    assert.equal((await s.api('GET', '/stock', partner2)).json.code, 'partner_not_approved');
    assert.equal((await s.api('GET', '/stock', ana)).json.code, 'partner_only');
    assert.equal((await s.api('GET', '/stock', staff)).json.code, 'partner_only');
    assert.equal((await s.api('POST', '/releases', ana, { hub_id: hubSchool, item_ids: items })).status, 403);
  });
  test('a partner asks for items from one hub, and only items still in stock', async () => {
    const other = await sorted(ben, [{ slug: 'toys', kg: 1, outcome: 'reuse' }], { hub: hubBrgy, hubStaff: staff2 });
    assert.equal((await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: [...items, ...other] })).json.code, 'mixed_hubs');
    const recyclable = await sorted(ben, [{ slug: 'plastic', kg: 1, outcome: 'recycle' }]);
    assert.equal((await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: recyclable })).json.code, 'not_in_stock');
    assert.equal((await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: [] })).json.code, 'bad_items');
  });
});

describe('releasing to a partner', () => {
  let items; let release;
  before(async () => {
    items = await sorted(ana, [{ slug: 'clothes', kg: 3, outcome: 'reuse' }, { slug: 'kitchen', kg: 2, outcome: 'repair' }]);
    // The repaired item goes back to stock (the repair worked), keeping its repair points.
    const moved = await s.api('POST', `/staff/items/${items[1]}/move`, staff, { to: 'in_stock' });
    assert.equal(moved.json.points, 9);   // floor(2 x 6 x 0.8)
    release = (await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: items, note: 'For the shelter kitchen' })).json;
  });

  test('the request shows items and weight; requested items leave the stock list', async () => {
    assert.equal(release.status, 'requested');
    assert.equal(release.total_kg, 5);
    const stock = (await s.api('GET', '/stock', partner)).json.map((i) => i.id);
    assert.ok(!items.some((id) => stock.includes(id)));
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'release_requested' AND ref_id = ?", [release.id]), 'hub staff are told');
  });
  test('nobody asks twice for the same item', async () => {
    await q("UPDATE partners SET status = 'approved' WHERE org_name = 'Bagong Pag-asa NGO'");
    const r = await s.api('POST', '/releases', partner2, { hub_id: hubSchool, item_ids: [items[0]] });
    assert.equal(r.json.code, 'already_requested');
    await q("UPDATE partners SET status = 'pending' WHERE org_name = 'Bagong Pag-asa NGO'");
  });
  test('points are still pending, and pickup cannot be confirmed before the hand-over', async () => {
    assert.equal((await points(items[0])).status, 'pending');
    assert.equal((await s.api('POST', `/releases/${release.id}/picked-up`, partner)).json.code, 'bad_state');
  });
  test('R4: staff at another hub cannot hand over', async () => {
    assert.equal((await s.api('POST', `/staff/releases/${release.id}/hand-over`, staff2)).json.code, 'not_your_hub');
  });
  test('R3: staff cannot hand items to their own organization, even from a second account', async () => {
    const r = await s.api('POST', `/staff/releases/${release.id}/hand-over`, twin);
    assert.equal(r.status, 403); assert.equal(r.json.code, 'own_release');
  });
  test('R2 again at the counter: a partner suspended after asking gets nothing', async () => {
    await q('UPDATE partners SET status = ? WHERE id = ?', ['suspended', lingap]);
    assert.equal((await s.api('POST', `/staff/releases/${release.id}/hand-over`, staff)).json.code, 'partner_not_approved');
    await q('UPDATE partners SET status = ? WHERE id = ?', ['approved', lingap]);
  });
  test('R6: handing over makes the items final and confirms the points; the resident is told', async () => {
    const r = await s.api('POST', `/staff/releases/${release.id}/hand-over`, staff);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'released');
    assert.deepEqual(r.json.items.map((i) => i.state), ['released', 'released']);
    assert.deepEqual(await points(items[0]), { points: 30, status: 'confirmed' });
    assert.deepEqual(await points(items[1]), { points: 9, status: 'confirmed' });
    const n = await one("SELECT title FROM notifications WHERE type = 'points_confirmed' AND ref_id = (SELECT declaration_id FROM items WHERE id = ?)", [items[0]]);
    assert.equal(n.title, '39 points confirmed');
    assert.equal((await s.api('GET', '/me/impact', ana)).json.points_confirmed >= 39, true);
  });
  test('a handled request cannot be handled again; the partner confirms the pickup once', async () => {
    assert.equal((await s.api('POST', `/staff/releases/${release.id}/hand-over`, staff)).json.code, 'bad_state');
    assert.equal((await s.api('POST', `/releases/${release.id}/picked-up`, partner)).json.status, 'picked_up');
    assert.equal((await s.api('POST', `/releases/${release.id}/picked-up`, partner)).json.code, 'bad_state');
    assert.equal((await s.api('DELETE', `/releases/${release.id}`, partner)).json.code, 'bad_state');
  });
  test('released items cannot be moved anywhere', async () => {
    assert.equal((await s.api('POST', `/staff/items/${items[0]}/move`, staff, { to: 'in_stock' })).json.code, 'bad_state');
  });
});

describe('declining and cancelling', () => {
  test('staff decline with a reason; the items are free again', async () => {
    const items = await sorted(ben, [{ slug: 'shoes_bags', kg: 1, outcome: 'reuse' }]);
    const r = (await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: items })).json;
    assert.equal((await s.api('POST', `/staff/releases/${r.id}/decline`, staff, { reason: '' })).json.code, 'reason_required');
    assert.equal((await s.api('POST', `/staff/releases/${r.id}/decline`, staff, { reason: 'Shoes are damaged' })).json.status, 'cancelled');
    assert.ok((await s.api('GET', '/stock', partner)).json.some((i) => i.id === items[0]));
    assert.equal((await one("SELECT body FROM notifications WHERE type = 'release_declined' AND ref_id = ?", [r.id])).body, 'Shoes are damaged');
  });
  test('a partner takes back its own request, and only its own', async () => {
    const items = await sorted(ben, [{ slug: 'toys', kg: 1, outcome: 'reuse' }]);
    const r = (await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: items })).json;
    assert.equal((await s.api('DELETE', `/releases/${r.id}`, partner2)).status, 404);
    assert.equal((await s.api('DELETE', `/releases/${r.id}`, partner)).json.status, 'cancelled');
    assert.ok((await s.api('GET', '/stock', partner)).json.some((i) => i.id === items[0]));
  });
});

describe('R11: food reaches partners only while fresh', () => {
  test('food expiring soon is not offered, and is refused at the counter if it went stale while waiting', async () => {
    const [fresh] = await sorted(ana, [{ slug: 'food', kg: 1, outcome: 'reuse', expiry: day(5) }]);
    assert.ok((await s.api('GET', '/stock', partner)).json.some((i) => i.id === fresh));
    const r = (await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: [fresh] })).json;
    const staffRow = await one("SELECT * FROM users WHERE email = 'staff@circulink.test'");
    const threeDaysLater = new Date(Date.now() + 3 * 86400000);   // 2 days left: under the 3-day minimum
    await assert.rejects(handOver(r.id, staffRow, threeDaysLater), (e) => e.code === 'food_expiring');
    await s.api('DELETE', `/releases/${r.id}`, partner);
  });
});

describe('moving items after sorting: points only go down', () => {
  test('a recyclable moved to stock keeps its lower recycle points', async () => {
    const [id] = await sorted(ben, [{ slug: 'appliances', kg: 2, outcome: 'recycle' }]);
    assert.equal((await points(id)).points, 10);   // 2 x 10 x 0.5
    const r = await s.api('POST', `/staff/items/${id}/move`, staff, { to: 'in_stock' });
    assert.deepEqual({ state: r.json.state, points: r.json.points }, { state: 'in_stock', points: 10 });
  });
  test('a failed repair sent to recycling drops to recycle points; spoiled stock drops to 0', async () => {
    const [a, b] = await sorted(ben, [{ slug: 'appliances', kg: 2, outcome: 'repair' }, { slug: 'clothes', kg: 2, outcome: 'reuse' }]);
    assert.equal((await s.api('POST', `/staff/items/${a}/move`, staff, { to: 'in_recycle_batch' })).json.points, 10);
    const spoiled = await s.api('POST', `/staff/items/${b}/move`, staff, { to: 'rejected' });
    assert.deepEqual({ outcome: spoiled.json.outcome, points: spoiled.json.points }, { outcome: 'reject', points: 0 });
  });
  test('moves outside the life cycle are refused', async () => {
    const [id] = await sorted(ben, [{ slug: 'books', kg: 1, outcome: 'reuse' }]);
    assert.equal((await s.api('POST', `/staff/items/${id}/move`, staff, { to: 'released' })).json.code, 'bad_state');
    assert.equal((await s.api('POST', `/staff/items/${id}/move`, staff, { to: 'recycled' })).json.code, 'bad_state');
    assert.equal((await s.api('POST', `/staff/items/${id}/move`, staff2, { to: 'rejected' })).json.code, 'not_your_hub');
  });
});

describe('R10: recycle batches', () => {
  let ewaste; let plastic; let batch;
  before(async () => {
    [ewaste, plastic] = await sorted(ana, [{ slug: 'ewaste', kg: 1.2, outcome: 'recycle' }, { slug: 'plastic', kg: 4, outcome: 'recycle' }]);
  });
  test('e-waste can never go to a recycler that is not accredited', async () => {
    const r = await s.api('POST', '/staff/recycle-batches', staff, { hub_id: hubSchool, recycler_id: recycler.junkShop, item_ids: [ewaste, plastic] });
    assert.equal(r.json.code, 'recycler_not_accredited');
    const ok = await s.api('POST', '/staff/recycle-batches', staff, { hub_id: hubSchool, recycler_id: recycler.junkShop, item_ids: [plastic] });
    assert.equal(ok.status, 201); assert.equal(ok.json.total_kg, 4);
  });
  test('only items sorted for recycling, from my hub, in one batch at a time', async () => {
    const [stock] = await sorted(ana, [{ slug: 'books', kg: 1, outcome: 'reuse' }]);
    assert.equal((await s.api('POST', '/staff/recycle-batches', staff, { hub_id: hubSchool, recycler_id: recycler.certified, item_ids: [stock] })).json.code, 'bad_state');
    assert.equal((await s.api('POST', '/staff/recycle-batches', staff, { hub_id: hubSchool, recycler_id: recycler.certified, item_ids: [plastic] })).json.code, 'item_busy');
    assert.equal((await s.api('POST', '/staff/recycle-batches', staff2, { hub_id: hubSchool, recycler_id: recycler.certified, item_ids: [ewaste] })).json.code, 'not_your_hub');
    assert.equal((await s.api('POST', `/staff/items/${plastic}/move`, staff, { to: 'rejected' })).json.code, 'item_busy', 'not while in a batch');
    batch = (await s.api('POST', '/staff/recycle-batches', staff, { hub_id: hubSchool, recycler_id: recycler.certified, item_ids: [ewaste] })).json;
  });
  test('a recycler that lost its accreditation cannot take e-waste already batched', async () => {
    await q('UPDATE recyclers SET accredited = 0 WHERE id = ?', [recycler.certified]);
    assert.equal((await s.api('POST', `/staff/recycle-batches/${batch.id}/send`, staff)).json.code, 'recycler_not_accredited');
    await q('UPDATE recyclers SET accredited = 1 WHERE id = ?', [recycler.certified]);
  });
  test('sending a batch makes its items recycled and confirms their points', async () => {
    const r = await s.api('POST', `/staff/recycle-batches/${batch.id}/send`, staff);
    assert.equal(r.json.status, 'sent');
    assert.deepEqual(await points(ewaste), { points: 9, status: 'confirmed' }, 'final, and its drop-off is fully sorted');   // floor(1.2 x 15 x 0.5)
    assert.deepEqual(await points(plastic), { points: 10, status: 'pending' }, 'still waiting at the hub');
    const plasticBatch = (await s.api('GET', '/staff/recycle-batches', staff)).json.find((b) => b.status === 'open' && b.total_kg === 4);
    await s.api('POST', `/staff/recycle-batches/${plasticBatch.id}/send`, staff);
    assert.deepEqual(await points(plastic), { points: 10, status: 'confirmed' });
    assert.equal((await s.api('POST', `/staff/recycle-batches/${batch.id}/send`, staff)).json.code, 'bad_state');
  });
});

describe('staff views and the audit log', () => {
  test('staff see only their hubs', async () => {
    const mine = (await s.api('GET', '/staff/stock', staff)).json;
    assert.ok(mine.length > 0 && mine.every((i) => i.hub.name === 'Campus Green Hub'));
    assert.ok((await s.api('GET', '/staff/releases?status=picked_up', staff)).json.length >= 1);
    assert.deepEqual((await s.api('GET', '/staff/releases?status=picked_up', staff2)).json, []);
    assert.equal((await s.api('GET', '/staff/recyclers', staff)).json.length, 2);
  });
  test('every step leaves an audit row', async () => {
    const actions = (await q('SELECT DISTINCT action FROM audit_log')).map((r) => r.action);
    for (const a of ['release_requested', 'release_handed_over', 'release_picked_up', 'release_declined', 'release_cancelled', 'item_moved', 'batch_created', 'batch_sent']) {
      assert.ok(actions.includes(a), a);
    }
  });
});
