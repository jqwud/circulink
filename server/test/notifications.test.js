// Notifications carry their values (params), so the app can write them in the reader's language.
// Runs the main flows, then checks that every notification they created has params (announcements are
// written by staff in their own words, so they have none).
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { runCheckins, runReminders, expireRequests } from '../src/jobs.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day, PNG } from './helpers/api.js';

const DAY = 86400000;
const later = (days) => new Date(Date.now() + days * DAY);
let s; let ana; let ben; let carlo; let dina; let elena; let fidel; let staff;
let firstId;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, elena, fidel, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'elena', 'fidel', 'staff'].map((w) => s.login(w)));
  firstId = (await one('SELECT COALESCE(MAX(id), 0) AS m FROM notifications')).m;
});
after(async () => { await s.close(); await pool.end(); });

describe('every notification carries its values', () => {
  test('requests: new, approved, dates changed, rejected, cancelled', async () => {
    const speaker = await itemId('Bluetooth speaker');
    const a = (await s.api('POST', '/requests', carlo, { item_id: speaker, start_date: day(6), end_date: day(7) })).json.id;
    await s.api('PATCH', `/requests/${a}/dates`, carlo, { start_date: day(8), end_date: day(9) });
    await s.api('POST', `/requests/${a}/messages`, carlo, { body: 'Hello!' });
    await s.api('POST', `/requests/${a}/approve`, ana);
    await s.api('POST', `/requests/${a}/cancel`, carlo);
    const pending = await one("SELECT id FROM requests WHERE status = 'pending' AND borrower_id = (SELECT id FROM users WHERE email = 'ben@hiraman.test')");
    await s.api('POST', `/requests/${pending.id}/reject`, ana, { reason: 'Using it that weekend' });
    const n = await one("SELECT params FROM notifications WHERE type = 'request_new' AND id > ? ORDER BY id LIMIT 1", [firstId]);
    assert.deepEqual(Object.keys(n.params).sort(), ['end', 'item', 'name', 'start']);
    assert.equal(n.params.item, 'Bluetooth speaker');
  });

  test('loans: handover, check-ins, returns, late returns, disputes', async () => {
    const chairs = await itemId('Folding chairs (set of 12)');
    const a = (await s.api('POST', '/requests', fidel, { item_id: chairs, start_date: day(0), end_date: day(1) })).json.id;
    await s.api('POST', `/requests/${a}/handover`, ana);
    await s.api('POST', `/requests/${a}/checkin`, fidel, { answer: 'problem', note: 'One chair wobbles.' });
    await s.api('POST', `/requests/${a}/checkin`, fidel, { answer: 'returned' });
    await s.api('POST', `/requests/${a}/return`, ana, { condition: 'good' });
    const pot = await itemId('Large cooking pot (30 L)');
    const b = (await s.api('POST', '/requests', dina, { item_id: pot, start_date: day(0), end_date: day(1) })).json.id;
    await s.api('POST', `/requests/${b}/handover`, ben);
    await q('UPDATE requests SET start_date = ?, end_date = ? WHERE id = ?', [day(-3), day(-1), b]);
    await runReminders();
    await runCheckins(later(3));
    await s.api('POST', `/requests/${b}/return`, ben, { condition: 'damaged' });
    const report = await one("SELECT id FROM reports WHERE target_type = 'request' AND target_id = ?", [b]);
    await s.api('PATCH', `/admin/reports/${report.id}`, staff, { status: 'resolved', outcome: 'Settled together.', settle: 'accident' });
    await expireRequests(later(30));
  });

  test('accounts and community: verification, removals, offers, reports', async () => {
    const fresh = await s.api('POST', '/auth/register', null, { name: 'Rosa Lim', email: 'rosa@hiraman.test', password: 'goodpass1', accept_privacy: true });
    await s.api('POST', '/me/id-consent', fresh.json.token);
    await s.upload('/me/id-photo', fresh.json.token, PNG, 'image/png', 'id.png');
    await s.api('POST', `/admin/users/${fresh.json.user.id}/approve`, staff);
    await s.api('POST', `/admin/items/${await itemId('Glue gun with sticks')}/remove`, staff, { reason: 'Blurry photo' });
    const post = await one("SELECT id FROM wanted_posts WHERE status = 'open' AND user_id <> (SELECT id FROM users WHERE email = 'elena@hiraman.test') LIMIT 1");
    await s.api('POST', `/wanted/${post.id}/offer`, elena);
    const r = await s.api('POST', '/reports', elena, { target_type: 'item', target_id: await itemId('Cooler box'), reason: 'Something else', details: 'Test' });
    await s.api('PATCH', `/admin/reports/${r.json.id}`, staff, { status: 'resolved', outcome: 'Checked, all fine.' });
  });

  test('no notification made by these flows is missing its values', async () => {
    const made = await q('SELECT type, params FROM notifications WHERE id > ?', [firstId]);
    const types = new Set(made.map((n) => n.type));
    for (const t of ['request_new', 'request_dates_changed', 'message', 'request_approved', 'request_cancelled', 'request_rejected',
      'request_auto', 'handover', 'checkin_problem', 'borrower_returned', 'credit_earned', 'overdue', 'owner_overdue',
      'checkin_missed', 'checkin_alert', 'dispute', 'dispute_settled', 'verification_new', 'verified', 'item_removed', 'wanted_offer', 'report_resolved']) {
      assert.ok(types.has(t), `the flows made a "${t}" notification`);
    }
    const missing = made.filter((n) => n.type !== 'announcement' && !n.params).map((n) => n.type);
    assert.deepEqual(missing, []);
  });
});
