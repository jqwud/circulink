// Admin pages of the portal: accounts, partner approval, hubs, recyclers, categories and the audit log.
// Flag review lives with the drop-offs (routes/dropoffs.js). The work is in src/admin.js.
import { Router } from 'express';
import { wrap } from '../errors.js';
import { authRequired, requireAdmin } from '../auth.js';
import {
  listUsers, createAccount, setSuspended, resetPassword, setStaffHubs, deleteAccount, listPartners, setPartnerStatus, listHubs,
  createHub, updateHub, listRecyclers, saveRecycler, listCategories, saveCategory, auditLog,
} from '../admin.js';

const router = Router();
const admin = [authRequired, requireAdmin];
const id = (req) => Number(req.params.id);

router.get('/admin/users', ...admin, wrap(async (req, res) => res.json(await listUsers({ role: req.query.role, search: req.query.q }))));
router.post('/admin/users', ...admin, wrap(async (req, res) => res.status(201).json(await createAccount(req.user, req.body || {}))));
router.post('/admin/users/:id/suspend', ...admin, wrap(async (req, res) => { await setSuspended(req.user, id(req), true); res.json({ ok: true }); }));
router.post('/admin/users/:id/reinstate', ...admin, wrap(async (req, res) => { await setSuspended(req.user, id(req), false); res.json({ ok: true }); }));
router.post('/admin/users/:id/reset-password', ...admin, wrap(async (req, res) => res.json(await resetPassword(req.user, id(req)))));
router.put('/admin/users/:id/hubs', ...admin, wrap(async (req, res) => { await setStaffHubs(req.user, id(req), req.body?.hub_ids); res.json({ ok: true }); }));
router.post('/admin/users/:id/delete', ...admin, wrap(async (req, res) => { await deleteAccount(req.user, id(req)); res.json({ ok: true }); }));

router.get('/admin/partners', ...admin, wrap(async (_req, res) => res.json(await listPartners())));
router.post('/admin/partners/:id/:decision', ...admin, wrap(async (req, res) => { await setPartnerStatus(req.user, id(req), req.params.decision); res.json({ ok: true }); }));

router.get('/admin/hubs', ...admin, wrap(async (_req, res) => res.json(await listHubs())));
router.post('/admin/hubs', ...admin, wrap(async (req, res) => res.status(201).json({ id: await createHub(req.user, req.body || {}) })));
router.patch('/admin/hubs/:id', ...admin, wrap(async (req, res) => { await updateHub(req.user, id(req), req.body || {}); res.json({ ok: true }); }));

router.get('/admin/recyclers', ...admin, wrap(async (_req, res) => res.json(await listRecyclers())));
router.post('/admin/recyclers', ...admin, wrap(async (req, res) => res.status(201).json({ id: await saveRecycler(req.user, null, req.body || {}) })));
router.patch('/admin/recyclers/:id', ...admin, wrap(async (req, res) => res.json({ id: await saveRecycler(req.user, id(req), req.body || {}) })));

router.get('/admin/categories', ...admin, wrap(async (_req, res) => res.json(await listCategories())));
router.post('/admin/categories', ...admin, wrap(async (req, res) => res.status(201).json({ id: await saveCategory(req.user, null, req.body || {}) })));
router.patch('/admin/categories/:id', ...admin, wrap(async (req, res) => res.json({ id: await saveCategory(req.user, id(req), req.body || {}) })));

router.get('/admin/audit', ...admin, wrap(async (req, res) => res.json(await auditLog({
  entity: req.query.entity, entityId: req.query.entity_id, limit: req.query.limit, before: req.query.before,
}))));

export default router;
