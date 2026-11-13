// The demo data with history (npm run seed:demo) is in the shape the API itself leaves: the screens work on
// it, and it breaks none of the rules it shows off.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let admin; let staff; let partner; let ana;

before(async () => {
  await resetTestDatabase();
  execFileSync('node', ['seed.js', '--history'], { cwd: new URL('..', import.meta.url), env: process.env, stdio: 'ignore' });
  s = startServer();
  [admin, staff, partner, ana] = await Promise.all(['admin', 'staff', 'partner', 'ana'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('demo data with history', () => {
  test('the report has a trend, and every screen has something to show', async () => {
    const r = (await s.api('GET', '/admin/reports', admin)).json;
    assert.ok(r.trend.filter((m) => m.kg_kept > 0).length >= 5, 'at least five months with weight');
    assert.ok(r.totals.kg_kept > 0, 'this month too');
    assert.equal((await s.api('GET', '/admin/flags', admin)).json.length, 1);
    assert.equal((await s.api('GET', '/staff/releases', staff)).json.length, 1);
    assert.ok((await s.api('GET', '/stock', partner)).json.length >= 2);
    const mine = (await s.api('GET', '/declarations', ana)).json;
    assert.equal(mine.filter((d) => d.status === 'open').length, 1);
    const impact = (await s.api('GET', '/me/impact', ana)).json;
    assert.ok(impact.points_confirmed > 0 && impact.points_pending > 0);
  });

  test('it keeps the rules: points, final states, hazardous items, the flag', async () => {
    const [{ n: early }] = await q(
      `SELECT COUNT(*) AS n FROM points_ledger p JOIN items i ON i.id = p.item_id
        WHERE p.status = 'confirmed' AND i.state NOT IN ('released','recycled','rejected')`);
    assert.equal(early, 0, 'no confirmed points before an item is final (R6)');
    const [{ n: unsafe }] = await q(
      `SELECT COUNT(*) AS n FROM recycle_batch_items bi JOIN recycle_batches b ON b.id = bi.batch_id JOIN recyclers r ON r.id = b.recycler_id
         JOIN items i ON i.id = bi.item_id JOIN categories c ON c.id = i.category_id WHERE c.hazardous = 1 AND r.accredited = 0`);
    assert.equal(unsafe, 0, 'e-waste and batteries only to the accredited recycler (R10)');
    const [{ n: wrong }] = await q("SELECT COUNT(*) AS n FROM points_ledger p JOIN items i ON i.id = p.item_id WHERE i.outcome = 'reject' AND p.points <> 0");
    assert.equal(wrong, 0, 'rejected items earn nothing (R5)');
    const flag = await one("SELECT entity_id FROM flags WHERE status = 'open'");
    const [{ n: paid }] = await q("SELECT COUNT(*) AS n FROM points_ledger p JOIN items i ON i.id = p.item_id WHERE i.declaration_id = ? AND p.status <> 'pending'", [flag.entity_id]);
    assert.equal(paid, 0, 'flagged points wait for the admin (R7)');
  });

  test('staff can carry on from it: hand over the request', async () => {
    const [rel] = (await s.api('GET', '/staff/releases', staff)).json;
    const r = await s.api('POST', `/staff/releases/${rel.id}/hand-over`, staff);
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });
});
