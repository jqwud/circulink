// Settling a dispute (an item returned damaged or lost). Staff choose one outcome and the credits follow it:
//   fine after all: the normal return rules · accident: owner +1 · borrower's fault: owner +1, borrower -2
//   lost: owner +2, borrower -2, the item is removed. Nobody goes below 0.
// Seeded credits: Ana 4, Ben 1, Carlo 2, Dina 3, Elena 2, Fidel 3. Every loan here is a low-tier item costing 1.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { DISPUTE_OUTCOMES } from '../src/rules.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';

let s; let ana; let ben; let carlo; let dina; let elena; let fidel; let staff;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const credits = async (token) => (await s.api('GET', '/me', token)).json.credits;
const ledger = async (requestId, reason) => (await q('SELECT user_id, amount FROM credit_ledger WHERE request_id = ? AND reason = ?', [requestId, reason]));

// Borrow, hand over, and return it damaged or lost: the loan becomes disputed and a report is opened.
async function dispute(borrower, owner, title, condition = 'damaged') {
  const r = await s.api('POST', '/requests', borrower, { item_id: await itemId(title), start_date: day(0), end_date: day(2) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal((await s.api('POST', `/requests/${r.json.id}/handover`, owner)).status, 200);
  const back = await s.api('POST', `/requests/${r.json.id}/return`, owner, { condition });
  assert.equal(back.json.status, 'disputed');
  const report = await one("SELECT id FROM reports WHERE target_type = 'request' AND target_id = ?", [r.json.id]);
  return { id: r.json.id, report: report.id };
}
const settle = (report, settleAs, outcome = 'Talked with both neighbors.') =>
  s.api('PATCH', `/admin/reports/${report}`, staff, { status: 'resolved', outcome, settle: settleAs });

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, elena, fidel, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'elena', 'fidel', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('the outcome numbers', () => {
  test('match the decision in the roadmap', () => {
    assert.deepEqual(DISPUTE_OUTCOMES.accident, { owner: 1, borrower: 0 });
    assert.deepEqual(DISPUTE_OUTCOMES.borrower_fault, { owner: 1, borrower: -2 });
    assert.deepEqual(DISPUTE_OUTCOMES.lost, { owner: 2, borrower: -2, removeItem: true });
    assert.equal(DISPUTE_OUTCOMES.fine.normalRules, true);
  });
});

describe('settling a dispute', () => {
  test('closing a disputed loan needs an outcome, and only a known one', async () => {
    const d = await dispute(dina, elena, 'Graduation toga (medium)');
    const none = await s.api('PATCH', `/admin/reports/${d.report}`, staff, { status: 'resolved', outcome: 'Done.' });
    assert.equal(none.status, 400); assert.equal(none.json.code, 'settle_required');
    const odd = await settle(d.report, 'half');
    assert.equal(odd.status, 400); assert.equal(odd.json.code, 'bad_outcome');
    assert.equal((await one('SELECT status FROM requests WHERE id = ?', [d.id])).status, 'disputed');
  });

  test('fine after all: the normal rules apply (on time, so the lender earns 1, the borrower loses nothing)', async () => {
    const d = await one("SELECT r.id, rp.id AS report FROM requests r JOIN reports rp ON rp.target_type = 'request' AND rp.target_id = r.id WHERE r.status = 'disputed' LIMIT 1");
    const elenaBefore = await credits(elena); const dinaBefore = await credits(dina);
    const r = await settle(d.report, 'fine');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(await credits(elena), elenaBefore + 1);
    assert.equal(await credits(dina), dinaBefore);
    assert.equal((await ledger(d.id, 'lend_reward')).length, 1);
    const loan = await one('SELECT status, dispute_outcome, settled_at FROM requests WHERE id = ?', [d.id]);
    assert.equal(loan.status, 'closed'); assert.equal(loan.dispute_outcome, 'fine'); assert.ok(loan.settled_at);
  });

  test('accident, nobody\'s fault: the owner gets 1 credit, the borrower nothing', async () => {
    const d = await dispute(carlo, ben, 'Cooler box');
    const benBefore = await credits(ben); const carloBefore = await credits(carlo);
    assert.equal((await settle(d.report, 'accident')).status, 200);
    assert.equal(await credits(ben), benBefore + 1);
    assert.equal(await credits(carlo), carloBefore);
    assert.deepEqual((await ledger(d.id, 'settle_accident')).map((l) => l.amount), [1]);
  });

  test('damaged by the borrower: owner +1, borrower -2', async () => {
    const d = await dispute(fidel, dina, 'Paint rollers and trays');
    const dinaBefore = await credits(dina); const fidelBefore = await credits(fidel);
    assert.equal(fidelBefore, 2);
    assert.equal((await settle(d.report, 'borrower_fault')).status, 200);
    assert.equal(await credits(dina), dinaBefore + 1);
    assert.equal(await credits(fidel), 0);
  });

  test('a borrower with too few credits stops at 0', async () => {
    const d = await dispute(ben, dina, 'Screwdriver set');
    assert.equal(await credits(ben), 1, 'Ben had 1 + 1 from the accident, minus 1 for this loan');
    assert.equal((await settle(d.report, 'borrower_fault')).status, 200);
    assert.equal(await credits(ben), 0);
    assert.deepEqual((await ledger(d.id, 'settle_borrower_fault')).map((l) => l.amount).sort(), [-1, 1]);
  });

  test('lost: owner +2, borrower -2 (floor 0), the item is removed and its other bookings are refunded', async () => {
    const chairs = await itemId('Folding chairs (set of 12)');
    const later = await s.api('POST', '/requests', carlo, { item_id: chairs, start_date: day(10), end_date: day(11) });
    assert.equal(later.json.status, 'approved');
    const carloAfterBooking = await credits(carlo);
    const d = await dispute(elena, ana, 'Folding chairs (set of 12)', 'lost');
    const anaBefore = await credits(ana);
    assert.equal((await settle(d.report, 'lost')).status, 200);
    assert.equal(await credits(ana), anaBefore + 2);
    assert.equal(await credits(elena), 0);
    assert.equal((await one('SELECT status FROM items WHERE id = ?', [chairs])).status, 'removed');
    assert.equal((await one('SELECT status FROM requests WHERE id = ?', [later.json.id])).status, 'rejected');
    assert.equal(await credits(carlo), carloAfterBooking + 1, 'the other booking was refunded');
  });

  test('both people are told how it was settled, and the request shows the outcome', async () => {
    const d = await one("SELECT id, borrower_id FROM requests WHERE dispute_outcome = 'accident'");
    const told = await q("SELECT user_id FROM notifications WHERE type = 'dispute_settled' AND ref_id = ?", [d.id]);
    assert.equal(told.length, 2);
    const view = (await s.api('GET', `/requests/${d.id}`, carlo)).json;
    assert.equal(view.dispute_outcome, 'accident');
  });

  test('a settled loan is never paid twice', async () => {
    const d = await one("SELECT r.id, rp.id AS report FROM requests r JOIN reports rp ON rp.target_type = 'request' AND rp.target_id = r.id WHERE r.dispute_outcome = 'accident'");
    const before = (await q('SELECT COUNT(*) n FROM credit_ledger WHERE request_id = ?', [d.id]))[0].n;
    await settle(d.report, 'lost');
    assert.equal((await q('SELECT COUNT(*) n FROM credit_ledger WHERE request_id = ?', [d.id]))[0].n, before);
    assert.equal((await one('SELECT dispute_outcome FROM requests WHERE id = ?', [d.id])).dispute_outcome, 'accident');
  });

  test('reports about other things still resolve with just a written outcome', async () => {
    const other = await one("SELECT id FROM reports WHERE target_type = 'item' AND status <> 'resolved' LIMIT 1");
    const r = await s.api('PATCH', `/admin/reports/${other.id}`, staff, { status: 'resolved', outcome: 'Owner fixed the photo.' });
    assert.equal(r.status, 200);
  });
});
