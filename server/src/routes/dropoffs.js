// Drop-offs: residents declare items and get a code; staff check the code in, weigh and sort; admins review
// flags. The work is in src/dropoffs.js; these routes only check who is calling and pass the input on.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { q } from '../db.js';
import { wrap, notFound } from '../errors.js';
import { authRequired, requireResident, requireStaff, requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { ownPhoto } from '../uploads.js';
import { RULES } from '../rules.js';
import {
  declare, declarationView, myDeclarations, cancelDeclaration, myImpact, checkIn, staffDeclarationView, addItem,
  sortItem, tellResidentIfDone, staffHubIds, listFlags, decideFlag,
} from '../dropoffs.js';

const router = Router();

// R13: wrong codes are limited per staff member, so codes cannot be guessed. Codes that work do not count.
const checkinLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: RULES.codeCheckinsPer15Min,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    try {
      return `user:${jwt.verify(String(req.headers.authorization).slice(7), config.jwtSecret).id}`;
    } catch {
      return `ip:${ipKeyGenerator(req.ip)}`;
    }
  },
  handler: (_req, res) => res.status(429).json({ error: 'Too many wrong codes. Wait a few minutes, then try again.', code: 'too_many_codes' }),
});

// ---------- residents ----------

router.post('/declarations', authRequired, requireResident, wrap(async (req, res) => {
  const id = await declare(req.user, req.body || {});
  res.status(201).json(await declarationView(id));
}));

router.get('/declarations', authRequired, requireResident, wrap(async (req, res) => {
  res.json(await myDeclarations(req.user.id, req.query));
}));

router.get('/declarations/:id', authRequired, requireResident, wrap(async (req, res) => {
  const d = await declarationView(Number(req.params.id));
  // Someone else's drop-off answers "not found", never "forbidden", so ids cannot be probed.
  const [mine] = await q('SELECT id FROM declarations WHERE id = ? AND resident_id = ?', [req.params.id, req.user.id]);
  if (!d || !mine) throw notFound();
  res.json(d);
}));

router.delete('/declarations/:id', authRequired, requireResident, wrap(async (req, res) => {
  await cancelDeclaration(Number(req.params.id), req.user);
  res.json(await declarationView(Number(req.params.id)));
}));

router.get('/me/impact', authRequired, wrap(async (req, res) => res.json(await myImpact(req.user.id))));

// ---------- hub staff ----------

// The hubs this person works at (all active hubs for an admin).
router.get('/staff/hubs', authRequired, requireStaff, wrap(async (req, res) => {
  const rows = req.user.role === 'admin'
    ? await q("SELECT id, name, type, address FROM hubs WHERE status = 'active' ORDER BY name")
    : await q('SELECT h.id, h.name, h.type, h.address FROM hubs h JOIN hub_staff s ON s.hub_id = h.id WHERE s.user_id = ? ORDER BY h.name', [req.user.id]);
  res.json(rows);
}));

// Received drop-offs at my hubs that still have items to sort.
router.get('/staff/queue', authRequired, requireStaff, wrap(async (req, res) => {
  const hubs = req.user.role === 'admin' ? null : await staffHubIds(req.user.id);
  if (hubs && !hubs.length) return res.json([]);
  const rows = await q(
    `SELECT d.id, d.received_at, h.name AS hub_name, u.name AS resident_name,
            SUM(i.state = 'received') AS to_sort, COUNT(i.id) AS items
       FROM declarations d JOIN hubs h ON h.id = d.hub_id JOIN users u ON u.id = d.resident_id JOIN items i ON i.declaration_id = d.id
      WHERE d.status = 'received' ${hubs ? `AND d.hub_id IN (${hubs.map(() => '?').join(',')})` : ''}
      GROUP BY d.id HAVING to_sort > 0 ORDER BY d.received_at`, hubs || []);
  res.json(rows.map((r) => ({ ...r, to_sort: Number(r.to_sort), items: Number(r.items) })));
}));

router.post('/staff/checkin', authRequired, requireStaff, checkinLimit, wrap(async (req, res) => {
  const id = await checkIn(req.body?.code, req.user);
  res.json(await declarationView(id, { forStaff: true }));
}));

router.get('/staff/declarations/:id', authRequired, requireStaff, wrap(async (req, res) => {
  res.json(await staffDeclarationView(Number(req.params.id), req.user));
}));

router.post('/staff/declarations/:id/items', authRequired, requireStaff, wrap(async (req, res) => {
  await addItem(Number(req.params.id), req.user, req.body || {});
  res.status(201).json(await declarationView(Number(req.params.id), { forStaff: true }));
}));

router.post('/staff/items/:id/sort', authRequired, requireStaff, wrap(async (req, res) => {
  const result = await sortItem(Number(req.params.id), req.user, req.body || {}, new Date(), { photo: ownPhoto });
  const [{ declaration_id: declId }] = await q('SELECT declaration_id FROM items WHERE id = ?', [result.item_id]);
  await tellResidentIfDone(declId);
  res.json(result);
}));

// ---------- admins: review flags (R7) ----------

router.get('/admin/flags', authRequired, requireAdmin, wrap(async (req, res) => res.json(await listFlags(req.query.status))));

router.post('/admin/flags/:id/:decision', authRequired, requireAdmin, wrap(async (req, res) => {
  await decideFlag(Number(req.params.id), req.user, req.params.decision);
  res.json({ ok: true });
}));

export default router;
