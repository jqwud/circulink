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

// A declaration with one item, to test the item rules against.
async function someItem() {
  const ana = (await one("SELECT id FROM users WHERE email = 'ana@circulink.test'")).id;
  const hub = (await one('SELECT id FROM hubs LIMIT 1')).id;
  const cat = (await one("SELECT id FROM categories WHERE slug = 'clothes'")).id;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
  const [d] = await pool.query('INSERT INTO declarations (resident_id, hub_id, code, expires_at) VALUES (?,?,?, NOW() + INTERVAL 7 DAY)', [ana, hub, code]);
  const [i] = await pool.query('INSERT INTO items (declaration_id, category_id) VALUES (?,?)', [d.insertId, cat]);
  return { ana, hub, cat, declaration: d.insertId, item: i.insertId };
}

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

describe('guard rails in the database', () => {
  test('an item weight must be above 0 and at most 500 kg', async () => {
    const { item } = await someItem();
    await rejects('UPDATE items SET weight_kg = 0 WHERE id = ?', [item], 'ER_CHECK_CONSTRAINT_VIOLATED');
    await rejects('UPDATE items SET weight_kg = 501 WHERE id = ?', [item], 'ER_CHECK_CONSTRAINT_VIOLATED');
    await q('UPDATE items SET weight_kg = 2.5 WHERE id = ?', [item]);
  });
  test('points are never negative, and an item earns points only once', async () => {
    const { ana, item } = await someItem();
    await rejects("INSERT INTO points_ledger (user_id, item_id, points, reason) VALUES (?,?,-5,'x')", [ana, item], 'ER_CHECK_CONSTRAINT_VIOLATED');
    await q("INSERT INTO points_ledger (user_id, item_id, points, reason) VALUES (?,?,10,'x')", [ana, item]);
    await rejects("INSERT INTO points_ledger (user_id, item_id, points, reason) VALUES (?,?,10,'again')", [ana, item], 'ER_DUP_ENTRY');
  });
  test('an item goes to at most one partner release and one recycle batch', async () => {
    const { item, hub } = await someItem();
    const partner = (await one('SELECT id FROM partners LIMIT 1')).id;
    const recycler = (await one('SELECT id FROM recyclers LIMIT 1')).id;
    const [r1] = await pool.query('INSERT INTO releases (partner_id, hub_id) VALUES (?,?)', [partner, hub]);
    const [r2] = await pool.query('INSERT INTO releases (partner_id, hub_id) VALUES (?,?)', [partner, hub]);
    await q('INSERT INTO release_items (release_id, item_id) VALUES (?,?)', [r1.insertId, item]);
    await rejects('INSERT INTO release_items (release_id, item_id) VALUES (?,?)', [r2.insertId, item], 'ER_DUP_ENTRY');
    const [b1] = await pool.query('INSERT INTO recycle_batches (hub_id, recycler_id) VALUES (?,?)', [hub, recycler]);
    const [b2] = await pool.query('INSERT INTO recycle_batches (hub_id, recycler_id) VALUES (?,?)', [hub, recycler]);
    await q('INSERT INTO recycle_batch_items (batch_id, item_id) VALUES (?,?)', [b1.insertId, item]);
    await rejects('INSERT INTO recycle_batch_items (batch_id, item_id) VALUES (?,?)', [b2.insertId, item], 'ER_DUP_ENTRY');
  });
  test('rows must point at things that exist', async () => {
    await rejects("INSERT INTO audit_log (actor_id, action) VALUES (999999, 'x')", [], 'ER_NO_REFERENCED_ROW_2');
    await rejects('INSERT INTO hub_staff (hub_id, user_id) VALUES (999999, 1)', [], 'ER_NO_REFERENCED_ROW_2');
  });
});

describe('undo', () => {
  test('every migration can be undone in reverse order and applied again', async () => {
    const all = readMigrations().map((m) => m.id);
    const undone = [];
    for (let i = 0; i < all.length; i++) undone.push(await migrateDown());
    assert.deepEqual(undone, [...all].reverse());
    assert.equal(await migrateDown(), null, 'nothing left to undo');
    assert.equal(await one("SHOW TABLES LIKE 'hubs'"), null, 'the hub tables are gone');
    assert.deepEqual(await migrateUp(), all);
    assert.ok((await one('SELECT COUNT(*) AS n FROM categories')).n > 0, 'the starting categories are back');
    seedTestDatabase();
  });
});

describe('backup and restore', () => {
  test('restoring a backup brings back the exact data and the photos', async () => {
    const photo = path.join(process.env.UPLOAD_DIR, 'public', 'aaaaaaaaaaaaaaaaaaaaaaaa.png');
    fs.mkdirSync(path.dirname(photo), { recursive: true });
    fs.writeFileSync(photo, 'photo bytes');
    const count = async (t) => (await one(`SELECT COUNT(*) n FROM ${t}`)).n;
    const before = { users: await count('users'), hubs: await count('hubs'), partners: await count('partners') };

    const b = backup();
    assert.ok(fs.existsSync(path.join(b.dir, 'database.sql')));
    assert.equal(b.uploads, 1);

    // Damage the data and lose the photo.
    await q('DELETE FROM partners');
    await q("UPDATE hubs SET status = 'closed'");
    fs.rmSync(photo);

    restore(b.dir);
    assert.equal(await count('users'), before.users);
    assert.equal(await count('hubs'), before.hubs);
    assert.equal(await count('partners'), before.partners);
    assert.equal((await one("SELECT COUNT(*) n FROM hubs WHERE status = 'closed'")).n, 0);
    assert.equal(fs.readFileSync(photo, 'utf8'), 'photo bytes');
    assert.deepEqual(await pendingMigrations(), [], 'the migration record is restored too');
  });
});
