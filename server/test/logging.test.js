// Logs that help without leaking: one line per request (no query strings), a request id the person can quote,
// and unexpected errors logged as a short line with personal values hidden.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool } from '../src/db.js';
import { errorMiddleware, safeErrorLine } from '../src/errors.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let ana;
before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer({ logRequests: true });
  ana = await s.login('ana');
});
after(async () => { await s.close(); await pool.end(); });

// Collects what the server prints while `fn` runs.
async function capture(fn) {
  const lines = [];
  const [log, err] = [console.log, console.error];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try { await fn(); await new Promise((r) => setTimeout(r, 50)); } finally { [console.log, console.error] = [log, err]; }
  return lines;
}

describe('request log', () => {
  test('every answer carries a request id', async () => {
    const r = await s.api('GET', '/me', ana);
    assert.match(r.headers.get('x-request-id'), /^[0-9a-f]{8}$/);
  });

  test('one line per request: method, path, status, time and user, but never the query string', async () => {
    const lines = await capture(() => s.api('GET', `/items?q=${encodeURIComponent('secret.search@example.com')}`, ana));
    const line = lines.find((l) => l.includes('GET /api/items'));
    assert.ok(line, lines.join('\n'));
    assert.match(line, / 200 \d+ms user=\d+$/);
    assert.ok(!line.includes('secret'), 'no search words or emails in the log');
  });
});

describe('unexpected errors', () => {
  const fakeRes = () => {
    const out = {};
    out.status = (code) => { out.code = code; return out; };
    out.json = (body) => { out.body = body; return out; };
    return out;
  };

  test('the person gets a request id to quote; the log gets a short line without personal values', async () => {
    const err = Object.assign(new Error("Duplicate entry 'ana@hiraman.test' for key 'users.email' (phone 09170000001)"), { code: 'ER_SOMETHING' });
    const res = fakeRes();
    const lines = await capture(() => errorMiddleware(err, { id: 'abcd1234' }, res, () => {}));
    assert.equal(res.code, 500);
    assert.equal(res.body.request_id, 'abcd1234');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /abcd1234 ER_SOMETHING/);
    assert.ok(!lines[0].includes('ana@hiraman.test'), lines[0]);
    assert.ok(!lines[0].includes('09170000001'), lines[0]);
    assert.ok(lines[0].includes("key 'users.email'"), 'the key name stays, it helps debugging');
  });

  test('a long message is cut short', () => {
    assert.ok(safeErrorLine(new Error('x'.repeat(5000)), 'id').length < 500);
  });
});
