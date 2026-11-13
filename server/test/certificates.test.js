// Certificates: the qualification rules, claiming, admin decisions, and the public check by code.
import './helpers/env.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { certificateProgress } from '../src/rules.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let ana; let ben; let admin; let anaId; let benId; let hubSchool; let clothes;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, admin] = await Promise.all(['ana', 'ben', 'admin'].map((w) => s.login(w)));
  anaId = (await one("SELECT id FROM users WHERE email = 'ana@circulink.test'")).id;
  benId = (await one("SELECT id FROM users WHERE email = 'ben@circulink.test'")).id;
  hubSchool = (await one("SELECT id FROM hubs WHERE type = 'school'")).id;
  clothes = (await one("SELECT id FROM categories WHERE slug = 'clothes'")).id;
});
after(async () => { await s.close(); await pool.end(); });

// Drop-offs received in `months` different months, `perMonth` in each, every one worth `points` confirmed points.
async function history(userId, months, perMonth, points, status = 'confirmed') {
  for (let m = 0; m < months; m++) {
    for (let k = 0; k < perMonth; k++) {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const [d] = await pool.query(
        `INSERT INTO declarations (resident_id, hub_id, code, status, expires_at, received_at)
         VALUES (?, ?, ?, 'received', NOW(), DATE_SUB(NOW(), INTERVAL ? MONTH))`, [userId, hubSchool, code, m + 1]);
      const [i] = await pool.query(
        "INSERT INTO items (declaration_id, category_id, weight_kg, outcome, state) VALUES (?, ?, 2, 'reuse', 'released')", [d.insertId, clothes]);
      await q("INSERT INTO points_ledger (user_id, item_id, points, status, reason) VALUES (?, ?, ?, ?, 'test')", [userId, i.insertId, points, status]);
    }
  }
}

describe('who qualifies', () => {
  test('a big one-off delivery is not enough: drop-offs and months count too', () => {
    const one = certificateProgress({ points: 5000, dropoffs: 1, months: 1 });
    assert.deepEqual(one.map((l) => l.eligible), [false, false, false]);
    assert.equal(one[0].missing.dropoffs, 2);
    const steady = certificateProgress({ points: 600, dropoffs: 9, months: 3 });
    assert.deepEqual(steady.map((l) => l.eligible), [true, true, false]);
  });
});

describe('claiming and checking', () => {
  test('a resident who does not qualify cannot claim', async () => {
    assert.equal((await s.api('POST', '/me/certificates', ana, { level: 'participation' })).json.code, 'not_eligible');
    assert.equal((await s.api('POST', '/me/certificates', ana, { level: 'gold' })).json.code, 'bad_level');
  });

  test('pending points do not count', async () => {
    await history(benId, 1, 3, 50, 'pending');
    assert.equal((await s.api('POST', '/me/certificates', ben, { level: 'participation' })).json.code, 'not_eligible');
  });

  test('participation is issued at once, only once, and anyone can check it by code', async () => {
    await history(anaId, 1, 3, 40);
    const mine = (await s.api('GET', '/me/certificates', ana)).json;
    assert.equal(mine.levels.find((l) => l.key === 'participation').eligible, true);
    const c = await s.api('POST', '/me/certificates', ana, { level: 'participation' });
    assert.equal(c.status, 201);
    assert.equal(c.json.status, 'issued');
    assert.match(c.json.code, /^CL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal((await s.api('POST', '/me/certificates', ana, { level: 'participation' })).json.code, 'already_claimed');

    const pub = await s.api('GET', `/certificates/${c.json.code}`);
    assert.equal(pub.json.valid, true);
    assert.equal(pub.json.resident_name.length > 0, true);
    assert.equal(pub.json.signatories.length, 2);
    assert.equal(pub.json.signatories[0].title, 'School Principal');
    assert.equal(pub.json.email, undefined, 'no contact details on a public check');

    const site = s.base.replace(/\/api$/, '');
    const page = await fetch(`${site}/certificates/${c.json.code}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /Certificate of Participation/);
    assert.match(html, /Valid certificate/);
    assert.doesNotMatch(html, /<script/i);
    assert.equal((await fetch(`${site}/certificates/CL-NONE-NONE`)).status, 404);
  });

  test('champion waits for an admin, who can approve or decline with a reason', async () => {
    await history(anaId, 6, 3, 120);
    const req = (await s.api('POST', '/me/certificates', ana, { level: 'champion' })).json;
    assert.equal(req.status, 'pending');
    assert.equal((await s.api('GET', `/certificates/${req.code}`)).status, 404, 'a request is not a certificate');
    assert.equal((await s.api('POST', `/admin/certificates/${req.id}/decline`, admin, {})).json.code, 'bad_reason');
    assert.equal((await s.api('POST', `/admin/certificates/${req.id}/decline`, admin, { reason: 'Please wait for the yearly ceremony.' })).status, 200);
    assert.equal((await s.api('POST', '/me/certificates', ana, { level: 'champion' })).json.status, 'pending', 'can ask again after a decline');
    assert.equal((await s.api('POST', `/admin/certificates/${req.id}/approve`, admin, {})).status, 200);
    assert.equal((await s.api('GET', `/certificates/${req.code}`)).json.valid, true);
    assert.equal((await s.api('POST', `/admin/certificates/${req.id}/approve`, ben, {})).status, 403, 'residents cannot approve');
  });

  test('an admin revokes a certificate; the public check then says so and it cannot be claimed again', async () => {
    const cert = (await s.api('GET', '/admin/certificates?status=issued', admin)).json.find((c) => c.level === 'participation');
    assert.equal((await s.api('POST', `/admin/certificates/${cert.id}/revoke`, admin, { reason: 'Weights were upheld as inflated.' })).status, 200);
    const pub = (await s.api('GET', `/certificates/${cert.code}`)).json;
    assert.equal(pub.valid, false);
    assert.equal(pub.status, 'revoked');
    assert.equal((await s.api('POST', '/me/certificates', ana, { level: 'participation' })).json.code, 'revoked');
    const notes = (await s.api('GET', '/notifications', ana)).json.map((n) => n.type);
    assert.ok(notes.includes('certificate_issued') && notes.includes('certificate_revoked'));
  });
});
