import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

// options.checkDb lets tests simulate a database that is down.
export function createApp(options = {}) {
  const app = express();
  const checkDb = options.checkDb || (() => pool.query('SELECT 1'));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '200kb' }));

  // Public item photos only. ID photos live in uploads/private and are never served here.
  app.use('/uploads/public', express.static(path.join(config.uploadDir, 'public'), { maxAge: '7d' }));

  // Healthy means the API can also reach the database (checked within 3 seconds).
  app.get('/api/health', async (_req, res) => {
    try {
      await Promise.race([checkDb(), new Promise((_, fail) => setTimeout(() => fail(new Error('timeout')), 3000))]);
      res.json({ ok: true, app: 'Hiraman API', db: 'ok' });
    } catch {
      res.status(503).json({ ok: false, app: 'Hiraman API', db: 'down' });
    }
  });

  const api = express.Router();
  api.use(authRoutes);
  api.use(itemRoutes);
  api.use(requestRoutes);
  api.use(communityRoutes);
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
