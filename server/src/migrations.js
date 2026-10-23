// Database migrations: numbered SQL files in database/migrations, applied in order on top of schema.sql.
// Each file has an "-- up" part (the change) and a "-- down" part (how to undo it).
// Applied migrations are recorded in the schema_migrations table, so running again does nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'migrations');

// Every migration file, in order, split into its up and down statements.
export function readMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort().map((file) => {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const up = text.indexOf('-- up');
    const down = text.indexOf('-- down');
    if (up < 0 || down < up) throw new Error(`${file} needs an "-- up" part followed by a "-- down" part.`);
    return { id: file.replace(/\.sql$/, ''), up: statements(text.slice(up, down)), down: statements(text.slice(down)) };
  });
}

// Splits SQL into statements at semicolons that end a line, ignoring comment lines.
function statements(sql) {
  return sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
    .split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
}

async function connect() {
  const conn = await mysql.createConnection({ ...config.db });
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
  return conn;
}

async function appliedIds(conn) {
  const [rows] = await conn.query('SELECT id FROM schema_migrations ORDER BY id');
  return rows.map((r) => r.id);
}

export async function status() {
  const conn = await connect();
  try {
    const applied = await appliedIds(conn);
    return readMigrations().map((m) => ({ id: m.id, applied: applied.includes(m.id) }));
  } finally {
    await conn.end();
  }
}

export async function pendingMigrations() {
  return (await status()).filter((m) => !m.applied).map((m) => m.id);
}

async function run(conn, id, list) {
  for (const sql of list) {
    try {
      await conn.query(sql);
    } catch (e) {
      throw new Error(`${id} failed at:\n${sql}\n${e.message}`, { cause: e });
    }
  }
}

// Applies every migration not yet applied. Returns the ids it applied.
export async function migrateUp({ log = () => {} } = {}) {
  const conn = await connect();
  try {
    const applied = await appliedIds(conn);
    const done = [];
    for (const m of readMigrations()) {
      if (applied.includes(m.id)) continue;
      log(`applying ${m.id}`);
      await run(conn, m.id, m.up);
      await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
      done.push(m.id);
    }
    return done;
  } finally {
    await conn.end();
  }
}

// Undoes the most recently applied migration. Returns its id, or null if none were applied.
export async function migrateDown({ log = () => {} } = {}) {
  const conn = await connect();
  try {
    const last = (await appliedIds(conn)).pop();
    if (!last) return null;
    const m = readMigrations().find((x) => x.id === last);
    if (!m) throw new Error(`Migration file for ${last} is missing.`);
    log(`undoing ${m.id}`);
    await run(conn, m.id, m.down);
    await conn.query('DELETE FROM schema_migrations WHERE id = ?', [m.id]);
    return m.id;
  } finally {
    await conn.end();
  }
}
