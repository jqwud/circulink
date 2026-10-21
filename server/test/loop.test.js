// End-to-end test of the Hiraman borrow loop against a real MySQL test database (hiraman_test).
// Run:  npm test      (it rebuilds hiraman_test each time; your demo database is never touched)
import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';

await resetTestDatabase();
seedTestDatabase();

const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function api(method, p, token, body) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* csv or empty */ }
  return { status: res.status, json, text };
}
const login = async (email) => (await api('POST', '/auth/login', null, { email: `${email}@hiraman.test`, password: 'hiraman123' })).json.token;
const credits = async (t) => (await api('GET', '/me', t)).json.credits;
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// Steps run one after another, in order, because each builds on the state the previous one left.
const step = (name, fn) => test(name, fn);

const admin = await login('admin');
const staff = await login('staff');
const ana = await login('ana');       // 4 credits, owns chairs (low) and speaker (medium)
const ben = await login('ben');       // 1 credit
const carlo = await login('carlo');
const dina = await login('dina');

// ---- registration and verification ----
let newTok; let newId;
await step('register a new resident: starts unverified with 0 credits', async () => {
  const r = await api('POST', '/auth/register', null, { name: 'Test Neighbor', email: 'test@hiraman.test', password: 'secret12', purok: 'Purok 1' });
  assert.equal(r.status, 201); newTok = r.json.token; newId = r.json.user.id;
  assert.equal(r.json.user.verification_status, 'unverified'); assert.equal(r.json.user.credits, 0);
});
await step('unverified resident cannot borrow', async () => {
  const items = (await api('GET', '/items', newTok)).json;
  const r = await api('POST', '/requests', newTok, { item_id: items[0].id, start_date: day(1), end_date: day(2) });
  assert.equal(r.status, 403); assert.equal(r.json.code, 'not_verified');
});
await step('ID upload moves the account to pending', async () => {
  const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), 'id.png');
  const res = await fetch(`${base}/me/id-photo`, { method: 'POST', headers: { Authorization: `Bearer ${newTok}` }, body: fd });
  assert.equal(res.status, 200); assert.equal((await res.json()).verification_status, 'pending');
});
await step('residents cannot use the portal API', async () => {
  assert.equal((await api('GET', '/admin/stats', ana)).status, 403);
});
await step('staff can view the ID photo; it is not public', async () => {
  const r = await fetch(`${base}/admin/users/${newId}/id-photo`, { headers: { Authorization: `Bearer ${staff}` } });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /image\/png/);
  const noAuth = await fetch(`${base}/admin/users/${newId}/id-photo`);
  assert.equal(noAuth.status, 401);
});
await step('staff approve: resident gets 3 starter credits, once only', async () => {
  assert.equal((await api('POST', `/admin/users/${newId}/approve`, staff)).status, 200);
  await api('POST', `/admin/users/${newId}/approve`, staff);
  assert.equal(await credits(newTok), 3);
});
await step('staff reject needs a reason', async () => {
  const pend = (await api('GET', '/admin/users?status=pending', staff)).json;
  assert.ok(pend.length >= 1);
  assert.equal((await api('POST', `/admin/users/${pend[0].id}/reject`, staff, {})).status, 400);
});

// ---- listing rules ----
let chairId;
await step('listing: prohibited items are refused, "gunting" (scissors) is allowed', async () => {
  const bad = await api('POST', '/items', newTok, { title: 'Pistol', category_id: 2, pickup_point_id: 1 });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'prohibited_item');
  const ok = await api('POST', '/items', newTok, { title: 'Gunting at tape', category_id: 3, pickup_point_id: 1, condition: 'good', tier: 'low' });
  assert.equal(ok.status, 201); chairId = ok.json.id;
  assert.equal(ok.json.owner.name, 'Test');       // first name only
  assert.equal(ok.json.owner.phone, undefined);
});

// ---- low tier loop: auto-approve, handover, return, credits ----
let r1;
await step('low tier: request is approved at once and costs 1 credit', async () => {
  const before = await credits(ben);
  const r = await api('POST', '/requests', ben, { item_id: chairId, start_date: day(0), end_date: day(2) });
  assert.equal(r.status, 201); assert.equal(r.json.status, 'approved'); r1 = r.json.id;
  assert.equal(await credits(ben), before - 1);
});
await step('the same dates cannot be booked twice', async () => {
  const r = await api('POST', '/requests', carlo, { item_id: chairId, start_date: day(1), end_date: day(1) });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'dates_booked');
});
await step('only the owner can hand over', async () => {
  assert.equal((await api('POST', `/requests/${r1}/handover`, ben, {})).status, 403);
  assert.equal((await api('POST', `/requests/${r1}/handover`, newTok, {})).status, 200);
});
await step('on-time return: lender earns 1 credit, borrower can answer the survey', async () => {
  const before = await credits(newTok);
  const r = await api('POST', `/requests/${r1}/return`, newTok, { condition: 'good' });
  assert.equal(r.status, 200); assert.equal(r.json.status, 'closed'); assert.equal(r.json.on_time, true);
  assert.equal(await credits(newTok), before + 1);
  assert.equal((await api('POST', `/requests/${r1}/survey`, ben, { would_have_bought: 'yes' })).status, 200);
  assert.equal((await api('POST', `/requests/${r1}/rate`, ben, { stars: 5 })).status, 200);
});
await step('credit ledger has a row for every change', async () => {
  const l = (await api('GET', '/credits', newTok)).json;
  assert.deepEqual(l.ledger.map((x) => x.reason).sort(), ['lend_reward', 'starter']);
});

// ---- medium tier: owner approves, photo required ----
let r2;
await step('medium tier: pending until the owner approves; photo needed at handover', async () => {
  const items = (await api('GET', '/my/items', ana)).json;
  const speaker = items.find((i) => i.title.includes('speaker'));
  const r = await api('POST', '/requests', carlo, { item_id: speaker.id, start_date: day(0), end_date: day(1) });
  assert.equal(r.json.status, 'pending'); r2 = r.json.id;
  assert.equal((await api('POST', `/requests/${r2}/approve`, carlo)).status, 403);
  assert.equal((await api('POST', `/requests/${r2}/approve`, ana)).status, 200);
  const noPhoto = await api('POST', `/requests/${r2}/handover`, ana, {});
  assert.equal(noPhoto.status, 400); assert.equal(noPhoto.json.code, 'photo_required');
  assert.equal((await api('POST', `/requests/${r2}/handover`, ana, { photo: '/uploads/public/x.jpg' })).status, 200);
});
await step('damaged return goes to mediation: no lender reward, report is opened', async () => {
  const before = await credits(ana);
  const r = await api('POST', `/requests/${r2}/return`, ana, { condition: 'damaged', note: 'Cracked speaker cone' });
  assert.equal(r.status, 200); assert.equal(r.json.status, 'disputed');
  assert.equal(await credits(ana), before);
  const reports = (await api('GET', '/admin/reports?status=open', staff)).json;
  const rep = reports.find((x) => x.target_type === 'request' && x.target_id === r2);
  assert.ok(rep, 'report exists');
  assert.equal((await api('PATCH', `/admin/reports/${rep.id}`, staff, { status: 'resolved' })).status, 400); // outcome required
  assert.equal((await api('PATCH', `/admin/reports/${rep.id}`, staff, { status: 'resolved', outcome: 'Borrower will repair it.', close_request: true })).status, 200);
});

// ---- rejection and cancel refund credits ----
await step('reject and cancel return the held credits', async () => {
  const items = (await api('GET', '/my/items', carlo)).json;
  const drill = items.find((i) => i.title.includes('drill'));
  const before = await credits(dina);
  const r = await api('POST', '/requests', dina, { item_id: drill.id, start_date: day(5), end_date: day(6) });
  assert.equal(await credits(dina), before - 1);
  assert.equal((await api('POST', `/requests/${r.json.id}/reject`, carlo, { reason: 'Using it that week' })).status, 200);
  assert.equal(await credits(dina), before);
  const r2b = await api('POST', '/requests', dina, { item_id: drill.id, start_date: day(5), end_date: day(6) });
  assert.equal((await api('POST', `/requests/${r2b.json.id}/cancel`, dina)).status, 200);
  assert.equal(await credits(dina), before);
});
await step('not enough credits is refused with a clear code', async () => {
  const fresh = await api('POST', '/auth/register', null, { name: 'No Credits', email: 'nocredit@hiraman.test', password: 'secret12' });
  const id = fresh.json.user.id;
  await api('POST', `/admin/users/${id}/approve`, staff);
  const t = fresh.json.token;
  // spend the 3 starter credits on three different low-tier items
  const items = (await api('GET', '/items?tier=low&owner=others', t)).json.filter((i) => !i.is_shelf).slice(0, 4);
  for (let i = 0; i < 3; i++) assert.equal((await api('POST', '/requests', t, { item_id: items[i].id, start_date: day(10), end_date: day(10) })).status, 201);
  const r = await api('POST', '/requests', t, { item_id: items[3].id, start_date: day(10), end_date: day(10) });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'insufficient_credits');
  // ...but Barangay Shelf items are free, even at 0 credits
  const shelf = (await api('GET', '/items?shelf=1', t)).json.find((i) => i.tier === 'low');
  assert.equal(shelf.credit_cost, 0);
  const s = await api('POST', '/requests', t, { item_id: shelf.id, start_date: day(1), end_date: day(1) });
  assert.equal(s.status, 201); assert.equal(s.json.handled_by_staff, true);
  // Shelf items are handled by staff, not by residents
  assert.equal((await api('POST', `/requests/${s.json.id}/handover`, t, {})).status, 403);
  assert.equal((await api('POST', `/requests/${s.json.id}/handover`, staff, {})).status, 200);
  const back = await api('POST', `/requests/${s.json.id}/return`, staff, { condition: 'good' });
  assert.equal(back.json.status, 'closed'); assert.equal(back.json.lender_reward, 0);
});

// ---- the monthly cap per pair ----
await step('monthly cap: the same two neighbors earn the reward only twice', async () => {
  const mine = (await api('GET', '/my/items', newTok)).json.find((i) => i.title.includes('Gunting'));
  const borrower = ana;      // Ana still has 4 credits
  let rewarded = 0;
  for (let i = 0; i < 3; i++) {
    const cr = await credits(borrower);
    assert.ok(cr >= 1, `borrower has credits (round ${i})`);
    const r = await api('POST', '/requests', borrower, { item_id: mine.id, start_date: day(0), end_date: day(0) });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    await api('POST', `/requests/${r.json.id}/handover`, newTok, {});
    const back = await api('POST', `/requests/${r.json.id}/return`, newTok, { condition: 'good' });
    if (back.json.lender_reward > 0) rewarded++;
  }
  assert.equal(rewarded, 2);
});

// ---- overdue, reminders, portal reads ----
await step('overdue loans show in the portal; return after the due date costs the borrower 1 credit', async () => {
  const overdue = (await api('GET', '/admin/requests?overdue=1', staff)).json;
  assert.ok(overdue.length >= 1);
  const row = overdue[0];
  const reminders = (await api('POST', '/admin/run-reminders', staff)).json;
  assert.ok(reminders.sent >= 1);
  const before = (await api('GET', '/credits', dina)).json.balance;
  const back = await api('POST', `/requests/${row.id}/return`, staff, { condition: 'good' });
  assert.equal(back.status, 200); assert.equal(back.json.on_time, false);
  const after = (await api('GET', '/credits', dina)).json.balance;
  assert.equal(after, Math.max(0, before - 1));
});
await step('portal pages load: stats, impact (with labeled estimate), CSV export, rules, audit', async () => {
  const stats = (await api('GET', '/admin/stats', staff)).json;
  assert.ok(stats.verified_users >= 6);
  const imp = (await api('GET', '/admin/impact', staff)).json;
  assert.match(imp.method, /ESTIMATE/);
  assert.ok(imp.waste_estimate_kg.high >= imp.waste_estimate_kg.low);
  const csv = await api('GET', '/admin/export/transactions.csv', staff);
  assert.equal(csv.status, 200); assert.match(csv.text, /^id,item,category/);
  assert.equal((await api('GET', '/admin/rules', staff)).status, 200);
  assert.equal((await api('GET', '/admin/audit', staff)).status, 403);          // admin only
  assert.ok((await api('GET', '/admin/audit', admin)).json.length > 3);
  assert.equal((await api('POST', '/admin/staff', admin, { name: 'New Staff', email: 'new@hiraman.test', password: 'longenough1' })).status, 201);
});

// ---- kits, wanted board, announcements ----
await step('kit: one request creates several loans; wanted board and announcements work', async () => {
  const kits = (await api('GET', '/kits', ana)).json;
  assert.ok(kits.length >= 3 && kits[0].items.length >= 3);
  const kit = kits.find((k) => k.name_en === 'Home repair kit');
  const fidel = await login('fidel');
  const k = await api('POST', `/kits/${kit.id}/request`, fidel, { start_date: day(12), end_date: day(13) });
  assert.equal(k.status, 201); assert.ok(k.json.created.length >= 2);
  assert.equal((await api('POST', '/wanted', ana, { title: 'Test need', needed_by: day(7) })).status, 201);
  const wanted = (await api('GET', '/wanted', ben)).json;
  assert.ok(wanted.length >= 4);
  assert.equal((await api('POST', `/wanted/${wanted[0].id}/offer`, ben)).status, 200);
  const sent = (await api('POST', '/admin/announcements', staff, { title: 'Test', message: 'Hello', audience: 'Purok 1' })).json.sent_to;
  assert.ok(sent >= 2);
  assert.ok((await api('GET', '/announcements', ana)).json.some((a) => a.title === 'Test'));
});

server.close();
await pool.end();
