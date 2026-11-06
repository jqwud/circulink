// Batch 35: one ledger, two accounts. Borrow credits stay exactly as they were; Ambag points get their own
// account, lots that expire, spending oldest-first, refunds exactly once, and a reconciliation check.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one, withTx } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { addCredits } from '../src/services.js';
import { addMonths, quarterOf, quarterStart, reconcile, refundSpend, requestAdjustment, runPoints, spendPoints, spendableNow } from '../src/points.js';
import { RULES } from '../src/rules.js';

const id = async (who) => (await one('SELECT id FROM users WHERE email = ?', [`${who}@hiraman.test`])).id;
const user = async (who) => one('SELECT * FROM users WHERE email = ?', [`${who}@hiraman.test`]);
// Gives points the way an award does (a lot), dated `daysAgo` so expiry can be tested without waiting a year.
async function lot(uid, n, expiresOn, key) {
  await withTx(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [uid]);
    await conn.query(
      "INSERT INTO credit_ledger (user_id, account, amount, reason, expires_on, remaining, award_key) VALUES (?, 'reward', ?, 'earn_community', ?, ?, ?)",
      [uid, n, expiresOn, n, key]);
    await conn.query('UPDATE users SET reward_points = reward_points + ? WHERE id = ?', [n, uid]);
  });
}
const plusDays = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

before(async () => { await resetTestDatabase(); seedTestDatabase(); });
after(async () => { await pool.end(); });

describe('the migration keeps borrow credits as they were', () => {
  test('every existing ledger row is a borrow row and no resident starts with Ambag points', async () => {
    assert.equal((await one("SELECT COUNT(*) AS n FROM credit_ledger WHERE account <> 'borrow'")).n, 0);
    assert.equal((await one('SELECT COUNT(*) AS n FROM users WHERE reward_points <> 0')).n, 0);
    assert.deepEqual(await reconcile(), []);
  });
  test('the Base Program exists with the approved points', async () => {
    const rules = await q("SELECT r.activity, r.points FROM campaign_rules r JOIN reward_campaigns c ON c.id = r.campaign_id WHERE c.is_base = 1 AND c.status = 'active'");
    assert.deepEqual(rules.map((r) => [r.activity, r.points]).sort(), [['donation_donor', 15], ['loan_borrower', 3], ['loan_lender', 10], ['wanted_helper', 10]]);
  });
  test('addCredits still takes a request id as before, and still never goes below zero', async () => {
    const ana = await user('ana');
    const got = await withTx((conn) => addCredits(conn, ana.id, -(ana.credits + 5), 'late_penalty', null));
    assert.equal(got, -ana.credits);
    assert.equal((await user('ana')).credits, 0);
    assert.equal((await user('ana')).reward_points, 0, 'borrow credits never touch Ambag points');
    const row = await one('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1', [ana.id]);
    assert.equal(row.account, 'borrow');
    await withTx((conn) => addCredits(conn, ana.id, ana.credits, 'starter'));
  });
  test('addCredits refuses to move Ambag points', async () => {
    await assert.rejects(withTx((conn) => addCredits(conn, 1, 5, 'x', { account: 'reward' })));
  });
});

describe('dates', () => {
  test('months and quarters', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2026-11-07', 12), '2027-11-07');
    assert.equal(quarterOf('2026-11-07'), '2026-Q4');
    assert.equal(quarterStart('2026-05-20'), '2026-04-01');
  });
});

describe('spending, refunds and expiry', () => {
  test('spending takes the oldest lot first and refuses to go below zero', async () => {
    const ben = await id('ben');
    await lot(ben, 10, plusDays(5), 'test:ben:1');
    await lot(ben, 20, plusDays(300), 'test:ben:2');
    await assert.rejects(withTx((conn) => spendPoints(conn, ben, 31, 'redeem')), { code: 'not_enough_points' });
    const spend = await withTx((conn) => spendPoints(conn, ben, 15, 'redeem', { key: 'test:spend:1' }));
    const lots = await q("SELECT award_key, remaining FROM credit_ledger WHERE user_id = ? AND award_key LIKE 'test:ben:%' ORDER BY id", [ben]);
    assert.deepEqual(lots.map((l) => l.remaining), [0, 15]);
    assert.equal((await user('ben')).reward_points, 15);
    // A refund happens exactly once and puts points back in their own lots.
    assert.equal(await withTx((conn) => refundSpend(conn, spend, 'refund_cancelled')), 15);
    assert.equal(await withTx((conn) => refundSpend(conn, spend, 'refund_cancelled')), 0);
    assert.equal((await user('ben')).reward_points, 30);
    assert.deepEqual((await q("SELECT remaining FROM credit_ledger WHERE user_id = ? AND award_key LIKE 'test:ben:%' ORDER BY id", [ben])).map((l) => l.remaining), [10, 20]);
    assert.deepEqual(await reconcile(), []);
  });
  test('the same key cannot be written twice (database-enforced)', async () => {
    const ben = await id('ben');
    await assert.rejects(lot(ben, 5, plusDays(10), 'test:ben:1'), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(withTx((conn) => spendPoints(conn, ben, 1, 'redeem', { key: 'test:spend:1' })), { code: 'duplicate' });
  });
  test('expired points cannot be spent, even before the nightly job writes them off', async () => {
    const carlo = await id('carlo');
    await lot(carlo, 8, plusDays(-1), 'test:carlo:old');
    assert.equal(await spendableNow(carlo), 0);
    await assert.rejects(withTx((conn) => spendPoints(conn, carlo, 1, 'redeem')), { code: 'not_enough_points' });
  });
  test('the nightly job writes expired points off with a ledger row, once, and warns about soon-expiring points', async () => {
    const carlo = await id('carlo'); const ben = await id('ben');
    const out = await runPoints();
    assert.equal(out.expired, 8);
    assert.equal(out.mismatches, 0);
    assert.equal((await user('carlo')).reward_points, 0);
    const row = await one("SELECT * FROM credit_ledger WHERE user_id = ? AND reason = 'points_expired'", [carlo]);
    assert.equal(row.amount, -8);
    assert.ok(await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'points_expired'", [carlo]));
    assert.ok(await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'points_expiring'", [ben]), 'Ben has 10 points expiring in 5 days');
    const again = await runPoints();
    assert.equal(again.expired, 0);
    assert.equal(again.reminded, 0, 'one reminder per warning period');
  });
  test('a refund of points whose lot expired meanwhile writes that part off at once', async () => {
    const dina = await id('dina');
    await lot(dina, 6, plusDays(3), 'test:dina:1');
    const spend = await withTx((conn) => spendPoints(conn, dina, 6, 'redeem'));
    await q("UPDATE credit_ledger SET expires_on = ? WHERE award_key = 'test:dina:1'", [plusDays(-1)]);
    assert.equal(await withTx((conn) => refundSpend(conn, spend, 'refund_rejected')), 0);
    assert.equal((await user('dina')).reward_points, 0);
    assert.deepEqual(await reconcile(), []);
  });
  test('reconciliation reports a cached balance that does not match, and changes nothing', async () => {
    const elena = await id('elena');
    await q('UPDATE users SET reward_points = 99 WHERE id = ?', [elena]);
    const out = await runPoints();
    assert.equal(out.mismatches, 1);
    assert.equal((await user('elena')).reward_points, 99, 'never fixed silently');
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'points_mismatch'"));
    await q('UPDATE users SET reward_points = 0 WHERE id = ?', [elena]);
  });
});

describe('admin corrections', () => {
  test('need a reason, cannot target yourself, and big ones wait for a second admin', async () => {
    const admin = await user('admin'); const staff = await user('staff'); const fidel = await id('fidel');
    await assert.rejects(requestAdjustment(fidel, 5, '', admin), { code: 'reason_required' });
    await assert.rejects(requestAdjustment(admin.id, 5, 'testing myself', admin), { code: 'own_account' });
    const small = await requestAdjustment(fidel, 5, 'Helped at the clean-up, missed by the app', admin);
    assert.equal(small.status, 'approved');
    assert.equal((await user('fidel')).reward_points, 5);
    const big = await requestAdjustment(fidel, RULES.pointsAdjustSecondAbove + 1, 'Large correction for a recording error', admin);
    assert.equal(big.status, 'pending');
    assert.equal((await user('fidel')).reward_points, 5);
    const { decideAdjustment } = await import('../src/points.js');
    await assert.rejects(decideAdjustment(big.id, true, admin), { code: 'second_admin' });
    // A second admin (any lgu_admin other than the requester).
    await q("UPDATE users SET role = 'lgu_admin' WHERE id = ?", [staff.id]);
    assert.equal((await decideAdjustment(big.id, true, { ...staff, role: 'lgu_admin' })).status, 'approved');
    await q("UPDATE users SET role = 'lgu_staff' WHERE id = ?", [staff.id]);
    assert.equal((await user('fidel')).reward_points, 5 + RULES.pointsAdjustSecondAbove + 1);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'points_adjusted'"));
    await assert.rejects(requestAdjustment(fidel, -1000, 'too much', admin), { code: 'bad_points' });
    assert.deepEqual(await reconcile(), []);
  });
});
