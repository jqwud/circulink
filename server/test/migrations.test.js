// Migrations and backups: the guard rails hold, migrations undo cleanly, and a backup restores exactly.
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { migrateUp, migrateDown, pendingMigrations, readMigrations, isFreshInstall } from '../src/migrations.js';
import { backup, restore } from '../src/backup.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';

const rejects = async (sql, params, code) => {
  await assert.rejects(q(sql, params), (e) => {
    assert.equal(e.code, code, `${sql} -> ${e.code}`);
    return true;
  });
};
const someUser = async () => (await one('SELECT id FROM users ORDER BY id LIMIT 1')).id;

before(async () => { await resetTestDatabase(); seedTestDatabase(); });
after(async () => { await pool.end(); });

describe('migration runner', () => {
  test('a fresh test database has every migration applied', async () => {
    assert.deepEqual(await pendingMigrations(), []);
    assert.ok(readMigrations().length >= 1);
  });
  test('running it again changes nothing', async () => {
    assert.deepEqual(await migrateUp(), []);
  });
  test('a database with migrations or accounts is never treated as a fresh install (so it is backed up first)', async () => {
    assert.equal(await isFreshInstall(), false);
  });
});

describe('guard rails (001)', () => {
  test('a credit balance cannot go below zero', async () => {
    await rejects('UPDATE users SET credits = -1 WHERE id = ?', [await someUser()], 'ER_CHECK_CONSTRAINT_VIOLATED');
  });
  test('a request cannot end before it starts', async () => {
    const r = await one('SELECT id FROM requests LIMIT 1');
    await rejects("UPDATE requests SET end_date = '2020-01-01', start_date = '2020-01-05' WHERE id = ?", [r.id], 'ER_CHECK_CONSTRAINT_VIOLATED');
  });
  test('a rating must be 1 to 5 stars', async () => {
    const r = await one('SELECT id, borrower_id FROM requests LIMIT 1');
    await rejects('INSERT INTO ratings (request_id, rater_id, ratee_id, stars) VALUES (?,?,?,6)', [r.id, r.borrower_id, r.borrower_id], 'ER_CHECK_CONSTRAINT_VIOLATED');
  });
  test('ledger rows, ratings and audit rows must point at things that exist', async () => {
    const u = await someUser();
    await rejects("INSERT INTO credit_ledger (user_id, request_id, amount, reason) VALUES (?, 999999, 1, 'x')", [u], 'ER_NO_REFERENCED_ROW_2');
    const r = await one('SELECT id FROM requests LIMIT 1');
    await rejects('INSERT INTO ratings (request_id, rater_id, ratee_id, stars) VALUES (?, 999999, ?, 5)', [r.id, u], 'ER_NO_REFERENCED_ROW_2');
    await rejects("INSERT INTO audit_log (actor_id, action) VALUES (999999, 'x')", [], 'ER_NO_REFERENCED_ROW_2');
  });
});

describe('undo', () => {
  test('every migration can be undone in reverse order and applied again', async () => {
    const u = await someUser();
    const all = readMigrations().map((m) => m.id);
    const undone = [];
    for (let i = 0; i < all.length; i++) undone.push(await migrateDown());
    assert.deepEqual(undone, [...all].reverse());
    assert.equal(await migrateDown(), null, 'nothing left to undo');
    await q('UPDATE users SET credits = -1 WHERE id = ?', [u]);   // allowed without the guard rails
    await q('UPDATE users SET credits = 0 WHERE id = ?', [u]);
    assert.deepEqual(await migrateUp(), all);
    await rejects('UPDATE users SET credits = -1 WHERE id = ?', [u], 'ER_CHECK_CONSTRAINT_VIOLATED');
  });
});

describe('backup and restore', () => {
  test('restoring a backup brings back the exact data and the photos', async () => {
    const photo = path.join(process.env.UPLOAD_DIR, 'public', 'aaaaaaaaaaaaaaaaaaaaaaaa.png');
    fs.mkdirSync(path.dirname(photo), { recursive: true });
    fs.writeFileSync(photo, 'photo bytes');
    const count = async (t) => (await one(`SELECT COUNT(*) n FROM ${t}`)).n;
    const before = { users: await count('users'), requests: await count('requests'), wanted: await count('wanted_posts'), credits: (await one('SELECT SUM(credits) s FROM users')).s };

    const b = backup();
    assert.ok(fs.existsSync(path.join(b.dir, 'database.sql')));
    assert.equal(b.uploads, 1);

    // Damage the data and lose the photo.
    await q('DELETE FROM wanted_posts');
    await q('UPDATE users SET credits = 0');
    fs.rmSync(photo);

    restore(b.dir);
    assert.equal(await count('users'), before.users);
    assert.equal(await count('requests'), before.requests);
    assert.equal(await count('wanted_posts'), before.wanted);
    assert.equal((await one('SELECT SUM(credits) s FROM users')).s, before.credits);
    assert.equal(fs.readFileSync(photo, 'utf8'), 'photo bytes');
    assert.deepEqual(await pendingMigrations(), [], 'the migration record is restored too');
  });
});
