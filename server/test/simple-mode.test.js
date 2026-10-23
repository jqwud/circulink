// Hiraman 2.0, batch 30: Simple mode follows the account; the resident or staff switch it.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { pool, one } from '../src/db.js';
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

test('off by default; the resident switches it on the Me tab', async () => {
  assert.equal((await s.api('GET', '/me', ana)).json.simple_mode, false);
  const r = await s.api('PATCH', '/me', ana, { simple_mode: true });
  assert.equal(r.json.simple_mode, true);
  assert.equal((await s.api('PATCH', '/me', ana, { simple_mode: false })).json.simple_mode, false);
});

test('staff switch it for a resident (for example at the hall), and it is audited', async () => {
  const id = (await one("SELECT id FROM users WHERE email = 'ana@hiraman.test'")).id;
  assert.equal((await s.api('POST', `/admin/users/${id}/simple-mode`, staff, { on: true })).status, 200);
  assert.equal((await s.api('GET', '/me', ana)).json.simple_mode, true);
  assert.ok(await one("SELECT id FROM audit_log WHERE action = 'simple_mode_on'"));
  assert.equal((await s.api('POST', `/admin/users/${id}/simple-mode`, ana, { on: false })).status, 403, 'residents use PATCH /me');
});
