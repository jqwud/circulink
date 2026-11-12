// What admins manage, and the limits on admins themselves: no action on their own account, every change in
// the audit log, and point rates kept within bounds.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let admin; let staff; let ana; let partner; let adminId; let hubSchool; let hubBrgy;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [admin, staff, ana, partner] = await Promise.all(['admin', 'staff', 'ana', 'partner'].map((w) => s.login(w)));
  adminId = (await one("SELECT id FROM users WHERE email = 'admin@circulink.test'")).id;
  hubSchool = (await one("SELECT id FROM hubs WHERE type = 'school'")).id;
  hubBrgy = (await one("SELECT id FROM hubs WHERE type = 'barangay'")).id;
});
after(async () => { await s.close(); await pool.end(); });

const userId = async (email) => (await one('SELECT id FROM users WHERE email = ?', [email])).id;
const login = (email, password) => s.api('POST', '/auth/login', null, { email, password });

describe('only admins reach the admin pages', () => {
  test('staff, partners and residents are refused', async () => {
    for (const t of [staff, partner, ana]) {
      for (const path of ['/admin/users', '/admin/hubs', '/admin/categories', '/admin/audit']) {
        assert.equal((await s.api('GET', path, t)).status, 403, path);
      }
    }
  });
});

describe('accounts', () => {
  test('an admin creates a staff account with a temporary password that must be changed', async () => {
    const r = await s.api('POST', '/admin/users', admin, { role: 'staff', name: 'Lito Bautista', email: 'lito@example.com', phone: '0918 111 2222' });
    assert.equal(r.status, 201);
    assert.match(r.json.temporary_password, /^[a-z2-9]{10}$/);
    const first = await login('lito@example.com', r.json.temporary_password);
    assert.equal(first.json.user.must_change_password, true);
  });
  test('residents are never made here, and duplicates are refused', async () => {
    assert.equal((await s.api('POST', '/admin/users', admin, { role: 'resident', name: 'X Y', email: 'x@example.com' })).json.code, 'bad_role');
    assert.equal((await s.api('POST', '/admin/users', admin, { role: 'staff', name: 'Copy', email: 'lito@example.com' })).json.code, 'account_exists');
    assert.equal((await s.api('POST', '/admin/users', admin, { role: 'staff', name: 'Copy', email: 'copy@example.com', phone: '0918-111-2222' })).json.code, 'account_exists',
      'the same phone, written differently');
  });
  test('a partner account comes with its organization', async () => {
    const r = await s.api('POST', '/admin/users', admin, { role: 'partner', name: 'Sr. Mila', email: 'mila@example.com', org_name: 'Bahay Kalinga', kind: 'shelter' });
    assert.equal(r.status, 201);
    assert.equal((await one('SELECT status FROM partners WHERE user_id = ?', [r.json.id])).status, 'approved');
    assert.equal((await s.api('POST', '/admin/users', admin, { role: 'partner', name: 'No Org', email: 'noorg@example.com' })).json.code, 'bad_org');
  });
  test('staff work only at the hubs an admin assigns', async () => {
    const lito = await userId('lito@example.com');
    assert.equal((await s.api('PUT', `/admin/users/${lito}/hubs`, admin, { hub_ids: [hubBrgy] })).status, 200);
    assert.deepEqual((await s.api('GET', '/admin/users?role=staff&q=Lito', admin)).json[0].hub_ids, [hubBrgy]);
    assert.equal((await s.api('PUT', `/admin/users/${lito}/hubs`, admin, { hub_ids: [9999] })).json.code, 'bad_hub');
    assert.equal((await s.api('PUT', `/admin/users/${await userId('ana@circulink.test')}/hubs`, admin, { hub_ids: [hubSchool] })).json.code, 'not_staff');
  });
  test('suspending ends the sessions at once; reinstating lets the person back in', async () => {
    const ben = await s.login('ben');
    const id = await userId('ben@circulink.test');
    await s.api('POST', `/admin/users/${id}/suspend`, admin);
    assert.equal((await s.api('GET', '/me', ben)).status, 401, 'the old token no longer works');
    assert.equal((await login('ben@circulink.test', 'circulink123')).json.code, 'suspended');
    await s.api('POST', `/admin/users/${id}/reinstate`, admin);
    assert.equal((await login('ben@circulink.test', 'circulink123')).status, 200);
  });
  test('a password reset gives a temporary password and ends old sessions', async () => {
    const carlo = await s.login('carlo');
    const r = await s.api('POST', `/admin/users/${await userId('carlo@circulink.test')}/reset-password`, admin);
    assert.equal((await s.api('GET', '/me', carlo)).status, 401);
    assert.equal((await login('carlo@circulink.test', r.json.temporary_password)).json.user.must_change_password, true);
  });
  test('an admin can never suspend, reset or delete their own account', async () => {
    for (const path of ['suspend', 'reset-password', 'delete']) {
      const r = await s.api('POST', `/admin/users/${adminId}/${path}`, admin);
      assert.equal(r.status, 403, path); assert.equal(r.json.code, 'not_on_self');
    }
  });
});

describe('deleting an account on request', () => {
  test('only residents who asked; name and contact go, weights and points stay', async () => {
    const id = await userId('ana@circulink.test');
    assert.equal((await s.api('POST', `/admin/users/${id}/delete`, admin)).json.code, 'not_requested');
    assert.equal((await s.api('POST', `/admin/users/${await userId('staff@circulink.test')}/delete`, admin)).json.code, 'not_resident');
    const d = (await s.api('POST', '/declarations', ana, { hub_id: hubSchool, items: [{ category_id: 1 }] })).json;
    await s.api('POST', '/me/delete-request', ana, { reason: 'Moving away' });
    assert.equal((await s.api('POST', `/admin/users/${id}/delete`, admin)).status, 200);
    const u = await one('SELECT name, email, phone, student_id, suspended FROM users WHERE id = ?', [id]);
    assert.deepEqual(u, { name: 'Deleted account', email: `deleted-${id}@deleted.invalid`, phone: null, student_id: null, suspended: 1 });
    assert.equal((await one('SELECT status FROM declarations WHERE id = ?', [d.id])).status, 'cancelled', 'open codes stop working');
    assert.equal((await login('ana@circulink.test', 'circulink123')).status, 401);
  });
});

describe('R2: partner approval', () => {
  test('a waiting organization is approved and told; then it can see stock', async () => {
    const p2 = await s.login('partner2');
    assert.equal((await s.api('GET', '/stock', p2)).json.code, 'partner_not_approved');
    const list = (await s.api('GET', '/admin/partners', admin)).json;
    assert.equal(list[0].status, 'pending', 'waiting ones come first');
    assert.equal((await s.api('POST', `/admin/partners/${list[0].id}/approve`, admin)).status, 200);
    assert.equal((await s.api('GET', '/stock', p2)).status, 200);
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'partner_approved' AND ref_id = ?", [list[0].id]));
  });
  test('suspending an organization drops its open requests', async () => {
    const lingap = await one("SELECT id FROM partners WHERE org_name = 'Lingap Shelter'");
    const [rel] = await pool.query("INSERT INTO releases (partner_id, hub_id) VALUES (?, ?)", [lingap.id, hubSchool]);
    assert.equal((await s.api('POST', `/admin/partners/${lingap.id}/suspend`, admin)).status, 200);
    assert.equal((await one('SELECT status FROM releases WHERE id = ?', [rel.insertId])).status, 'cancelled');
    assert.equal((await s.api('GET', '/stock', partner)).json.code, 'partner_not_approved');
    assert.equal((await s.api('POST', `/admin/partners/${lingap.id}/maybe`, admin)).json.code, 'bad_decision');
  });
});

describe('hubs, recyclers and categories', () => {
  test('a new hub appears for everyone; pausing it cancels its open codes', async () => {
    const r = await s.api('POST', '/admin/hubs', admin, { name: 'Riverside High School Hub', type: 'school', address: 'Riverside High, Gate 2', hours: 'Sat 8:00 to 12:00' });
    assert.equal(r.status, 201);
    assert.ok((await s.api('GET', '/hubs')).json.some((h) => h.id === r.json.id));
    const ben = await s.login('ben');
    const d = (await s.api('POST', '/declarations', ben, { hub_id: r.json.id, items: [{ category_id: 1 }] })).json;
    assert.equal((await s.api('PATCH', `/admin/hubs/${r.json.id}`, admin, { status: 'paused' })).status, 200);
    assert.ok(!(await s.api('GET', '/hubs')).json.some((h) => h.id === r.json.id));
    assert.equal((await one('SELECT status FROM declarations WHERE id = ?', [d.id])).status, 'cancelled');
    assert.equal((await s.api('POST', '/admin/hubs', admin, { name: 'X', type: 'mall', address: 'Somewhere' })).json.code, 'bad_name');
    assert.equal((await s.api('POST', '/admin/hubs', admin, { name: 'Mall Hub', type: 'mall', address: 'Somewhere' })).json.code, 'bad_type');
  });
  test('recyclers are added and their accreditation changed', async () => {
    const r = await s.api('POST', '/admin/recyclers', admin, { name: 'Metro E-Cycle', materials: 'E-waste', accredited: true });
    assert.equal(r.status, 201);
    await s.api('PATCH', `/admin/recyclers/${r.json.id}`, admin, { accredited: false });
    assert.equal((await s.api('GET', '/admin/recyclers', admin)).json.find((x) => x.id === r.json.id).accredited, false);
  });
  test('point rates stay within 0 to 50 per kg, and every change keeps the old value', async () => {
    const clothes = (await one("SELECT id FROM categories WHERE slug = 'clothes'")).id;
    assert.equal((await s.api('PATCH', `/admin/categories/${clothes}`, admin, { rate_per_kg: 5000 })).json.code, 'bad_rate');
    assert.equal((await s.api('PATCH', `/admin/categories/${clothes}`, admin, { rate_per_kg: -1 })).json.code, 'bad_rate');
    assert.equal((await s.api('PATCH', `/admin/categories/${clothes}`, admin, { rate_per_kg: 12 })).status, 200);
    const row = (await s.api('GET', `/admin/audit?entity=category&entity_id=${clothes}`, admin)).json[0];
    assert.equal(row.action, 'category_updated');
    assert.deepEqual(row.details, { changes: { rate_per_kg: 12 }, before: { rate_per_kg: '10.00' } });
    assert.equal(row.actor_name, 'CircuLink Admin');
  });
  test('a new category, and a duplicate code is refused', async () => {
    const body = { slug: 'textbooks', name_en: 'Textbooks', name_fil: 'Aklat sa paaralan', rate_per_kg: 5, co2_per_kg: 1.2 };
    assert.equal((await s.api('POST', '/admin/categories', admin, body)).status, 201);
    assert.equal((await s.api('POST', '/admin/categories', admin, body)).json.code, 'duplicate');
    assert.ok((await s.api('GET', '/meta', staff)).json.categories.some((c) => c.slug === 'textbooks'));
  });
});

describe('R12: admins are audited too', () => {
  test('every admin action is in the log, newest first, and the log has no way to edit it', async () => {
    const actions = (await s.api('GET', '/admin/audit?limit=500', admin)).json.map((r) => r.action);
    for (const a of ['account_created', 'staff_hubs_set', 'account_suspended', 'account_reinstated', 'password_reset', 'account_deleted',
      'partner_approved', 'partner_suspended', 'hub_created', 'hub_updated', 'recycler_created', 'recycler_updated', 'category_created', 'category_updated']) {
      assert.ok(actions.includes(a), a);
    }
    const ids = (await s.api('GET', '/admin/audit?limit=5', admin)).json.map((r) => r.id);
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
    for (const method of ['PATCH', 'DELETE', 'PUT']) assert.equal((await s.api(method, '/admin/audit', admin)).status, 404, method);
  });
});
