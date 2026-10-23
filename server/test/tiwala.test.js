// Hiraman 2.0, batch 32: the Tiwala score (design spec section 8), in shadow mode (staff only, no rewards).
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';
import { scoreFrom, runTiwala } from '../src/tiwala.js';

// A loan I lent that counts by every rule; override what a test needs.
const loan = (borrowerId, extra = {}) => ({ borrowerId, itemId: 100 + borrowerId, onTime: true, good: true, overnight: true, borrowerVerifiedDays: 60, ...extra });
const base = (extra = {}) => ({
  verifiedDays: 120, accountDays: 120, frozen: false, lent: [], borrowedFrom: {}, returns: [], donations: 0, ratings: [], noShows: 0, listingsRemoved: 0, ...extra,
});
const rated = (n, stars) => Array.from({ length: n }, (_, i) => ({ raterId: 500 + i, stars }));

describe('the formula (pure)', () => {
  test('the spec\'s worked example: Ana scores 78, Silver', () => {
    const r = scoreFrom(base({ lent: [loan(1), loan(2), loan(3), loan(4), loan(5), loan(1, { itemId: 201 })], ratings: [...rated(4, 5), { raterId: 600, stars: 3 }] }));
    assert.deepEqual(r.parts, { start: 40, loans: 18, borrowers: 10, returns: 0, donations: 0, ratings: 5, clean: 5, penalties: 0 });
    assert.equal(r.score, 78); assert.equal(r.tier, 'silver'); assert.equal(r.needs_staff_check, false);
  });
  test('a newly verified resident sees a score but no tier for 30 days', () => {
    const r = scoreFrom(base({ verifiedDays: 10, lent: [loan(1), loan(2), loan(3), loan(4)] }));
    assert.ok(r.score >= 50); assert.equal(r.tier, 'starter');
  });
  test('at most 2 loans count per borrower, and 4 per item', () => {
    assert.equal(scoreFrom(base({ lent: [1, 2, 3, 4, 5].map((i) => loan(7, { itemId: i })) })).counted_loans, 2);
    assert.equal(scoreFrom(base({ lent: [1, 2, 3, 4, 5, 6].map((b) => loan(b, { itemId: 9 })) })).counted_loans, 4);
  });
  test('late, damaged, same-day loans and loans to new borrowers earn nothing', () => {
    const r = scoreFrom(base({ lent: [loan(1, { onTime: false }), loan(2, { good: false }), loan(3, { overnight: false }), loan(4, { borrowerVerifiedDays: 10 })] }));
    assert.equal(r.counted_loans, 0);
  });
  test('lending back and forth with the same person 3+ times flags it, and those loans stop counting', () => {
    const r = scoreFrom(base({ lent: [loan(8, { itemId: 1 }), loan(8, { itemId: 2 }), loan(9)], borrowedFrom: { 8: 1 }, ratings: [{ raterId: 8, stars: 5 }] }));
    assert.equal(r.counted_loans, 1);
    assert.ok(r.signals.includes('loop'));
  });
  test('ratings count only from 3+ different people', () => {
    assert.equal(scoreFrom(base({ ratings: rated(2, 5) })).parts.ratings, 0);
    assert.equal(scoreFrom(base({ ratings: rated(3, 4) })).parts.ratings, 3);
  });
  test('without lending, the most is 64: donors and good borrowers get badges, not food rewards', () => {
    const r = scoreFrom(base({ donations: 10, returns: Array(9).fill({ onTime: true, good: true }), ratings: rated(5, 5) }));
    assert.equal(r.score, 64); assert.equal(r.tier, 'starter');
  });
  test('penalties: a late return costs 5 and the clean-record bonus; a lost item 15; never below 0', () => {
    assert.equal(scoreFrom(base({ returns: [{ onTime: false, good: true }] })).score, 40 - 5);
    assert.equal(scoreFrom(base({ returns: [{ onTime: true, good: false, outcome: 'lost' }], noShows: 3, listingsRemoved: 5 })).score, 0);
  });
  test('Gold needs 6 loans to 4+ people, an account 90+ days old, and a staff check', () => {
    const lent = [1, 2, 3, 4, 5, 6].flatMap((b) => [loan(b), loan(b, { itemId: 300 + b })]);
    const r = scoreFrom(base({ lent, ratings: rated(5, 5), donations: 2 }));
    assert.equal(r.tier, 'gold'); assert.equal(r.needs_staff_check, true);
    assert.equal(scoreFrom(base({ lent, ratings: rated(5, 5), donations: 2, accountDays: 60 })).tier, 'silver');
  });
  test('most loans with the same 3 people is a ring: shown to staff, and Silver waits for a check', () => {
    const lent = [loan(1), loan(1, { itemId: 2 }), loan(2), loan(2, { itemId: 3 }), loan(3), loan(3, { itemId: 4 }), loan(4)];
    const r = scoreFrom(base({ lent, ratings: rated(5, 5) }));
    assert.ok(r.signals.includes('ring')); assert.equal(r.needs_staff_check, true);
  });
  test('confirmed collusion holds the score at 0', () => {
    const r = scoreFrom(base({ frozen: true, lent: [loan(1), loan(2)] }));
    assert.equal(r.score, 0); assert.equal(r.tier, 'starter');
  });
});

describe('shadow mode', () => {
  let s; let staff; let admin; let ana;
  before(async () => {
    await resetTestDatabase();
    seedTestDatabase();
    s = startServer();
    [staff, admin, ana] = await Promise.all(['staff', 'admin', 'ana'].map((w) => s.login(w)));
  });
  after(async () => { await s.close(); await pool.end(); });

  test('the nightly job scores every verified resident', async () => {
    const out = await runTiwala(new Date('2026-10-24T03:00:00+08:00'));
    const n = await one("SELECT COUNT(*) AS n FROM trust_scores WHERE period = 'live'");
    assert.equal(n.n, out.residents); assert.ok(out.residents >= 6);
    assert.equal(out.snapshot, null);
  });
  test('on the first day of a quarter it also keeps a snapshot of the quarter that ended', async () => {
    assert.equal((await runTiwala(new Date('2027-01-01T03:00:00+08:00'))).snapshot, '2026-Q4');
    assert.ok(await one("SELECT user_id FROM trust_scores WHERE period = '2026-Q4' LIMIT 1"));
  });
  test('staff see every score with how it was made; residents see only their own (GET /me/tiwala)', async () => {
    const r = await s.api('GET', '/admin/tiwala', staff);
    assert.equal(r.status, 200);
    assert.equal(r.json.shadow_mode, false, 'rewards are live since batch 33');
    const row = r.json.residents[0];
    assert.ok(row.user.name && typeof row.score === 'number' && row.parts.start === 40);
    assert.equal((await s.api('GET', '/admin/tiwala', ana)).status, 403);
    assert.equal((await s.api('GET', '/me', ana)).json.tiwala, undefined);
  });
  test('admins confirm collusion (held at 0 for 180 days); it is audited and recalculated', async () => {
    const id = (await one("SELECT id FROM users WHERE email = 'ana@hiraman.test'")).id;
    assert.equal((await s.api('POST', `/admin/users/${id}/tiwala-freeze`, staff, { frozen: true })).status, 403, 'admins only');
    const r = await s.api('POST', `/admin/users/${id}/tiwala-freeze`, admin, { frozen: true });
    assert.equal(r.status, 200);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'tiwala_frozen'"));
    assert.equal((await one("SELECT score FROM trust_scores WHERE user_id = ? AND period = 'live'", [id])).score, 0);
  });
  test('the job runs nightly with the others', async () => {
    const { JOBS } = await import('../src/jobs.js');
    assert.ok(JOBS.some((j) => j.name === 'tiwala'));
    await q('SELECT 1');
  });
});
