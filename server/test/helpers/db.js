// Builds a fresh test database from database/schema.sql, then loads the demo data into it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../../src/config.js';
import { migrateUp } from '../../src/migrations.js';

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemaFile = path.join(serverRoot, '..', 'database', 'schema.sql');

const notReady = (e) => new Error(
  `The test database "${config.db.database}" is not ready (${e.code || e.message}).\n`
  + '  Create it once as MySQL root:  mysql -u root -p -e "source database/create-test-db.sql"\n'
  + '  See docs/SETUP.md, "Running the automated tests".');

// Drops every table in the test database, recreates them from schema.sql, then applies every migration.
export async function resetTestDatabase() {
  if (!config.db.database.endsWith('_test')) throw new Error(`Refusing to reset "${config.db.database}".`);
  let conn;
  try {
    conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
  } catch (e) {
    throw notReady(e);
  }
  try {
    const [tables] = await conn.query('SHOW TABLES');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of tables) await conn.query(`DROP TABLE \`${Object.values(row)[0]}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    // schema.sql creates the real "hiraman" database; keep only the table definitions and reference data.
    const sql = fs.readFileSync(schemaFile, 'utf8').replace(/^\s*(DROP DATABASE|CREATE DATABASE|USE)\b[^;]*;/gim, '');
    await conn.query(sql);
  } finally {
    await conn.end();
  }
  await migrateUp();
}

// Loads the demo residents, items and loans. The child process inherits DB_NAME from helpers/env.js.
export function seedTestDatabase() {
  execFileSync('node', ['seed.js'], { cwd: serverRoot, env: process.env, stdio: 'ignore' });
}
