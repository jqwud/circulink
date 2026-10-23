// Privacy (RA 10173): the notice, consent at sign-up and before an ID photo, "My data", and account deletion.
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { config } from '../src/config.js';
import { PRIVACY_VERSION } from '../src/privacy.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day, PNG } from './helpers/api.js';

let s; let ben; let carlo; let elena; let staff; let admin; let lito;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const userId = async (email) => (await one('SELECT id FROM users WHERE email = ?', [email])).id;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ben, carlo, elena, staff, admin] = await Promise.all(['ben', 'carlo', 'elena', 'staff', 'admin'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('the privacy notice', () => {
  test('anyone can read it, in Filipino or English, with a version and a contact', async () => {
    const fil = (await s.api('GET', '/privacy')).json;
    assert.equal(fil.version, PRIVACY_VERSION);
    assert.equal(fil.lang, 'fil');
    assert.ok(fil.sections.length >= 5);
    const en = (await s.api('GET', '/privacy?lang=en')).json;
    assert.equal(en.sections[0].title, 'What we collect');
    assert.match(en.sections.map((x) => x.body).join(' '), /7 days/);
    assert.ok(en.dpo.fallback);
  });
});

describe('consent', () => {
  test('signing up needs the privacy notice to be accepted', async () => {
    const no = await s.api('POST', '/auth/register', null, { name: 'Lito Reyes', email: 'lito@hiraman.test', password: 'secret123' });
    assert.equal(no.status, 400); assert.equal(no.json.code, 'privacy_required');
    const yes = await s.api('POST', '/auth/register', null, { name: 'Lito Reyes', email: 'lito@hiraman.test', password: 'secret123', accept_privacy: true });
    assert.equal(yes.status, 201);
    assert.equal(yes.json.user.privacy_ok, true);
    lito = yes.json.token;
  });

  test('people who joined before the notice are asked once, then it is recorded', async () => {
    assert.equal((await s.api('GET', '/me', carlo)).json.privacy_ok, false);
    assert.equal((await s.api('POST', '/me/privacy', carlo, { version: PRIVACY_VERSION })).status, 200);
    assert.equal((await s.api('GET', '/me', carlo)).json.privacy_ok, true);
    const row = await one("SELECT privacy_version, privacy_accepted_at FROM users WHERE email = 'carlo@hiraman.test'");
    assert.equal(row.privacy_version, PRIVACY_VERSION); assert.ok(row.privacy_accepted_at);
  });

  test('an ID photo needs its own consent first, and a refused upload leaves no file behind', async () => {
    const before = fs.readdirSync(path.join(config.uploadDir, 'private')).length;
    const no = await s.upload('/me/id-photo', lito, PNG, 'image/png', 'id.png');
    assert.equal(no.status, 400); assert.equal(no.json.code, 'id_consent_required');
    assert.equal(fs.readdirSync(path.join(config.uploadDir, 'private')).length, before);
    assert.equal((await s.api('POST', '/me/id-consent', lito)).status, 200);
    const yes = await s.upload('/me/id-photo', lito, PNG, 'image/png', 'id.png');
    assert.equal(yes.status, 200);
    assert.equal(yes.json.verification_status, 'pending');
  });
});

describe('My data', () => {
  test('a resident can download everything held about them, without secrets', async () => {
    await s.api('POST', `/requests/${(await one("SELECT r.id FROM requests r JOIN users u ON u.id = r.borrower_id WHERE u.email = 'ben@hiraman.test' AND r.status = 'pending'")).id}/messages`, ben, { phrase_id: 'P03' });
    const r = await s.api('GET', '/me/data', ben);
    assert.equal(r.status, 200);
    const d = r.json;
    assert.equal(d.profile.email, 'ben@hiraman.test');
    assert.ok(d.items.length >= 3, 'his listings');
    assert.ok(d.requests_as_borrower.length >= 2);
    assert.ok(d.credit_history.length >= 3);
    assert.equal(d.messages_sent.length, 1);
    assert.match(d.messages_sent[0].body, /hiramin|borrow/, 'the quick reply in words');
    const text = JSON.stringify(d);
    assert.ok(!text.includes('password'), 'no password hash');
    assert.ok(!text.includes('0917 000 0001'), 'no other person\'s phone number');
  });
});

describe('deleting an account', () => {
  test('a resident can ask, and cancel the request', async () => {
    assert.equal((await s.api('POST', '/me/delete-request', elena, { reason: 'Moving away' })).status, 200);
    assert.equal((await s.api('GET', '/me', elena)).json.deletion_requested, true);
    assert.equal((await s.api('DELETE', '/me/delete-request', elena)).status, 200);
    assert.equal((await s.api('GET', '/me', elena)).json.deletion_requested, false);
  });

  test('staff see deletion requests on the dashboard and in the residents list', async () => {
    assert.equal((await s.api('POST', '/me/delete-request', ben, {})).status, 200);
    assert.ok((await s.api('GET', '/admin/stats', staff)).json.deletion_requests >= 1);
    const list = (await s.api('GET', '/admin/users?deletion=1', staff)).json;
    assert.deepEqual(list.map((u) => u.email), ['ben@hiraman.test']);
  });

  test('only an admin can delete, and never while a loan is active', async () => {
    const benId = await userId('ben@hiraman.test');
    assert.equal((await s.api('POST', `/admin/users/${benId}/delete`, staff)).status, 403);
    const booking = await s.api('POST', '/requests', carlo, { item_id: await itemId('Cooler box'), start_date: day(2), end_date: day(3) });
    assert.equal(booking.json.status, 'approved');
    const blocked = await s.api('POST', `/admin/users/${benId}/delete`, admin);
    assert.equal(blocked.status, 400); assert.equal(blocked.json.code, 'active_loans');
    await s.api('POST', `/requests/${booking.json.id}/cancel`, carlo);
  });

  test('deleting removes the person but keeps the loan records', async () => {
    const benId = await userId('ben@hiraman.test');
    const ledgerBefore = (await q('SELECT COUNT(*) n FROM credit_ledger WHERE user_id = ?', [benId]))[0].n;
    const pending = await one("SELECT id, credit_cost FROM requests WHERE borrower_id = ? AND status = 'pending'", [benId]);
    const r = await s.api('POST', `/admin/users/${benId}/delete`, admin);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const u = await one('SELECT * FROM users WHERE id = ?', [benId]);
    assert.equal(u.name, 'Deleted user');
    assert.equal(u.phone, null); assert.equal(u.purok, null); assert.equal(u.id_photo_path, null);
    assert.ok(u.deleted_at);
    assert.notEqual(u.email, 'ben@hiraman.test');
    assert.equal((await s.api('POST', '/auth/login', null, { email: 'ben@hiraman.test', password: 'hiraman123' })).status, 401);
    assert.equal((await q("SELECT COUNT(*) n FROM items WHERE owner_id = ? AND status <> 'removed'", [benId]))[0].n, 0);
    assert.equal((await one('SELECT status FROM requests WHERE id = ?', [pending.id])).status, 'cancelled');
    assert.equal((await q('SELECT COUNT(*) n FROM request_messages WHERE sender_id = ?', [benId]))[0].n, 0);
    assert.equal((await q('SELECT COUNT(*) n FROM notifications WHERE user_id = ?', [benId]))[0].n, 0);
    assert.ok((await q('SELECT COUNT(*) n FROM credit_ledger WHERE user_id = ?', [benId]))[0].n >= ledgerBefore, 'ledger rows stay');
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'account_deleted' AND target LIKE ?", [`user #${benId}%`]));
    const list = (await s.api('GET', '/admin/users', staff)).json;
    assert.ok(!list.some((x) => x.id === benId), 'deleted accounts leave the residents list');
  });
});
