import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// In production a real secret is required: anyone who knows the secret can make login tokens.
const isProduction = process.env.NODE_ENV === 'production';
const secret = process.env.JWT_SECRET || '';
if (isProduction && (secret.length < 16 || secret === 'change-this-to-a-long-random-string')) {
  throw new Error('JWT_SECRET must be set to a long random value (16 or more characters) when NODE_ENV=production.');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    // In the containers the password is named once, as MYSQL_PASSWORD (docker.env).
    password: process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
    database: process.env.DB_NAME || 'hiraman',
  },
  jwtSecret: secret || 'dev-only-change-me',
  // Web pages on other addresses that may call the API: a comma-separated list, or * for any.
  // Empty means this server's own pages plus localhost (development). The phone app needs no entry.
  corsOrigin: process.env.CORS_ORIGIN || '',
  // One log line per API request (LOG_REQUESTS=0 turns it off; the tests do).
  logRequests: process.env.LOG_REQUESTS !== '0',
  // Database connections the API keeps open (DB_POOL_SIZE). 10 serves a barangay; raise it for heavy use.
  dbPoolSize: Number(process.env.DB_POOL_SIZE) || 10,
  // Photo uploads: the largest file accepted.
  uploadMaxBytes: 5 * 1024 * 1024,
  // Login and sign-up from one network: this many tries per 15 minutes.
  authTriesPer15Min: 60,
  // Page sizes for long lists (?limit=): default and maximum, for residents and for the portal.
  pages: { residentDefault: 50, residentMax: 100, staffDefault: 100, staffMax: 200 },
  // Changes (POST, PATCH, DELETE) one person may make per 15 minutes.
  writeLimit: Number(process.env.WRITE_LIMIT) || 300,
  // Shown to borrowers of items the barangay handles. Optional.
  hallPhone: process.env.HALL_PHONE || null,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(here, '..', 'uploads')),
};

if (config.jwtSecret === 'dev-only-change-me') {
  console.warn('[hiraman] JWT_SECRET is not set. Fine on localhost, but set one in .env before sharing the server.');
}
