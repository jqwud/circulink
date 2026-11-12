// API basics: health, unknown routes, logins and roles, reference lists, and one account per person (R8).
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let ana; let staff;
before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, staff] = await Promise.all(['ana', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

const signup = (extra = {}) => s.api('POST', '/auth/register', null, {
  name: 'New Person', email: `new${Math.random().toString(36).slice(2, 8)}@example.com`, password: 'longenough1',
  phone: `0918${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`, accept_privacy: true, ...extra,
});

describe('health check', () => {
  test('reports the database as ok and names the app', async () => {
    const r = await s.api('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true); assert.equal(r.json.db, 'ok'); assert.equal(r.json.app, 'CircuLink API');
  });
  test('says which version of the API is running (from package.json)', async () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal((await s.api('GET', '/health')).json.version, pkg.version);
  });
  test('says 503 when the database cannot be reached', async () => {
    const broken = startServer({ checkDb: async () => { throw new Error('connection refused'); } });
    const r = await broken.api('GET', '/health');
    await broken.close();
    assert.equal(r.status, 503); assert.equal(r.json.db, 'down');
  });
});

describe('unknown addresses and logins', () => {
  test('an unknown API address is 404 whether or not you are logged in', async () => {
    assert.equal((await s.api('GET', '/does-not-exist')).status, 404);
    assert.equal((await s.api('GET', '/does-not-exist', ana)).status, 404);
  });
  test('real routes still need a login', async () => {
    const r = await s.api('GET', '/meta');
    assert.equal(r.status, 401); assert.equal(r.json.code, 'auth_required');
  });
  test('each demo role logs in and sees its own role', async () => {
    for (const [who, role] of [['ana', 'resident'], ['staff', 'staff'], ['partner', 'partner'], ['admin', 'admin']]) {
      const me = await s.api('GET', '/me', await s.login(who));
      assert.equal(me.json.role, role, who);
      assert.equal(me.json.password_hash, undefined);
    }
  });
});

describe('reference lists', () => {
  test('hubs are public; meta lists categories, outcomes and rules', async () => {
    const hubs = await s.api('GET', '/hubs');
    assert.equal(hubs.status, 200);
    assert.deepEqual(hubs.json.map((h) => h.type).sort(), ['barangay', 'school']);
    const meta = await s.api('GET', '/meta', ana);
    assert.ok(meta.json.categories.some((c) => c.slug === 'ewaste' && c.hazardous === true));
    assert.ok(meta.json.categories.some((c) => c.slug === 'food' && c.food === true));
    assert.deepEqual(meta.json.outcomes.map((o) => o.key), ['reuse', 'repair', 'recycle', 'reject']);
    assert.equal(meta.json.outcomes.find((o) => o.key === 'reject').multiplier, 0);
  });
});

describe('one account per person (R8)', () => {
  test('sign-up needs a phone number and makes a resident', async () => {
    const none = await signup({ phone: '' });
    assert.equal(none.status, 400); assert.equal(none.json.code, 'bad_phone');
    const ok = await signup();
    assert.equal(ok.status, 201); assert.equal(ok.json.user.role, 'resident');
  });
  test('a role cannot be chosen at sign-up', async () => {
    const r = await signup({ role: 'admin' });
    assert.equal(r.status, 201); assert.equal(r.json.user.role, 'resident');
  });
  test('the same phone, written differently, cannot open a second account', async () => {
    const r = await signup({ phone: '0917-000-0001' });   // Ana's number with dashes
    assert.equal(r.status, 400); assert.equal(r.json.code, 'signup_failed');
  });
  test('the same student ID, in lower case, cannot open a second account', async () => {
    const r = await signup({ student_id: '2023-00123' });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'signup_failed');
    const lower = await signup({ student_id: 'abcd-1' });
    assert.equal(lower.status, 201); assert.equal(lower.json.user.student_id, 'ABCD-1');
    assert.equal((await signup({ student_id: 'ABCD-1' })).json.code, 'signup_failed');
  });
  test('a phone taken by someone else cannot be moved onto your account', async () => {
    const r = await s.api('PATCH', '/me', ana, { phone: '0917 000 0002' });   // Ben's number
    assert.equal(r.status, 400); assert.equal(r.json.code, 'phone_taken');
  });
});

describe('suspending an account', () => {
  test('locks the person out at once, and they can log in again after reinstating', async () => {
    const ben = await s.login('ben');
    await q("UPDATE users SET suspended = 1 WHERE email = 'ben@circulink.test'");
    const locked = await s.api('GET', '/meta', ben);
    assert.equal(locked.status, 403); assert.equal(locked.json.code, 'suspended');
    await q("UPDATE users SET suspended = 0 WHERE email = 'ben@circulink.test'");
    assert.equal((await s.api('GET', '/meta', ben)).status, 200);
  });
  test('logging out ends the session', async () => {
    const carlo = await s.login('carlo');
    assert.equal((await s.api('POST', '/auth/logout', carlo)).status, 200);
    assert.equal((await s.api('GET', '/me', carlo)).json.code, 'auth_expired');
  });
});

describe('notifications', () => {
  test('a person reads only their own notifications', async () => {
    const anaId = (await one("SELECT id FROM users WHERE email = 'ana@circulink.test'")).id;
    await q("INSERT INTO notifications (user_id, type, title) VALUES (?, 'test', 'Hello Ana')", [anaId]);
    const mine = await s.api('GET', '/notifications', ana);
    assert.equal(mine.json.length, 1);
    assert.equal((await s.api('GET', '/notifications', staff)).json.length, 0);
    assert.equal((await s.api('POST', `/notifications/${mine.json[0].id}/read`, staff)).status, 404);
    assert.equal((await s.api('POST', `/notifications/${mine.json[0].id}/read`, ana)).status, 200);
    assert.equal((await s.api('GET', '/me', ana)).json.unread_notifications, 0);
  });
});
