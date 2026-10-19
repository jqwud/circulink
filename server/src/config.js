import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'hiraman',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(here, '..', 'uploads')),
};

if (config.jwtSecret === 'dev-only-change-me') {
  console.warn('[hiraman] JWT_SECRET is not set. Fine on localhost, but set one in .env before sharing the server.');
}
