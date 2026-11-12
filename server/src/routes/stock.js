// Stock, releases to partner organizations, the repair queue and recycle batches. The work is in
// src/stock.js; these routes only check who is calling and pass the input on.
import { Router } from 'express';
import { wrap, notFound, forbidden } from '../errors.js';
import { authRequired, requireStaff } from '../auth.js';
import {
  partnerOf, availableStock, requestRelease, releaseView, myReleases, cancelRelease, confirmPickup, staffStock, staffReleases,
  handOver, declineRelease, moveItem, recyclers, createBatch, sendBatch, batches,
} from '../stock.js';

const router = Router();

// Partners only, and only while their organization is approved (R2).
const requireApprovedPartner = wrap(async (req, _res, next) => {
  if (req.user.role !== 'partner') throw forbidden('Partner organizations only.', 'partner_only');
  req.partner = await partnerOf(req.user);
  next();
});

// ---------- partner organizations ----------

router.get('/stock', authRequired, requireApprovedPartner, wrap(async (req, res) => {
  res.json(await availableStock({ hubId: Number(req.query.hub_id) || null, categoryId: Number(req.query.category_id) || null }));
}));

router.post('/releases', authRequired, requireApprovedPartner, wrap(async (req, res) => {
  const id = await requestRelease(req.user, req.body || {});
  res.status(201).json(await releaseView(id));
}));

// A partner whose approval was paused can still see its history.
router.get('/releases', authRequired, wrap(async (req, res) => {
  if (req.user.role !== 'partner') throw forbidden('Partner organizations only.', 'partner_only');
  res.json(await myReleases(req.user));
}));

router.delete('/releases/:id', authRequired, wrap(async (req, res) => {
  await cancelRelease(Number(req.params.id), req.user);
  res.json(await releaseView(Number(req.params.id)));
}));

router.post('/releases/:id/picked-up', authRequired, wrap(async (req, res) => {
  await confirmPickup(Number(req.params.id), req.user);
  res.json(await releaseView(Number(req.params.id)));
}));

// ---------- hub staff ----------

router.get('/staff/stock', authRequired, requireStaff, wrap(async (req, res) => res.json(await staffStock(req.user))));

router.get('/staff/releases', authRequired, requireStaff, wrap(async (req, res) => res.json(await staffReleases(req.user, req.query.status))));

router.post('/staff/releases/:id/hand-over', authRequired, requireStaff, wrap(async (req, res) => {
  await handOver(Number(req.params.id), req.user);
  res.json(await releaseView(Number(req.params.id)));
}));

router.post('/staff/releases/:id/decline', authRequired, requireStaff, wrap(async (req, res) => {
  await declineRelease(Number(req.params.id), req.user, req.body?.reason);
  res.json(await releaseView(Number(req.params.id)));
}));

router.post('/staff/items/:id/move', authRequired, requireStaff, wrap(async (req, res) => {
  res.json(await moveItem(Number(req.params.id), req.user, String(req.body?.to || '')));
}));

router.get('/staff/recyclers', authRequired, requireStaff, wrap(async (_req, res) => res.json(await recyclers())));

router.get('/staff/recycle-batches', authRequired, requireStaff, wrap(async (req, res) => res.json(await batches(req.user))));

router.post('/staff/recycle-batches', authRequired, requireStaff, wrap(async (req, res) => {
  const id = await createBatch(req.user, req.body || {});
  const b = (await batches(req.user)).find((x) => x.id === id);
  if (!b) throw notFound();
  res.status(201).json(b);
}));

router.post('/staff/recycle-batches/:id/send', authRequired, requireStaff, wrap(async (req, res) => {
  await sendBatch(Number(req.params.id), req.user);
  res.json((await batches(req.user)).find((x) => x.id === Number(req.params.id)));
}));

export default router;
