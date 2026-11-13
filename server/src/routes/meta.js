// Reference lists every screen needs (categories, hubs, rule numbers) and each person's notifications.
import { Router } from 'express';
import { q, one, pageOf } from '../db.js';
import { wrap, notFound } from '../errors.js';
import { authRequired } from '../auth.js';
import { config } from '../config.js';
import { RULES, OUTCOMES, OUTCOME_MULTIPLIER, BADGES } from '../rules.js';

const router = Router();

const categories = () => q(
  `SELECT id, slug, name_en, name_fil, rate_per_kg, co2_per_kg, hazardous, food
     FROM categories WHERE active = 1 ORDER BY name_en`);
const activeHubs = () => q("SELECT id, name, type, address, hours, photo_url FROM hubs WHERE status = 'active' ORDER BY name");

// Hubs are public, so people can find a drop-off point before they sign up.
router.get('/hubs', wrap(async (_req, res) => res.json(await activeHubs())));

router.get('/meta', authRequired, wrap(async (_req, res) => {
  res.json({
    categories: (await categories()).map((c) => ({
      ...c, rate_per_kg: Number(c.rate_per_kg), co2_per_kg: Number(c.co2_per_kg), hazardous: !!c.hazardous, food: !!c.food,
    })),
    hubs: await activeHubs(),
    outcomes: OUTCOMES.map((key) => ({ key, multiplier: OUTCOME_MULTIPLIER[key] })),
    badges: BADGES,
    rules: RULES,
  });
}));

router.get('/notifications', authRequired, wrap(async (req, res) => {
  const { residentDefault, residentMax } = config.pages;
  const rows = await q(
    `SELECT id, type, title, body, params, ref_id, read_at, created_at FROM notifications WHERE user_id = ?
      ORDER BY id DESC ${pageOf(req.query, residentDefault, residentMax)}`, [req.user.id]);
  res.json(rows.map((n) => ({ ...n, params: typeof n.params === 'string' ? JSON.parse(n.params) : n.params })));
}));

router.post('/notifications/read-all', authRequired, wrap(async (req, res) => {
  await q('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

router.post('/notifications/:id/read', authRequired, wrap(async (req, res) => {
  const n = await one('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!n) throw notFound();
  await q('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ?', [n.id]);
  res.json({ ok: true });
}));

export default router;
