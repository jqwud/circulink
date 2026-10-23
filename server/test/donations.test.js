// Hiraman 2.0, batch 29: Donate / free to take. A resident gives an item away; the receiver pays nothing and
// the donor earns recognition, never credits. First to claim, or the barangay chooses (priority households first).
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';
import { runDonations } from '../src/jobs.js';

let s; let ana; let ben; let carlo; let dina; let elena; let fidel; let staff;
const userId = async (who) => (await one('SELECT id FROM users WHERE email = ?', [`${who}@hiraman.test`])).id;
const credits = async (who) => (await one('SELECT credits FROM users WHERE email = ?', [`${who}@hiraman.test`])).credits;
const give = (token, title, extra = {}) => s.api('POST', '/items', token, { title, category_id: 1, pickup_point_id: 1, tier: 'low', listing_type: 'donate', claim_mode: 'first', ...extra });
const claim = (token, itemId) => s.api('POST', `/items/${itemId}/claim`, token);
const act = (token, claimId, action, body) => s.api('POST', `/donations/claims/${claimId}/${action}`, token, body);
const later = (days) => new Date(Date.now() + days * 864e5);

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, elena, fidel, staff] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'elena', 'fidel', 'staff'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('giving an item away', () => {
  test('a donation is free, open for 14 days, and shows as free to take', async () => {
    const r = await give(ana, 'Rice cooker (small)');
    assert.equal(r.status, 201);
    assert.equal(r.json.listing_type, 'donate'); assert.equal(r.json.donation_status, 'open');
    assert.equal(r.json.credit_cost, 0); assert.equal(r.json.open_until, day(14));
    const free = (await s.api('GET', '/items?type=donate', ben)).json;
    assert.ok(free.some((i) => i.id === r.json.id) && free.every((i) => i.listing_type === 'donate'));
  });
  test('valuable items go to the barangay, and some things cannot be given at all', async () => {
    assert.equal((await give(ana, 'Generator', { tier: 'high' })).json.code, 'donate_at_hall');
    assert.equal((await give(ana, 'Baby formula (2 cans)')).json.code, 'not_donatable');
    assert.equal((await give(ana, 'Old phone', { claim_mode: 'lottery' })).json.code, 'bad_claim_mode');
  });
  test('a donation cannot be borrowed', async () => {
    const id = (await give(ana, 'Electric fan')).json.id;
    const r = await s.api('POST', '/requests', ben, { item_id: id, start_date: day(1), end_date: day(2) });
    assert.equal(r.json.code, 'donation_item');
  });
});

describe('first to claim', () => {
  let item; let c;
  test('the first claim reserves it for 48 hours; the next person is told someone was faster', async () => {
    item = (await give(ana, 'School bag')).json.id;
    const r = await claim(ben, item);
    assert.equal(r.status, 201); assert.equal(r.json.status, 'reserved');
    c = r.json.id;
    const late = await claim(carlo, item);
    assert.equal(late.status, 409); assert.equal(late.json.code, 'already_claimed');
    assert.equal((await claim(ana, item)).json.code, 'own_item');
    assert.ok(!(await s.api('GET', '/items?type=donate', carlo)).json.some((i) => i.id === item), 'a reserved item leaves Browse');
  });
  test('the claim has a thread with donation phrases; the donor\'s pickup time sets the pickup day', async () => {
    assert.deepEqual((await s.api('GET', `/donations/claims/${c}/messages`, ben)).json.phrases.map((p) => p.id).sort(), ['A02', 'A03', 'A05', 'A06', 'A07', 'G01', 'G04']);
    assert.equal((await s.api('POST', `/donations/claims/${c}/messages`, ben, { phrase_id: 'G01' })).status, 201);
    assert.equal((await s.api('POST', `/donations/claims/${c}/messages`, ana, { phrase_id: 'G02', slot: `${day(2)} 16:00` })).status, 201);
    const detail = (await s.api('GET', `/donations/claims/${c}`, ben)).json;
    assert.equal(detail.pickup_date, day(2));
    assert.equal(detail.donor.name, 'Ana'); assert.equal(detail.item.title, 'School bag');
    assert.equal((await s.api('GET', `/donations/claims/${c}`, carlo)).status, 403);
  });
  test('both sides confirm, then it is given; nobody\'s credits change', async () => {
    const [a0, b0] = [await credits('ana'), await credits('ben')];
    assert.equal((await act(ana, c, 'given')).json.status, 'reserved', 'one side is not enough');
    const done = await act(ben, c, 'received');
    assert.equal(done.json.status, 'given');
    assert.equal((await one('SELECT donation_status FROM items WHERE id = ?', [item])).donation_status, 'given');
    assert.deepEqual([await credits('ana'), await credits('ben')], [a0, b0]);
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'donation_given' AND user_id = ?", [await userId('ana')]));
    assert.deepEqual((await s.api('GET', `/donations/claims/${c}/messages`, ben)).json.phrases.map((p) => p.id).sort(), ['G06', 'G07', 'T01']);
  });
  test('the donor\'s badges count confirmed donations', async () => {
    const badges = (await s.api('GET', '/me/badges', ana)).json;
    assert.equal(badges.stats.donations, 1);
    assert.equal(badges.badges.find((b) => b.key === 'generous_1').earned, true);
  });
});

describe('fair claiming', () => {
  test('two open claims at a time, four in 30 days', async () => {
    const ids = [];
    for (const t of ['Book A', 'Book B', 'Book C', 'Book D', 'Book E']) ids.push((await give(dina, t)).json.id);
    assert.equal((await claim(elena, ids[0])).status, 201);
    assert.equal((await claim(elena, ids[1])).status, 201);
    assert.equal((await claim(elena, ids[2])).json.code, 'too_many_claims');
    const open = await q("SELECT id FROM donation_claims WHERE claimer_id = ? AND status = 'reserved'", [await userId('elena')]);
    for (const x of open) await act(elena, x.id, 'release');
    assert.equal((await claim(elena, ids[2])).status, 201);
    await act(elena, (await one("SELECT id FROM donation_claims WHERE claimer_id = ? AND status = 'reserved'", [await userId('elena')])).id, 'release');
    assert.equal((await claim(elena, ids[3])).status, 201);
    const fifth = await claim(elena, ids[4]);
    assert.equal(fifth.json.code, 'claim_limit_month');
  });
  test('a released claim puts the item back for others, and the donor is told', async () => {
    const item = (await give(dina, 'Desk lamp')).json.id;
    const c = (await claim(fidel, item)).json.id;
    await act(fidel, c, 'release');
    assert.equal((await one('SELECT donation_status FROM items WHERE id = ?', [item])).donation_status, 'open');
    assert.equal((await claim(carlo, item)).status, 201);
  });
  test('two missed pickups in 60 days pause claiming for 14 days; staff can lift it', async () => {
    for (const t of ['Mug set', 'Plates']) {
      const item = (await give(ben, t, { category_id: 3 })).json.id; // Ben just received a bag (category 1)
      const c = (await claim(fidel, item)).json.id;
      await q('UPDATE donation_claims SET pickup_date = ? WHERE id = ?', [day(-1), c]);
      const ns = await act(ben, c, 'no-show');
      assert.equal(ns.status, 200, JSON.stringify(ns.json));
    }
    const u = await one('SELECT claim_paused_until FROM users WHERE id = ?', [await userId('fidel')]);
    assert.equal(u.claim_paused_until, day(14));
    const item = (await give(ben, 'Bowl', { category_id: 3 })).json.id;
    assert.equal((await claim(fidel, item)).json.code, 'claim_paused');
    assert.equal((await s.api('POST', `/admin/users/${await userId('fidel')}/claim-pause`, staff, { paused: false })).status, 200);
    assert.equal((await claim(fidel, item)).status, 201);
  });
  test('a donor can cancel one claim in 30 days; more need staff', async () => {
    const a = (await give(carlo, 'Wall clock')).json.id;
    const b = (await give(carlo, 'Picture frame')).json.id;
    assert.equal((await act(carlo, (await claim(dina, a)).json.id, 'cancel')).status, 200);
    const second = await act(carlo, (await claim(dina, b)).json.id, 'cancel');
    assert.equal(second.status, 403); assert.equal(second.json.code, 'cancel_needs_staff');
  });
  test('a receiver who got a donation waits 30 days before donating in the same category', async () => {
    const r = await give(ben, 'School bag (blue)');
    assert.equal(r.json.code, 'regift_wait');
    assert.equal((await give(ben, 'Hammer', { category_id: 2 })).status, 201, 'other categories are fine');
  });
});

describe('problems', () => {
  test('a problem goes to staff, and two in 90 days pause the donor', async () => {
    for (const t of ['Broken fan', 'Torn umbrella']) {
      const item = (await give(elena, t)).json.id;
      const c = (await claim(carlo, item)).json.id;
      await q("UPDATE donation_claims SET status = 'reserved' WHERE id = ?", [c]);
      const r = await act(carlo, c, 'problem');
      assert.equal(r.status, 200);
      await act(carlo, (await one("SELECT id FROM donation_claims WHERE claimer_id = ? AND status = 'reserved' LIMIT 1", [await userId('carlo')]) || { id: 0 }).id, 'release');
    }
    assert.ok(await one("SELECT id FROM reports WHERE reason = 'donation_problem'"));
    assert.equal((await give(elena, 'Chair')).json.code, 'donate_paused');
  });
});

describe('the barangay chooses', () => {
  let item;
  test('residents say "I\'d like this" for 3 days; staff choose, priority households first', async () => {
    item = (await give(ana, 'Electric fan (stand)', { claim_mode: 'barangay' })).json.id;
    assert.equal((await claim(ben, item)).json.status, 'waiting');
    assert.equal((await claim(dina, item)).json.status, 'waiting');
    await q('UPDATE users SET priority_household = 1 WHERE id = ?', [await userId('dina')]);
    const queue = (await s.api('GET', '/admin/donations', staff)).json;
    const row = queue.choose.find((x) => x.item.id === item);
    assert.deepEqual(row.asked.map((x) => [x.name, x.priority]), [['Dina', true], ['Ben', false]]);
    assert.equal((await s.api('GET', '/me', dina)).json.priority_household, undefined, 'residents never see the flag');
  });
  test('staff give it to one person, with barangay delivery; the others are told', async () => {
    const r = await s.api('POST', `/admin/donations/${item}/choose`, staff, { user_id: await userId('dina'), staff_delivery: true });
    assert.equal(r.status, 200);
    const chosen = await one('SELECT * FROM donation_claims WHERE item_id = ? AND claimer_id = ?', [item, await userId('dina')]);
    assert.equal(chosen.status, 'reserved'); assert.equal(chosen.staff_delivery, 1);
    assert.equal((await one('SELECT status FROM donation_claims WHERE item_id = ? AND claimer_id = ?', [item, await userId('ben')])).status, 'released');
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'donation_not_chosen' AND user_id = ?", [await userId('ben')]));
    const forDonor = (await s.api('GET', `/donations/claims/${chosen.id}`, ana)).json;
    assert.equal(forDonor.claimer.name, 'A household chosen by the barangay', 'the donor never sees who received it');
    await act(ana, chosen.id, 'given');
    assert.equal((await act(staff, chosen.id, 'received')).json.status, 'given', 'staff confirm for a delivery');
  });
  test('only staff mark priority households', async () => {
    const id = await userId('elena');
    assert.equal((await s.api('POST', `/admin/users/${id}/priority`, staff, { priority: true })).status, 200);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'priority_set'"));
  });
});

describe('unclaimed donations', () => {
  test('after 14 days the donor is asked; with no answer after 7 more days it is taken down', async () => {
    const item = (await give(fidel, 'Old curtains', { category_id: 4 })).json.id;
    await runDonations(later(14));
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'donation_unclaimed' AND ref_id = ?", [item]));
    await runDonations(later(21));
    const row = await one('SELECT status, donation_status FROM items WHERE id = ?', [item]);
    assert.deepEqual({ ...row }, { status: 'removed', donation_status: 'withdrawn' });
  });
  test('the donor can keep it 14 more days, or give it to the Barangay Shelf', async () => {
    const a = (await give(fidel, 'Bookshelf', { category_id: 4 })).json.id;
    assert.equal((await s.api('POST', `/items/${a}/donation`, fidel, { action: 'extend' })).json.open_until, day(28));
    const b = (await give(fidel, 'Folding table', { category_id: 4 })).json.id;
    assert.equal((await s.api('POST', `/items/${b}/donation`, fidel, { action: 'to_shelf' })).json.donation_status, 'to_shelf');
    assert.equal((await s.api('POST', `/admin/donations/${b}/accept-shelf`, staff)).status, 200);
    const shelf = await one('SELECT is_shelf, owner_id, listing_type FROM items WHERE id = ?', [b]);
    assert.deepEqual({ ...shelf }, { is_shelf: 1, owner_id: null, listing_type: 'lend' });
  });
  test('a reservation nobody completes ends quietly and the item is offered again', async () => {
    const item = (await give(fidel, 'Lamp shade', { category_id: 4 })).json.id;
    const c = (await claim(ana, item)).json.id;
    await runDonations(later(3));
    assert.equal((await one('SELECT status FROM donation_claims WHERE id = ?', [c])).status, 'released');
    assert.equal((await one('SELECT donation_status FROM items WHERE id = ?', [item])).donation_status, 'open');
  });
});

describe('thank-you board', () => {
  test('only donors who opted in are named, by first name and purok', async () => {
    assert.equal((await s.api('PATCH', '/me', ana, { thanks_opt_in: true })).status, 200);
    const board = (await s.api('GET', '/impact', carlo)).json.thanks;
    assert.deepEqual(board.map((x) => x.name), ['Ana']);
    assert.equal(board[0].purok, 'Purok 1'); assert.ok(board[0].donations >= 1);
  });
});
