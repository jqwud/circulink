// Account safety: passwords, real logout, staff-assisted reset, failed-login lockout, per-user write limits,
// session length and renewal, allowed web origins, and a server that refuses a missing secret in production.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { after, before, describe, test } from 'node:test';
import { pool, one } from '../src/db.js';
import { config } from '../src/config.js';
import { corsAllowed } from '../src/app.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let s; let staff; let admin;
const register = (email, password = 'goodpass1') =>
  s.api('POST', '/auth/register', null, { name: 'Test Person', email, password, accept_privacy: true });
const login = (email, password) => s.api('POST', '/auth/login', null, { email, password });

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [staff, admin] = await Promise.all(['staff', 'admin'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('passwords', () => {
  test('new passwords need at least 8 characters', async () => {
    const short = await register('short@hiraman.test', 'abc1234');
    assert.equal(short.status, 400); assert.equal(short.json.code, 'bad_password');
    assert.equal((await register('long@hiraman.test', 'abcd1234')).status, 201);
  });

  test('signing up with an email that is taken gives a neutral answer', async () => {
    const again = await register('long@hiraman.test', 'another12');
    assert.equal(again.status, 400); assert.equal(again.json.code, 'signup_failed');
    assert.doesNotMatch(again.json.error, /already (registered|in use)/i);
  });

  test('changing the password needs the current one, ends other sessions and keeps this one', async () => {
    const first = (await login('long@hiraman.test', 'abcd1234')).json.token;
    const second = (await login('long@hiraman.test', 'abcd1234')).json.token;
    const wrong = await s.api('POST', '/me/password', first, { current: 'nope', new_password: 'newpass12' });
    assert.equal(wrong.status, 400); assert.equal(wrong.json.code, 'wrong_password');
    const tooShort = await s.api('POST', '/me/password', first, { current: 'abcd1234', new_password: 'short' });
    assert.equal(tooShort.json.code, 'bad_password');
    const ok = await s.api('POST', '/me/password', first, { current: 'abcd1234', new_password: 'newpass12' });
    assert.equal(ok.status, 200); assert.ok(ok.json.token);
    assert.equal((await s.api('GET', '/me', second)).status, 401, 'the other session ended');
    assert.equal((await s.api('GET', '/me', ok.json.token)).status, 200, 'this device stays logged in');
    assert.equal((await login('long@hiraman.test', 'abcd1234')).status, 400);
    assert.equal((await login('long@hiraman.test', 'newpass12')).status, 200);
  });
});

describe('logging out', () => {
  test('a token stops working after logout', async () => {
    const t = (await login('ana@hiraman.test', 'hiraman123')).json.token;
    assert.equal((await s.api('GET', '/me', t)).status, 200);
    assert.equal((await s.api('POST', '/auth/logout', t)).status, 200);
    const after1 = await s.api('GET', '/me', t);
    assert.equal(after1.status, 401); assert.equal(after1.json.code, 'auth_expired');
  });
});

describe('staff-assisted password reset', () => {
  test('a resident cannot reset anyone', async () => {
    const carlo = await s.login('carlo');
    const dina = await one("SELECT id FROM users WHERE email = 'dina@hiraman.test'");
    assert.equal((await s.api('POST', `/admin/users/${dina.id}/reset-password`, carlo)).status, 403);
  });

  test('staff give a resident a temporary password that must be changed at the next login', async () => {
    const old = await s.login('dina');
    const dina = await one("SELECT id FROM users WHERE email = 'dina@hiraman.test'");
    const r = await s.api('POST', `/admin/users/${dina.id}/reset-password`, staff);
    assert.equal(r.status, 200);
    assert.ok(r.json.temporary_password.length >= 10);
    assert.equal((await s.api('GET', '/me', old)).status, 401, 'old sessions end');
    const back = await login('dina@hiraman.test', r.json.temporary_password);
    assert.equal(back.status, 200);
    assert.equal(back.json.user.must_change_password, true);
    const changed = await s.api('POST', '/me/password', back.json.token, { current: r.json.temporary_password, new_password: 'dinasnew1' });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.user.must_change_password, false);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'password_reset' AND target LIKE ?", [`user #${dina.id}%`]));
  });

  test('only an admin can reset a staff account', async () => {
    const staffRow = await one("SELECT id FROM users WHERE email = 'staff@hiraman.test'");
    assert.equal((await s.api('POST', `/admin/users/${staffRow.id}/reset-password`, staff)).status, 403);
    const adminRow = await one("SELECT id FROM users WHERE email = 'admin@hiraman.test'");
    assert.equal((await s.api('POST', `/admin/users/${adminRow.id}/reset-password`, admin)).status, 400, 'not your own account');
  });
});

describe('too many failed logins', () => {
  test('five wrong passwords lock that email for a while; other emails still work', async () => {
    await register('lockme@hiraman.test', 'rightpass1');
    for (let i = 0; i < 5; i++) assert.equal((await login('lockme@hiraman.test', 'wrongpass')).status, 400);
    const locked = await login('lockme@hiraman.test', 'rightpass1');
    assert.equal(locked.status, 429); assert.equal(locked.json.code, 'too_many_attempts');
    assert.equal((await login('fidel@hiraman.test', 'hiraman123')).status, 200);
  });
});

describe('limits on changes per person', () => {
  test('one person making too many changes is slowed down, others are not', async () => {
    const small = startServer({ writeLimit: 3 });
    const fidel = await small.login('fidel');
    const elena = await small.login('elena');
    for (let i = 0; i < 3; i++) assert.notEqual((await small.api('POST', '/notifications/read', fidel)).status, 429);
    const fourth = await small.api('POST', '/notifications/read', fidel);
    assert.equal(fourth.status, 429); assert.equal(fourth.json.code, 'too_many_requests');
    assert.notEqual((await small.api('POST', '/notifications/read', elena)).status, 429);
    assert.equal((await small.api('GET', '/me', fidel)).status, 200, 'reading is never limited');
    await small.close();
  });
});

describe('sessions', () => {
  test('staff sessions last 12 hours, resident sessions 14 days', async () => {
    const st = jwt.decode((await login('staff@hiraman.test', 'hiraman123')).json.token);
    assert.equal(st.exp - st.iat, 12 * 3600);
    const res = jwt.decode((await login('elena@hiraman.test', 'hiraman123')).json.token);
    assert.equal(res.exp - res.iat, 14 * 86400);
  });

  test('an active resident gets a renewed token once a day, so they stay logged in', async () => {
    const fresh = (await login('carlo@hiraman.test', 'hiraman123')).json.token;
    assert.equal((await s.api('GET', '/me', fresh)).json.token, undefined);
    const u = await one("SELECT id, role, token_version FROM users WHERE email = 'carlo@hiraman.test'");
    const twoDaysOld = jwt.sign({ id: u.id, role: u.role, v: u.token_version, iat: Math.floor(Date.now() / 1000) - 2 * 86400 }, config.jwtSecret, { expiresIn: '14d' });
    const me = (await s.api('GET', '/me', twoDaysOld)).json;
    assert.ok(me.token, 'a new token comes back');
    assert.equal((await s.api('GET', '/me', me.token)).status, 200);
  });
});

describe('safer defaults', () => {
  test('only listed web origins may call the API; local development is allowed by default', () => {
    assert.equal(corsAllowed('http://localhost:5173', ''), true);
    assert.equal(corsAllowed('http://127.0.0.1:8091', ''), true);
    assert.equal(corsAllowed('https://evil.example', ''), false);
    assert.equal(corsAllowed('https://hall.example', 'https://hall.example,https://other.example'), true);
    assert.equal(corsAllowed('https://evil.example', 'https://hall.example'), false);
    assert.equal(corsAllowed('https://anything.example', '*'), true);
    assert.equal(corsAllowed(undefined, ''), true, 'apps and same-site pages send no origin');
  });

  test('in production the server refuses to start without a real secret', () => {
    const run = (env) => {
      try {
        execFileSync(process.execPath, ['-e', "import('./src/config.js').then(() => console.log('started'))"],
          { cwd: serverDir, env: { ...process.env, ...env }, stdio: 'pipe' });
        return 'started';
      } catch (e) {
        return String(e.stderr);
      }
    };
    assert.match(run({ NODE_ENV: 'production', JWT_SECRET: '' }), /JWT_SECRET/);
    assert.match(run({ NODE_ENV: 'production', JWT_SECRET: 'short' }), /JWT_SECRET/);
    assert.equal(run({ NODE_ENV: 'production', JWT_SECRET: 'a-long-random-secret-for-production-use' }), 'started');
  });
});
