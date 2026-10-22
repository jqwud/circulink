// Daily check-ins while an item is out, fair lateness ("I returned it" stops the clock) and the request timeline.
// Seeded credits: Ana 4, Ben 1, Carlo 2, Dina 3, Elena 2, Fidel 3. Every loan below is a low-tier item (1 credit,
// approved at once, handed over without a photo), and each borrower is chosen so they can afford it.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one, todayPH } from '../src/db.js';
import { runCheckins, runReminders } from '../src/jobs.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

const DAY = 86400000;
const later = (days) => new Date(Date.now() + days * DAY);
let s; let ana; let ben; let carlo; let dina; let elena; let fidel; let staff;
const idOf = async (email) => (await one('SELECT id FROM users WHERE email = ?', [email])).id;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const credits = async (token) => (await s.api('GET', '/me', token)).json.credits;
const notes = async (who, type, refId) => (await q('SELECT id FROM notifications WHERE user_id = ? AND type = ? AND ref_id = ?', [await idOf(`${who}@hiraman.test`), type, refId])).length;

async function lend(borrower, owner, title, start = day(0), end = day(2)) {
  const r = await s.api('POST', '/requests', borrower, { item_id: await itemId(title), start_date: start, end_date: end });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const h = await s.api('POST', `/requests/${r.json.id}/handover`, owner);
  assert.equal(h.status, 200, JSON.stringify(h.json));
  return r.json.id;
}

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, elena, fidel, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'elena', 'fidel', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('checking in', () => {
  let id;
  test('setup: Ben borrows Fidel\'s badminton rackets', async () => {
    id = await lend(ben, fidel, 'Badminton rackets (2) with shuttlecocks');
  });

  test('no check-in is due on the day of the handover', async () => {
    const r = (await s.api('GET', `/requests/${id}`, ben)).json;
    assert.equal(r.checkin.due_today, false);
    assert.equal(r.checkin.missed_days, 0);
  });

  test('only the borrower can check in, only while the item is out, with a known answer', async () => {
    assert.equal((await s.api('POST', `/requests/${id}/checkin`, fidel, { answer: 'with_me' })).status, 403);
    const wrong = await s.api('POST', `/requests/${id}/checkin`, ben, { answer: 'maybe' });
    assert.equal(wrong.status, 400); assert.equal(wrong.json.code, 'bad_checkin');
    const pending = (await s.api('GET', '/requests?as=borrower', ben)).json.find((r) => r.status === 'pending');
    const notOut = await s.api('POST', `/requests/${pending.id}/checkin`, ben, { answer: 'with_me' });
    assert.equal(notOut.status, 400); assert.equal(notOut.json.code, 'bad_state');
  });

  test('"Still with me" is saved once per day; answering again the same day replaces it', async () => {
    assert.equal((await s.api('POST', `/requests/${id}/checkin`, ben, { answer: 'with_me' })).status, 200);
    assert.equal((await s.api('POST', `/requests/${id}/checkin`, ben, { answer: 'with_me' })).status, 200);
    const rows = await q('SELECT day, answer FROM request_checkins WHERE request_id = ?', [id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].day, todayPH());
    const r = (await s.api('GET', `/requests/${id}`, fidel)).json;
    assert.equal(r.checkin.last_answer, 'with_me');
    assert.equal(r.checkin.last_day, todayPH());
  });

  test('"There\'s a problem" needs a few words, then tells the owner and opens a report for staff', async () => {
    const empty = await s.api('POST', `/requests/${id}/checkin`, ben, { answer: 'problem' });
    assert.equal(empty.status, 400); assert.equal(empty.json.code, 'note_required');
    const ok = await s.api('POST', `/requests/${id}/checkin`, ben, { answer: 'problem', note: 'One racket string snapped.' });
    assert.equal(ok.status, 200);
    assert.equal(await notes('fidel', 'checkin_problem', id), 1);
    const report = await one("SELECT * FROM reports WHERE target_type = 'request' AND target_id = ? AND reason = 'checkin_problem'", [id]);
    assert.ok(report); assert.match(report.details, /string snapped/);
  });
});

describe('"I returned it" stops the clock', () => {
  test('a late confirmation by the owner no longer costs the borrower a credit', async () => {
    const id = await lend(carlo, ana, 'Folding chairs (set of 12)', day(0), day(1));
    const said = await s.api('POST', `/requests/${id}/checkin`, carlo, { answer: 'returned' });
    assert.equal(said.status, 200);
    assert.equal(await notes('ana', 'borrower_returned', id), 1);
    // Three days pass: the loan ended yesterday, the borrower said "returned" two days ago, the owner confirms today.
    await q('UPDATE requests SET start_date = ?, end_date = ?, borrower_returned_at = ? WHERE id = ?', [day(-3), day(-1), `${day(-2)} 17:00:00`, id]);
    const before = await credits(carlo);
    const back = await s.api('POST', `/requests/${id}/return`, ana, { condition: 'good' });
    assert.equal(back.status, 200);
    assert.equal(back.json.on_time, true);
    assert.equal(back.json.late_penalty, 0);
    assert.equal(await credits(carlo), before);
  });

  test('without "I returned it", a confirmation after the end date is still late', async () => {
    const id = await lend(elena, ben, 'Portable whiteboard', day(0), day(1));
    await q('UPDATE requests SET start_date = ?, end_date = ? WHERE id = ?', [day(-3), day(-1), id]);
    const back = await s.api('POST', `/requests/${id}/return`, ben, { condition: 'good' });
    assert.equal(back.json.on_time, false);
  });

  test('after "I returned it" there are no more check-ins, no missed-day reminders and no overdue reminders', async () => {
    const id = await lend(dina, elena, 'Glue gun with sticks', day(0), day(1));
    await s.api('POST', `/requests/${id}/checkin`, dina, { answer: 'returned' });
    const again = await s.api('POST', `/requests/${id}/checkin`, dina, { answer: 'with_me' });
    assert.equal(again.status, 400); assert.equal(again.json.code, 'already_returned');
    await q('UPDATE requests SET start_date = ?, end_date = ? WHERE id = ?', [day(-3), day(-2), id]);
    await runCheckins(later(5));
    await runReminders();
    assert.equal(await notes('dina', 'checkin_missed', id), 0);
    assert.equal(await notes('dina', 'overdue', id), 0);
    const r = (await s.api('GET', `/requests/${id}`, dina)).json;
    assert.equal(r.overdue, false, 'not shown as overdue while waiting for the owner');
    assert.ok(r.borrower_returned_at);
  });
});

describe('missed check-ins', () => {
  let id; let wrench; let wrenchNotesBefore;
  test('setup: Fidel borrows Dina\'s screwdriver set; the seeded wrench loan started check-ins today', async () => {
    // The seeded overdue wrench loan was handed over 5 days ago. A loan already out when check-ins
    // began counts from that day (the migration sets checkin_since), not from its handover.
    wrench = (await one("SELECT r.id FROM requests r JOIN items i ON i.id = r.item_id WHERE i.title = 'Wrench set' AND r.status = 'handed_over'")).id;
    await q('UPDATE requests SET checkin_since = ? WHERE id = ?', [todayPH(), wrench]);
    wrenchNotesBefore = await notes('dina', 'checkin_missed', wrench);
    id = await lend(fidel, dina, 'Screwdriver set', day(0), day(5));
  });

  test('the day after the handover nothing is missed yet', async () => {
    await runCheckins(later(1));
    assert.equal(await notes('fidel', 'checkin_missed', id), 0);
    assert.equal(await notes('dina', 'checkin_missed', wrench), wrenchNotesBefore);
  });

  test('one missed day sends the borrower one reminder', async () => {
    await runCheckins(later(2));
    await runCheckins(later(2));
    assert.equal(await notes('fidel', 'checkin_missed', id), 1);
    assert.equal(await notes('dina', 'checkin_alert', id), 0);
  });

  test('two missed days alert the owner once, and staff see the count on the dashboard', async () => {
    await runCheckins(later(3));
    await runCheckins(later(3));
    assert.equal(await notes('fidel', 'checkin_missed', id), 2);
    assert.equal(await notes('dina', 'checkin_alert', id), 1);
    const stats = (await s.api('GET', '/admin/stats', staff)).json;
    assert.equal(typeof stats.missed_checkins, 'number');
  });

  test('the portal list shows the check-in state, and a check-in starts a new count', async () => {
    const list = (await s.api('GET', '/admin/requests', staff)).json;
    assert.equal(list.find((r) => r.id === id).checkin.missed_days, 0, 'counted from today, the real date');
    await s.api('POST', `/requests/${id}/checkin`, fidel, { answer: 'with_me' });
    assert.equal((await one('SELECT checkin_alerted_on FROM requests WHERE id = ?', [id])).checkin_alerted_on, null);
    await runCheckins(later(1));
    assert.equal(await notes('fidel', 'checkin_missed', id), 2, 'no new reminder the day after a check-in');
  });

  test('a stuck loan really does show up for staff', async () => {
    await q('UPDATE requests SET checkin_since = ? WHERE id = ?', [day(-4), wrench]);
    const stats = (await s.api('GET', '/admin/stats', staff)).json;
    assert.ok(stats.missed_checkins >= 1);
    const row = (await s.api('GET', '/admin/requests', staff)).json.find((r) => r.id === wrench);
    assert.equal(row.checkin.missed_days, 3);
  });
});

describe('request timeline', () => {
  test('a pending request says when it will expire and whether credits are held', async () => {
    const pending = (await s.api('GET', '/requests?as=borrower', ben)).json.find((r) => r.status === 'pending');
    assert.ok(pending.expires_on);
    assert.ok(pending.expires_on <= day(7));
    assert.equal(pending.credits_held, true);
  });

  test('the approval time is recorded, whether someone approves or the item approves at once', async () => {
    const asked = await s.api('POST', '/requests', carlo, { item_id: await itemId('Bluetooth speaker'), start_date: day(20), end_date: day(21) });
    assert.equal(asked.json.status, 'pending');
    assert.equal((await s.api('GET', `/requests/${asked.json.id}`, carlo)).json.approved_at, null);
    assert.equal((await s.api('POST', `/requests/${asked.json.id}/approve`, ana)).status, 200);
    assert.ok((await s.api('GET', `/requests/${asked.json.id}`, carlo)).json.approved_at);
    await s.api('POST', `/requests/${asked.json.id}/cancel`, carlo);

    const auto = await s.api('POST', '/requests', fidel, { item_id: await itemId('Folding chairs (set of 12)'), start_date: day(8), end_date: day(9) });
    assert.equal(auto.json.status, 'approved');
    const t = (await s.api('GET', `/requests/${auto.json.id}`, fidel)).json;
    assert.ok(t.approved_at);
    assert.equal(t.expires_on, day(10), 'an approved request nobody picks up expires the day after it ends');
  });
});
