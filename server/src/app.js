import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorMiddleware } from './errors.js';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import requestRoutes from './routes/requests.js';
import communityRoutes from './routes/community.js';
import adminRoutes from './routes/admin.js';
import donationRoutes from './routes/donations.js';
import rewardRoutes from './routes/rewards.js';

// The API's version (package.json), shown by /api/health so staff can tell which release is running.
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// May a web page on `origin` call the API? No origin: the phone app or a page of this server.
// `setting` is CORS_ORIGIN: a comma-separated list, * for any, or empty for localhost only.
export function corsAllowed(origin, setting = config.corsOrigin) {
  if (!origin) return true;
  const list = String(setting || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (list.includes('*')) return true;
  if (list.length) return list.includes(origin);
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// options.checkDb lets tests simulate a database that is down; options.writeLimit sets the per-person limit.
export function createApp(options = {}) {
  const app = express();
  const checkDb = options.checkDb || (() => pool.query('SELECT 1'));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: (origin, done) => done(null, corsAllowed(origin)) }));
  app.use(express.json({ limit: '200kb' }));

  // Every API request gets a short id, sent back as X-Request-Id and shown with server errors, so a resident
  // can quote it. One log line per request: time, id, method, path (never the query string, which can hold
  // search words or emails), status, duration and the user's id.
  const logRequests = options.logRequests ?? config.logRequests;
  app.use('/api', (req, res, next) => {
    req.id = crypto.randomBytes(4).toString('hex');
    res.setHeader('X-Request-Id', req.id);
    if (logRequests) {
      const started = process.hrtime.bigint();
      const where = req.originalUrl.split('?')[0];
      res.on('finish', () => {
        const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
        console.log(`${new Date().toISOString()} ${req.id} ${req.method} ${where} ${res.statusCode} ${ms}ms${req.user ? ` user=${req.user.id}` : ''}`);
      });
    }
    next();
  });

  // Each logged-in person may make a limited number of changes (POST, PATCH, DELETE) per 15 minutes, so one
  // account cannot flood others with requests, messages or uploads. Reading is never limited. Login and
  // sign-up have their own limits (routes/auth.js).
  const writeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.writeLimit ?? config.writeLimit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.headers.authorization,
    keyGenerator: (req) => {
      try {
        return `user:${jwt.verify(String(req.headers.authorization).slice(7), config.jwtSecret).id}`;
      } catch {
        return `ip:${ipKeyGenerator(req.ip)}`;
      }
    },
    handler: (_req, res) => res.status(429).json({ error: 'Too many changes in a short time. Please wait a few minutes.', code: 'too_many_requests' }),
  });
  app.use('/api', writeLimit);

  // Public item photos only. ID photos live in uploads/private and are never served here.
  app.use('/uploads/public', express.static(path.join(config.uploadDir, 'public'), { maxAge: '7d' }));

  // Healthy means the API can also reach the database (checked within 3 seconds).
  app.get('/api/health', async (_req, res) => {
    try {
      await Promise.race([checkDb(), new Promise((_, fail) => setTimeout(() => fail(new Error('timeout')), 3000))]);
      res.json({ ok: true, app: 'Hiraman API', version: VERSION, db: 'ok' });
    } catch {
      res.status(503).json({ ok: false, app: 'Hiraman API', version: VERSION, db: 'down' });
    }
  });

  const api = express.Router();
  api.use(authRoutes);
  api.use(itemRoutes);
  api.use(requestRoutes);
  api.use(communityRoutes);
  api.use(donationRoutes);
  api.use(rewardRoutes);
  api.use(adminRoutes);
  app.use('/api', api);

  // If the portal has been built (npm run build in /portal), serve it from the same address as the API.
  const portalDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'portal', 'dist');
  if (fs.existsSync(path.join(portalDist, 'index.html'))) {
    app.use(express.static(portalDist));
    app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(portalDist, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found', code: 'not_found' }));
  app.use(errorMiddleware);
  return app;
}
