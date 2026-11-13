// Impact reports (12.6): the numbers add up, rejected weight is not "kept in use", an upheld flag takes its
// weight out, the report has no names, and only admins see it.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one, todayPH } from '../src/db.js';
import { monthRange, reportCsv } from '../src/reports.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let admin; let staff; let staff2; let ana; let ben; let partner; let hubSchool; let hubBrgy; const cat = {};
const month = todayPH().slice(0, 7);

async function sorted(resident, list, { hub, hubStaff }) {
  const d = (await s.api('POST', '/declarations', resident, { hub_id: hub, items: list.map((x) => ({ category_id: cat[x.slug] })) })).json;
  assert.equal((await s.api('POST', '/staff/checkin', hubStaff, { code: d.code })).status, 200);
  for (const [i, x] of list.entries()) {
    const r = await s.api('POST', `/staff/items/${d.items[i].id}/sort`, hubStaff, { weight_kg: x.kg, outcome: x.outcome });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  return d.id;
}

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [admin, staff, staff2, ana, ben, partner] = await Promise.all(['admin', 'staff', 'staff2', 'ana', 'ben', 'partner'].map((w) => s.login(w)));
  hubSchool = (await one("SELECT id FROM hubs WHERE type = 'school'")).id;
  hubBrgy = (await one("SELECT id FROM hubs WHERE type = 'barangay'")).id;
  for (const c of await q('SELECT id, slug FROM categories')) cat[c.slug] = c.id;
  // School: 4 kg clothes reused, 2 kg books recycled, 1 kg toys rejected. Barangay: 3 kg cans recycled.
  await sorted(ana, [{ slug: 'clothes', kg: 4, outcome: 'reuse' }, { slug: 'books', kg: 2, outcome: 'recycle' }, { slug: 'toys', kg: 1, outcome: 'reject' }],
    { hub: hubSchool, hubStaff: staff });
  await sorted(ben, [{ slug: 'cans', kg: 3, outcome: 'recycle' }], { hub: hubBrgy, hubStaff: staff2 });
});
after(async () => { await s.close(); await pool.end(); });

describe('monthly report', () => {
  test('totals by outcome, kept in use, CO2e and diversion rate', async () => {
    const r = (await s.api('GET', `/admin/reports?month=${month}`, admin)).json;
    assert.equal(r.month, month);
    const t = r.totals;
    assert.equal(t.items, 4);
    assert.equal(t.kg_total, 10);
    assert.deepEqual([t.kg_reuse, t.kg_repair, t.kg_recycle, t.kg_reject], [4, 0, 5, 1]);
    assert.equal(t.kg_kept, 9, 'rejected weight is not kept in use');
    assert.equal(t.co2e_avoided_kg, 4 * 15 + 2 * 1 + 3 * 4);
    assert.equal(t.diversion_rate, 90);
    assert.equal(t.dropoffs, 2);
    assert.equal(t.residents, 2);
    assert.equal(r.trend.length, 12);
    assert.equal(r.trend[11].month, month);
    assert.equal(r.trend[11].kg_kept, 9);
  });

  test('split by hub and by category, and filtered to one hub', async () => {
    const r = (await s.api('GET', `/admin/reports?month=${month}`, admin)).json;
    assert.deepEqual(r.by_hub.map((h) => [h.hub_name, h.kg_total]), [['Campus Green Hub', 7], ['Barangay San Isidro MRF', 3]]);
    assert.equal(r.by_category.find((c) => c.slug === 'clothes').kg_reuse, 4);
    const one_ = (await s.api('GET', `/admin/reports?month=${month}&hub_id=${hubBrgy}`, admin)).json;
    assert.equal(one_.totals.kg_total, 3);
    assert.deepEqual(one_.by_hub.map((h) => h.hub_id), [hubBrgy]);
  });

  test('another month is empty, and a bad month is refused', async () => {
    const r = (await s.api('GET', '/admin/reports?month=2001-01', admin)).json;
    assert.equal(r.totals.kg_total, 0);
    assert.equal(r.totals.diversion_rate, 0);
    assert.equal((await s.api('GET', '/admin/reports?month=2026-13', admin)).json.code, 'bad_month');
    assert.throws(() => monthRange('nope'));
    assert.deepEqual(monthRange('2026-12'), { month: '2026-12', from: '2026-12-01 00:00:00', to: '2027-01-01 00:00:00' });
  });

  test('the report never names anyone', async () => {
    const text = JSON.stringify((await s.api('GET', `/admin/reports?month=${month}`, admin)).json);
    for (const name of ['Ana', 'Ben', 'Maria', 'Jose', 'circulink.test']) assert.ok(!text.includes(name), name);
  });

  test('an upheld flag takes that drop-off\'s weight out', async () => {
    const id = await sorted(ben, [{ slug: 'clothes', kg: 60, outcome: 'reuse' }], { hub: hubBrgy, hubStaff: staff2 });
    const flag = await one("SELECT id FROM flags WHERE entity = 'declaration' AND entity_id = ? AND status = 'open'", [id]);
    assert.ok(flag, 'a 60 kg drop-off is flagged (R7)');
    assert.equal((await s.api('POST', `/admin/flags/${flag.id}/uphold`, admin)).status, 200);
    assert.equal((await s.api('GET', `/admin/reports?month=${month}`, admin)).json.totals.kg_total, 10);
  });

  test('CSV export: one line for all, then each hub and category', async () => {
    const res = await s.api('GET', `/admin/reports.csv?month=${month}`, admin);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const lines = res.text.trim().split('\n');
    assert.equal(lines[0], 'month,group,name,items,kg_total,kg_reuse,kg_repair,kg_recycle,kg_reject,kg_kept,co2e_avoided_kg,diversion_rate');
    assert.equal(lines[1], `${month},all,all hubs,4,10,4,0,5,1,9,74,90`);
    assert.ok(lines.some((l) => l.includes(',hub,Campus Green Hub,')));
    assert.equal(reportCsv({ month: 'm', hub_id: null, totals: { items: 0 }, by_hub: [{ hub_name: 'A, "B"', items: 1 }], by_category: [] }).split('\n')[2].split(',hub,')[1].slice(0, 10), '"A, ""B"""');
  });

  test('only admins see reports', async () => {
    for (const t of [staff, partner, ana]) {
      assert.equal((await s.api('GET', '/admin/reports', t)).status, 403);
      assert.equal((await s.api('GET', '/admin/reports.csv', t)).status, 403);
    }
  });
});

describe('community impact', () => {
  test('any signed-in person sees the totals, with no names', async () => {
    const r = await s.api('GET', '/impact', ana);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { kg_kept: 9, co2e_avoided_kg: 74, items: 4, residents: 2 });
    assert.equal((await s.api('GET', '/impact')).status, 401);
  });
});
