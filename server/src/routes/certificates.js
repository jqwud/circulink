// Certificates: residents see and claim theirs, admins decide on requests and revoke, anyone checks one.
import { Router } from 'express';
import { wrap } from '../errors.js';
import { authRequired, requireResident, requireAdmin } from '../auth.js';
import { myCertificates, claimCertificate, listCertificates, decideCertificate, certificateByCode } from '../certificates.js';

const router = Router();
const admin = [authRequired, requireAdmin];

router.get('/me/certificates', authRequired, requireResident, wrap(async (req, res) => res.json(await myCertificates(req.user.id))));
router.post('/me/certificates', authRequired, requireResident, wrap(async (req, res) => {
  res.status(201).json(await claimCertificate(req.user, req.body?.level));
}));

router.get('/admin/certificates', ...admin, wrap(async (req, res) => res.json(await listCertificates(req.query.status))));
for (const action of ['approve', 'decline', 'revoke']) {
  router.post(`/admin/certificates/:id/${action}`, ...admin, wrap(async (req, res) => {
    await decideCertificate(req.user, Number(req.params.id), action, req.body?.reason);
    res.json({ ok: true });
  }));
}

// Public: the facts on a certificate, for anyone holding its code.
router.get('/certificates/:code', wrap(async (req, res) => res.json(await certificateByCode(req.params.code))));

export default router;
