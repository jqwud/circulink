// Hiraman 2.0, batch 33: food rewards. Rice and vegetables from local producers, paid for by the LGU; vouchers
// each quarter by Tiwala tier; collected at the barangay hall with a 6-digit code. No money moves in the app.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';
import { issueVouchers, runVouchers } from '../src/rewards.js';

let s; let ana; let ben; let carlo; let dina; let staff; let admin;
let rice; let veg;
const userId = async (who) => (await one('SELECT id FROM users WHERE email = ?', [`${who}@hiraman.test`])).id;
const stock = async (id) => (await one('SELECT stock FROM reward_catalog WHERE id = ?', [id])).stock;
const vouchersOf = async (token) => (await s.api('GET', '/me/vouchers', token)).json;
const score = (who, tier, extra = {}) => userId(who).then((id) => q(
  `INSERT INTO trust_scores (user_id, period, score, tier, parts, signals, needs_staff_check, counted_loans, computed_on)
   VALUES (?, ?, ?, ?, '{}', ?, ?, 4, CURDATE())`,
  [id, extra.period || '2026-Q3', extra.score || 70, tier, JSON.stringify(extra.signals || []), extra.check ? 1 : 0]));

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, carlo, dina, staff, admin] = await Promise.all(['ana', 'ben', 'carlo', 'dina', 'staff', 'admin'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('the catalog and the stock the LGU buys', () => {
  test('admins add local producers and rewards; staff record purchases (audited)', async () => {
    const sup = await s.api('POST', '/admin/suppliers', admin, { name: 'Purok 3 Farmers Association', kind: 'farmer', contact_name: 'Mang Ramon' });
    assert.equal(sup.status, 201);
    assert.equal((await s.api('POST', '/admin/suppliers', staff, { name: 'X' })).status, 403);
    rice = (await s.api('POST', '/admin/rewards/catalog', admin, { name_en: '2 kg rice', name_fil: '2 kilong bigas', supplier_id: sup.json.id, value_estimate: 110 })).json.id;
    veg = (await s.api('POST', '/admin/rewards/catalog', admin, { name_en: '1 kg fresh vegetables', name_fil: '1 kilong sariwang gulay', value_estimate: 80 })).json.id;
    assert.equal((await s.api('POST', `/admin/rewards/catalog/${rice}/stock`, staff, { qty: 20, reason: 'purchase', note: 'OR #1234' })).json.stock, 20);
    assert.equal((await s.api('POST', `/admin/rewards/catalog/${veg}/stock`, staff, { qty: 1, reason: 'purchase' })).json.stock, 1);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'stock_purchase' AND target LIKE '%OR #1234%'"));
  });
  test('stock cannot go below zero, and a purchase cannot subtract', async () => {
    assert.equal((await s.api('POST', `/admin/rewards/catalog/${veg}/stock`, staff, { qty: -5, reason: 'correction' })).json.code, 'out_of_stock');
    assert.equal((await s.api('POST', `/admin/rewards/catalog/${veg}/stock`, staff, { qty: -1, reason: 'purchase' })).json.code, 'bad_qty');
  });
  test('residents see what they can choose (in stock only)', async () => {
    const list = (await s.api('GET', '/rewards/catalog', ana)).json;
    assert.deepEqual(list.map((c) => c.name_en).sort(), ['1 kg fresh vegetables', '2 kg rice']);
  });
});

describe('vouchers each quarter', () => {
  test('Bronze 1, Silver 2, Gold 3; Gold and anyone with a signal wait for staff; nobody gets twice', async () => {
    await score('ana', 'silver'); await score('ben', 'gold', { score: 85 }); await score('carlo', 'bronze', { signals: ['ring'], check: true }); await score('dina', 'starter');
    const out = await issueVouchers('2026-Q3');
    assert.deepEqual(out, { period: '2026-Q3', residents: 3, vouchers: 6 });
    assert.deepEqual((await vouchersOf(ana)).map((v) => v.status), ['issued', 'issued']);
    assert.deepEqual((await vouchersOf(ben)).map((v) => v.status), ['held', 'held', 'held']);
    assert.equal((await vouchersOf(ben))[0].code, null, 'no code until staff release it');
    assert.deepEqual((await vouchersOf(carlo)).map((v) => v.status), ['held']);
    assert.deepEqual(await vouchersOf(dina), []);
    assert.equal((await issueVouchers('2026-Q3')).vouchers, 0);
    const n = await one("SELECT params FROM notifications WHERE type = 'voucher_issued' AND user_id = ?", [await userId('ana')]);
    assert.deepEqual(n.params, { tier: 'silver', n: 2, held: false });
  });
  test('admins can set vouchers per tier to 0 when stock is short', async () => {
    assert.equal((await s.api('PUT', '/admin/settings', admin, { vouchersGold: 0 })).status, 200);
    await score('elena', 'gold', { period: '2026-Q4' });
    assert.equal((await issueVouchers('2026-Q4')).vouchers, 0);
    await s.api('PUT', '/admin/settings', admin, { vouchersGold: null });
  });
});

describe('choosing and collecting', () => {
  let mine;
  test('choosing reserves one unit; changing gives it back', async () => {
    mine = await vouchersOf(ana);
    assert.equal((await s.api('POST', `/vouchers/${mine[0].id}/choose`, ana, { catalog_id: veg })).json.status, 'chosen');
    assert.equal(await stock(veg), 0);
    assert.equal((await s.api('POST', `/vouchers/${mine[1].id}/choose`, ana, { catalog_id: veg })).json.code, 'out_of_stock');
    await s.api('POST', `/vouchers/${mine[0].id}/choose`, ana, { catalog_id: rice });
    assert.equal(await stock(veg), 1); assert.equal(await stock(rice), 19);
    assert.equal((await s.api('POST', `/vouchers/${mine[0].id}/choose`, ben, { catalog_id: rice })).status, 404, 'only your own voucher');
    const held = (await vouchersOf(ben))[0];
    assert.equal((await s.api('POST', `/vouchers/${held.id}/choose`, ben, { catalog_id: rice })).json.code, 'bad_state');
  });
  test('at the hall: staff see first name, purok and the reward, then hand it out once', async () => {
    const code = (await vouchersOf(ana))[0].code;
    assert.match(code, /^\d{6}$/);
    const look = (await s.api('GET', `/admin/vouchers/code/${code}`, staff)).json;
    assert.deepEqual(look.resident, { first_name: 'Ana', purok: 'Purok 1' }); assert.equal(look.reward.name_en, '2 kg rice');
    assert.equal((await s.api('POST', `/admin/vouchers/code/${code}/give`, staff)).json.status, 'given');
    assert.equal((await s.api('POST', `/admin/vouchers/code/${code}/give`, staff)).json.code, 'already_given');
    assert.ok(await one("SELECT id FROM notifications WHERE type = 'voucher_given' AND user_id = ?", [await userId('ana')]));
    assert.equal((await s.api('GET', `/admin/vouchers/code/${code}`, ana)).status, 403);
  });
  test('a resident who has not chosen (for example a senior) chooses at the hall', async () => {
    const v = (await vouchersOf(ana)).find((x) => x.status === 'issued');
    assert.equal((await s.api('POST', `/admin/vouchers/code/${v.code}/give`, staff)).json.code, 'bad_reward');
    assert.equal((await s.api('POST', `/admin/vouchers/code/${v.code}/give`, staff, { catalog_id: veg })).json.status, 'given');
    assert.equal(await stock(veg), 0);
  });
  test('staff release a held voucher after checking; admins cancel one with a reason', async () => {
    const [a, b] = await q("SELECT id FROM vouchers WHERE user_id = ? AND status = 'held' ORDER BY id", [await userId('ben')]);
    assert.equal((await s.api('POST', `/admin/vouchers/${a.id}/release`, staff)).json.status, 'issued');
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'voucher_released'"));
    assert.equal((await s.api('POST', `/admin/vouchers/${b.id}/cancel`, staff, { reason: 'Ring confirmed' })).status, 403);
    assert.equal((await s.api('POST', `/admin/vouchers/${b.id}/cancel`, admin, { reason: '' })).json.code, 'reason_required');
    assert.equal((await s.api('POST', `/admin/vouchers/${b.id}/cancel`, admin, { reason: 'Lending loop confirmed with both families' })).json.status, 'cancelled');
    const queue = (await s.api('GET', '/admin/rewards', staff)).json;
    assert.equal(queue.held.length, 2, 'one of Ben\'s and Carlo\'s');
  });
});

describe('expiry and reminders', () => {
  test('7 days and 1 day before, a reminder; after 30 days it expires and a reserved unit returns', async () => {
    const v = (await vouchersOf(ben)).find((x) => x.status === 'issued');
    await s.api('POST', `/vouchers/${v.id}/choose`, ben, { catalog_id: rice });
    const before = await stock(rice);
    await q('UPDATE vouchers SET expires_on = ? WHERE id = ?', [day(7), v.id]);
    assert.equal((await runVouchers()).reminded, 1);
    assert.equal((await runVouchers()).reminded, 0, 'once per reminder');
    await q('UPDATE vouchers SET expires_on = ? WHERE id = ?', [day(-1), v.id]);
    assert.equal((await runVouchers()).expired, 1);
    assert.equal((await one('SELECT status FROM vouchers WHERE id = ?', [v.id])).status, 'expired');
    assert.equal(await stock(rice), before + 1);
  });
});

describe('the barangay\'s accounts', () => {
  test('a monthly report per reward, and about 5% of collections to phone and confirm', async () => {
    const r = (await s.api('GET', `/admin/rewards/report?month=${day(0).slice(0, 7)}`, staff)).json;
    const riceLine = r.lines.find((l) => l.name_en === '2 kg rice');
    assert.equal(riceLine.bought, 20); assert.equal(riceLine.supplier, 'Purok 3 Farmers Association');
    assert.equal(r.vouchers_given, 2);
    assert.equal(r.call_back.length, 1);
    assert.ok(r.call_back[0].name && r.call_back[0].reward);
  });
});

describe('residents see their score now', () => {
  test('my Tiwala score, tier and the next step', async () => {
    await q("INSERT INTO trust_scores (user_id, period, score, tier, parts, signals, counted_loans, computed_on) VALUES (?, 'live', 58, 'bronze', '{\"start\":40}', '[]', 2, CURDATE())", [await userId('dina')]);
    const t = (await s.api('GET', '/me/tiwala', dina)).json;
    assert.equal(t.score, 58); assert.equal(t.tier, 'bronze');
    assert.deepEqual(t.next, { tier: 'silver', points: 7, loans: 2 });
    assert.equal((await s.api('GET', '/admin/tiwala', staff)).json.shadow_mode, false);
  });
  test('admins can issue now from today\'s scores (first launch), once', async () => {
    assert.equal((await s.api('POST', '/admin/rewards/issue', staff)).status, 403);
    const r = await s.api('POST', '/admin/rewards/issue', admin);
    assert.equal(r.status, 200); assert.equal(r.json.period, day(0));
    assert.equal((await vouchersOf(dina)).length, 1);
    assert.equal((await s.api('POST', '/admin/rewards/issue', admin)).json.vouchers, 0);
  });
});
