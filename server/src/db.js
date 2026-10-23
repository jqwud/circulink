import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: config.dbPoolSize,
  dateStrings: true,        // dates come back as 'YYYY-MM-DD' strings, no timezone surprises
  charset: 'utf8mb4',
});

// Philippine time for NOW(), CURRENT_TIMESTAMP, etc., whatever the server's own timezone is.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+08:00'"));

export const q = async (sql, params = []) => (await pool.query(sql, params))[0];
export const one = async (sql, params = []) => (await q(sql, params))[0] || null;

export async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Paging for long lists: ?limit= (1 to max, default `size`) and ?offset= (0 or more). Lists stay plain arrays;
// a page shorter than the limit is the last one. Every paged query also sorts by id, so pages never overlap.
export function pageOf(query, size = 50, max = 100) {
  const limit = Math.min(max, Math.max(1, Number.parseInt(query?.limit, 10) || size));
  const offset = Math.max(0, Number.parseInt(query?.offset, 10) || 0);
  return `LIMIT ${limit} OFFSET ${offset}`;
}

// A search term for LIKE: % and _ are matched as themselves, not as wildcards.
export const likeText = (s) => `%${String(s).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// The puroks residents can choose from (managed by staff in the portal).
export const purokNames = async () => (await q('SELECT name FROM puroks ORDER BY CHAR_LENGTH(name), name')).map((r) => r.name);

// Today's date (YYYY-MM-DD) in Philippine time. Jobs pass their own "now" so tests can move the clock.
export const todayPH = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// A moment as 'YYYY-MM-DD HH:MM:SS' in Philippine time: the way the database stores and returns timestamps.
export const phTimestamp = (now = new Date()) => now.toLocaleString('sv-SE', { timeZone: 'Asia/Manila' });
