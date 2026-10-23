// Admins change the rule numbers from the portal, within safe limits; every change is audited and takes effect at once.
// Privacy numbers (ID photo and contact retention) and the dispute outcomes are not editable here.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, one } from '../src/db.js';
import { RULES } from '../src/rules.js';
import { loadRuleSettings, RULE_DEFAULTS } from '../src/settings.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day, PNG } from './helpers/api.js';

let s; let admin; let staff; let ana;
before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [admin, staff, ana] = await Promise.all(['admin', 'staff', 'ana'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

describe('editable rule numbers', () => {
  test('staff can read them with their limits and defaults; privacy numbers are not offered', async () => {
    const list = (await s.api('GET', '/admin/settings', staff)).json;
    const max = list.find((x) => x.key === 'maxLoanDays');
    assert.deepEqual([max.value, max.default, max.min, max.max], [14, 14, 1, 30]);
    assert.ok(!list.some((x) => x.key === 'idPhotoRetentionDays' || x.key === 'contactDaysAfterClose'));
  });

  test('only an admin can change them, and only within the limits', async () => {
    assert.equal((await s.api('PUT', '/admin/settings', staff, { maxLoanDays: 7 })).status, 403);
    for (const bad of [{ maxLoanDays: 0 }, { maxLoanDays: 31 }, { maxLoanDays: 2.5 }, { idPhotoRetentionDays: 30 }, { nonsense: 1 }, { costLowMedium: 3, costHigh: 2 }]) {
      const r = await s.api('PUT', '/admin/settings', admin, bad);
      assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.json.code, 'bad_setting');
    }
    assert.equal(RULES.maxLoanDays, 14, 'nothing changed');
  });

  test('a change takes effect at once, everywhere, and is written to the audit log', async () => {
    const r = await s.api('PUT', '/admin/settings', admin, { maxLoanDays: 7, starterCredits: 5 });
    assert.equal(r.status, 200);
    assert.equal((await s.api('GET', '/meta', ana)).json.rules.maxLoanDays, 7);
    const long = await s.api('POST', '/requests', ana, { item_id: (await one("SELECT id FROM items WHERE title = 'Picnic mat'")).id, start_date: day(30), end_date: day(37) });
    assert.equal(long.json.code, 'too_long');
    const reg = await s.api('POST', '/auth/register', null, { name: 'Five Credits', email: 'five@hiraman.test', password: 'goodpass1', accept_privacy: true });
    await s.api('POST', '/me/id-consent', reg.json.token);
    await s.upload('/me/id-photo', reg.json.token, PNG, 'image/png', 'id.png');
    await s.api('POST', `/admin/users/${reg.json.user.id}/approve`, admin);
    assert.equal((await s.api('GET', '/me', reg.json.token)).json.credits, 5);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'rule_changed' AND target = 'maxLoanDays: 14 -> 7'"));
  });

  test('changes survive a restart, and an admin can go back to the default', async () => {
    Object.assign(RULES, RULE_DEFAULTS);
    await loadRuleSettings();
    assert.equal(RULES.maxLoanDays, 7);
    assert.equal((await s.api('PUT', '/admin/settings', admin, { maxLoanDays: null })).status, 200);
    assert.equal(RULES.maxLoanDays, 14);
    assert.equal((await s.api('GET', '/admin/rules', staff)).json.rules.maxLoanDays, 14);
  });
});
