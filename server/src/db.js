import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
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

// Today's date (YYYY-MM-DD) in Philippine time. Jobs pass their own "now" so tests can move the clock.
export const todayPH = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// A moment as 'YYYY-MM-DD HH:MM:SS' in Philippine time: the way the database stores and returns timestamps.
export const phTimestamp = (now = new Date()) => now.toLocaleString('sv-SE', { timeZone: 'Asia/Manila' });
