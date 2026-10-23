// Long lists come in pages: ?limit= and ?offset=. Lists stay plain arrays; a page shorter than the limit is the last.
// Pages never overlap or skip an item, even when many rows share the same date.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let ana; let staff; let admin;
before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, staff, admin] = await Promise.all(['ana', 'staff', 'admin'].map((w) => s.login(w)));
});
after(async () => { await s.close(); await pool.end(); });

// Walks a list page by page and checks the pages add up to the whole list exactly once.
async function walk(token, path, size) {
  const all = (await s.api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=500`, token)).json.map((r) => r.id);
  const seen = [];
  for (let offset = 0; offset < all.length + size; offset += size) {
    const page = (await s.api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=${size}&offset=${offset}`, token)).json;
    assert.ok(page.length <= size);
    seen.push(...page.map((r) => r.id));
    if (page.length < size) break;
  }
  return { all, seen };
}

describe('paging', () => {
  for (const [who, path] of [['ana', '/items'], ['staff', '/admin/items'], ['staff', '/admin/users'], ['staff', '/admin/requests'], ['admin', '/admin/audit'], ['ana', '/notifications']]) {
    test(`${path} pages add up to the whole list, with no repeats`, async () => {
      const token = { ana, staff, admin }[who];
      const { all, seen } = await walk(token, path, 4);
      assert.deepEqual(seen, all);
      assert.equal(new Set(seen).size, seen.length);
    });
  }

  test('the browse list has a sensible default and a maximum page size', async () => {
    assert.equal((await s.api('GET', '/items?limit=2', ana)).json.length, 2);
    assert.ok((await s.api('GET', '/items?limit=99999', ana)).json.length <= 100);
    assert.ok((await s.api('GET', '/items?limit=abc&offset=-5', ana)).json.length > 0, 'nonsense values fall back to the defaults');
  });
});
