// Scheduled jobs, tested by running them with a "now" moved days into the future.
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { expireRequests, deleteOldIdPhotos, cleanupUploads, runReminders, runDueJobs } from '../src/jobs.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day, PNG } from './helpers/api.js';

const DAY = 86400000;
const later = (days) => new Date(Date.now() + days * DAY);
let s; let ana; let ben; let carlo; let dina; let staff; let isa;
const idOf = async (email) => (await one('SELECT id FROM users WHERE email = ?', [email])).id;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const credits = async (token) => (await s.api('GET', '/me', token)).json.credits;
const statusOf = async (id) => (await one('SELECT status FROM requests WHERE id = ?', [id])).status;
const notes = async (email, type, refId) => (await q('SELECT * FROM notifications WHERE user_id = ? AND type = ? AND ref_id = ?', [await idOf(email), type, refId])).length;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, staff, isa] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'staff', 'isa'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('request expiry (7 days, or once the dates have passed)', () => {
  let pendingId; let soonId; let approvedId; let before;

  test('setup: one pending request, one pending for tomorrow, one approved but not collected', async () => {
    before = await credits(dina);
    const ladder = await s.api('POST', '/requests', dina, { item_id: await itemId('Ladder (6 ft)'), start_date: day(10), end_date: day(11) });
    assert.equal(ladder.json.status, 'pending'); pendingId = ladder.json.id;
    const drill = await s.api('POST', '/requests', dina, { item_id: await itemId('Electric drill'), start_date: day(1), end_date: day(1) });
    assert.equal(drill.json.status, 'pending'); soonId = drill.json.id;
    const pot = await s.api('POST', '/requests', carlo, { item_id: await itemId('Large cooking pot (30 L)'), start_date: day(1), end_date: day(2) });
    assert.equal(pot.json.status, 'approved'); approvedId = pot.json.id;
  });

  test('after 6 days nothing has expired yet except the request whose day has passed', async () => {
    await expireRequests(later(6));
    assert.equal(await statusOf(pendingId), 'pending');
    assert.equal(await statusOf(soonId), 'expired');        // its only day was tomorrow
    assert.equal(await statusOf(approvedId), 'expired');    // never picked up, end date passed
  });

  test('after 8 days the unanswered request has expired', async () => {
    const r = await expireRequests(later(8));
    assert.ok(r.expired >= 1);
    assert.equal(await statusOf(pendingId), 'expired');
  });

  test('held credits come back with a ledger row, and both people are told', async () => {
    assert.equal(await credits(dina), before);
    const refunds = await q("SELECT COUNT(*) n FROM credit_ledger WHERE reason = 'refund_expired' AND request_id IN (?, ?)", [pendingId, soonId]);
    assert.equal(refunds[0].n, 2);
    assert.equal(await notes('dina@hiraman.test', 'request_expired', pendingId), 1);
    assert.equal(await notes('carlo@hiraman.test', 'request_expired', pendingId), 1);   // the ladder's owner
    const held = await one('SELECT credits_held FROM requests WHERE id = ?', [pendingId]);
    assert.equal(held.credits_held, 0);
  });

  test('running again changes nothing, and loans in progress are never touched', async () => {
    const again = await expireRequests(later(8));
    assert.equal(again.expired, 0);
    const out = await q("SELECT COUNT(*) n FROM requests WHERE status IN ('handed_over','closed')");
    await expireRequests(later(30));
    assert.equal((await q("SELECT COUNT(*) n FROM requests WHERE status IN ('handed_over','closed')"))[0].n, out[0].n);
  });

  test('an expired request is listed last and cannot be approved', async () => {
    const list = (await s.api('GET', '/requests?as=borrower', dina)).json;
    assert.equal(list.at(-1).status === 'expired' || list.every((r) => r.status === 'expired'), true);
    const approve = await s.api('POST', `/requests/${pendingId}/approve`, carlo);
    assert.equal(approve.status, 400); assert.equal(approve.json.code, 'bad_state');
  });
});

describe('ID photos are deleted 7 days after the decision', () => {
  let file;
  test('setup: Isa sends an ID and staff approve it', async () => {
    await s.api('POST', '/me/id-consent', isa);
    const r = await s.upload('/me/id-photo', isa, PNG, 'image/png', 'id.png');
    assert.equal(r.status, 200);
    file = path.join(process.env.UPLOAD_DIR, 'private', (await one('SELECT id_photo_path p FROM users WHERE email = ?', ['isa@hiraman.test'])).p);
    assert.equal((await s.api('POST', `/admin/users/${await idOf('isa@hiraman.test')}/approve`, staff)).status, 200);
    assert.ok((await one('SELECT verification_decided_at d FROM users WHERE email = ?', ['isa@hiraman.test'])).d);
  });
  test('after 6 days the photo is still there', async () => {
    await deleteOldIdPhotos(later(6));
    assert.ok(fs.existsSync(file));
  });
  test('after 8 days it is gone, the account says so, and the deletion is logged', async () => {
    const r = await deleteOldIdPhotos(later(8));
    assert.ok(r.deleted >= 1);
    assert.equal(fs.existsSync(file), false);
    assert.equal((await one('SELECT id_photo_path p FROM users WHERE email = ?', ['isa@hiraman.test'])).p, null);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'id_photo_deleted' AND target LIKE ?", [`user #${await idOf('isa@hiraman.test')}%`]));
    const view = await s.api('GET', `/admin/users/${await idOf('isa@hiraman.test')}/id-photo`, staff);
    assert.equal(view.status, 404);
  });
  test('a photo still waiting for a decision is never deleted', async () => {
    const ben2 = await s.api('POST', '/auth/register', null, { name: 'Waiting Person', email: 'waiting@hiraman.test', password: 'secret12', accept_privacy: true });
    await s.api('POST', '/me/id-consent', ben2.json.token);
    await s.upload('/me/id-photo', ben2.json.token, PNG, 'image/png', 'id.png');
    await deleteOldIdPhotos(later(60));
    assert.ok((await one('SELECT id_photo_path p FROM users WHERE email = ?', ['waiting@hiraman.test'])).p);
  });
});

describe('unused uploads are cleaned up after a day', () => {
  test('a photo nobody used is removed; photos in use and fresh uploads stay', async () => {
    const unused = (await s.upload('/uploads', ana, PNG, 'image/png', 'a.png')).json.url;
    const used = (await s.upload('/uploads', ana, PNG, 'image/png', 'b.png')).json.url;
    assert.equal((await s.api('POST', '/items', ana, { title: 'Hammer', category_id: 2, pickup_point_id: 1, photo_url: used })).status, 201);
    const pub = (u) => path.join(process.env.UPLOAD_DIR, 'public', path.basename(u));

    await cleanupUploads(later(0.5));
    assert.ok(fs.existsSync(pub(unused)), 'a fresh upload gets a day to be used');

    const r = await cleanupUploads(later(2));
    assert.ok(r.removed >= 1);
    assert.equal(fs.existsSync(pub(unused)), false);
    assert.ok(fs.existsSync(pub(used)));
    const waiting = (await one('SELECT id_photo_path p FROM users WHERE email = ?', ['waiting@hiraman.test'])).p;
    assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR, 'private', waiting)), 'an ID photo in use stays');
  });
});

describe('reminders', () => {
  test('the owner of an overdue item is told once, not every hour', async () => {
    const overdue = await one("SELECT r.id FROM requests r JOIN items i ON i.id = r.item_id WHERE i.title = 'Wrench set' AND r.status = 'handed_over'");
    await runReminders();
    await runReminders();
    assert.equal(await notes('carlo@hiraman.test', 'owner_overdue', overdue.id), 1);
  });
});

describe('job runner', () => {
  test('runs each job, records it, and skips it until its interval has passed', async () => {
    const first = await runDueJobs(later(40), { force: true });
    for (const name of ['reminders', 'checkins', 'expire_requests', 'delete_old_id_photos', 'cleanup_uploads', 'delete_old_messages', 'donations', 'tiwala', 'vouchers']) {
      assert.notEqual(first[name], 'skipped', name);
    }
    const second = await runDueJobs(later(40));
    assert.equal(second.reminders, 'skipped');
    const rows = await q('SELECT name, last_ok_at, last_error FROM job_runs');
    assert.equal(rows.length, 9);
    assert.ok(rows.every((r) => r.last_ok_at && !r.last_error));
  });
  test('one failing job is recorded and does not stop the others', async () => {
    const jobs = [
      { name: 'always_fails', everyMs: 0, run: async () => { throw new Error('boom'); } },
      { name: 'works', everyMs: 0, run: async () => ({ ok: true }) },
    ];
    const r = await runDueJobs(new Date(), { jobs });
    assert.deepEqual(r.works, { ok: true });
    assert.equal(r.always_fails.error, 'boom');
    assert.equal((await one("SELECT last_error e FROM job_runs WHERE name = 'always_fails'")).e, 'boom');
  });
  test('staff can see when each job last ran', async () => {
    const r = await s.api('GET', '/admin/jobs', staff);
    assert.equal(r.status, 200);
    assert.ok(r.json.some((j) => j.name === 'expire_requests' && j.last_ok_at));
    assert.equal((await s.api('GET', '/admin/jobs', ana)).status, 403);
    void ben; void dina;
  });
});
