// One rule for dates: Philippine time (UTC+8) everywhere, whatever time zone the computer is set to.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { todayPH, phTimestamp } from '../src/db.js';

const dbModule = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db.js')).href;

describe('Philippine dates near midnight', () => {
  test('just before and just after midnight in Manila', () => {
    assert.equal(todayPH(new Date('2026-10-23T15:59:59Z')), '2026-10-23');  // 23:59:59 in Manila
    assert.equal(todayPH(new Date('2026-10-23T16:00:00Z')), '2026-10-24');  // 00:00 in Manila
    assert.equal(phTimestamp(new Date('2026-10-23T16:30:00Z')), '2026-10-24 00:30:00');
  });

  test('the computer\'s own time zone makes no difference', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      const out = execFileSync(process.execPath, ['--input-type=module', '-e',
        `const { todayPH, pool } = await import('${dbModule}'); console.log(todayPH(new Date('2026-10-23T16:30:00Z'))); await pool.end();`],
      { env: { ...process.env, TZ: tz } }).toString().trim();
      assert.equal(out, '2026-10-24', tz);
    }
  });
});
