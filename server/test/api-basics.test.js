// API basics: health, unknown routes, photo fields, and a safe CSV export.
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { pool, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day, PNG } from './helpers/api.js';

let s; let ana; let ben; let staff;
before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, staff] = await Promise.all(['ana', 'ben', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('health check', () => {
  test('reports the database as ok', async () => {
    const r = await s.api('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true); assert.equal(r.json.db, 'ok');
  });
  test('says which version of the API is running (from package.json)', async () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const r = await s.api('GET', '/health');
    assert.equal(r.json.version, pkg.version);
  });
  test('says 503 when the database cannot be reached', async () => {
    const broken = startServer({ checkDb: async () => { throw new Error('connection refused'); } });
    const r = await broken.api('GET', '/health');
    await broken.close();
    assert.equal(r.status, 503);
    assert.equal(r.json.ok, false); assert.equal(r.json.db, 'down');
  });
});

describe('unknown addresses', () => {
  test('an unknown API address is 404 whether or not you are logged in', async () => {
    assert.equal((await s.api('GET', '/does-not-exist')).status, 404);
    assert.equal((await s.api('GET', '/does-not-exist', ana)).status, 404);
  });
  test('real routes still need a login', async () => {
    const r = await s.api('GET', '/wanted');
    assert.equal(r.status, 401); assert.equal(r.json.code, 'auth_required');
    assert.equal((await s.api('GET', '/kits')).status, 401);
    assert.equal((await s.api('GET', '/me/badges')).status, 401);
  });
});

describe('photo fields accept only our own uploads', () => {
  let ours;
  before(async () => { ours = (await s.upload('/uploads', ana, PNG, 'image/png', 'p.png')).json.url; });

  test('a listing photo from another website is refused', async () => {
    const r = await s.api('POST', '/items', ana, { title: 'Hammer', category_id: 2, pickup_point_id: 1, photo_url: 'https://example.com/tracker.png' });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'bad_photo');
  });
  test('a made-up upload path is refused', async () => {
    const r = await s.api('POST', '/items', ana, { title: 'Hammer', category_id: 2, pickup_point_id: 1, photo_url: '/uploads/public/does-not-exist.jpg' });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'bad_photo');
  });
  test('our own upload, or no photo at all, is accepted', async () => {
    const withPhoto = await s.api('POST', '/items', ana, { title: 'Hammer', category_id: 2, pickup_point_id: 1, photo_url: ours });
    assert.equal(withPhoto.status, 201); assert.equal(withPhoto.json.photo_url, ours);
    const cleared = await s.api('PATCH', `/items/${withPhoto.json.id}`, ana, { photo_url: null });
    assert.equal(cleared.status, 200); assert.equal(cleared.json.photo_url, null);
  });
  test('handover and return photos follow the same rule', async () => {
    const speaker = (await one("SELECT id FROM items WHERE title = 'Bluetooth speaker'")).id;
    const pending = (await s.api('GET', '/requests?as=owner', ana)).json.find((r) => r.item.id === speaker && r.status === 'pending');
    assert.equal((await s.api('POST', `/requests/${pending.id}/approve`, ana)).status, 200);
    const outside = await s.api('POST', `/requests/${pending.id}/handover`, ana, { photo: 'https://example.com/x.jpg' });
    assert.equal(outside.status, 400); assert.equal(outside.json.code, 'bad_photo');
    assert.equal((await s.api('POST', `/requests/${pending.id}/handover`, ana, { photo: ours })).status, 200);
    const badReturn = await s.api('POST', `/requests/${pending.id}/return`, ana, { condition: 'good', photo: 'javascript:alert(1)' });
    assert.equal(badReturn.status, 400); assert.equal(badReturn.json.code, 'bad_photo');
  });
});

describe('CSV export', () => {
  test('cells that start like a spreadsheet formula are written as plain text', async () => {
    const item = await s.api('POST', '/items', ana, { title: '=SUM(1,1) chairs', category_id: 1, pickup_point_id: 1, tier: 'low' });
    assert.equal(item.status, 201);
    assert.equal((await s.api('POST', '/requests', ben, { item_id: item.json.id, start_date: day(2), end_date: day(2) })).status, 201);
    const csv = await s.api('GET', '/admin/export/transactions.csv', staff);
    assert.equal(csv.status, 200);
    assert.ok(csv.text.includes(`"'=SUM(1,1) chairs"`), 'formula cell is prefixed with an apostrophe');
    assert.ok(!/(^|,)"?=SUM/m.test(csv.text), 'no cell starts with =');
  });
});

describe('suspending a resident', () => {
  test('locks them out until reinstated, and the audit log names each step in plain words', async () => {
    const elena = await s.login('elena');
    const { id } = await one("SELECT id FROM users WHERE email = 'elena@hiraman.test'");
    assert.equal((await s.api('POST', `/admin/users/${id}/suspend`, staff)).status, 200);
    const locked = await s.api('GET', '/wanted', elena);
    assert.equal(locked.status, 403); assert.equal(locked.json.code, 'suspended');
    assert.equal((await s.api('POST', `/admin/users/${id}/reinstate`, staff)).status, 200);
    assert.equal((await s.api('GET', '/wanted', elena)).status, 200);
    const [rows] = await pool.query('SELECT action FROM audit_log WHERE target LIKE ? ORDER BY id', [`user #${id} %`]);
    assert.deepEqual(rows.map((r) => r.action), ['user_suspended', 'user_reinstated']);
  });
});
