// Food rewards as residents see them: my Tiwala score, my vouchers, what I can choose, and choosing it.
import { Router } from 'express';
import { wrap } from '../errors.js';
import { authRequired } from '../auth.js';
import { myTiwala, myVouchers, rewardCatalog, chooseReward } from '../rewards.js';

const router = Router();
router.use(['/me/tiwala', '/me/vouchers', '/rewards', '/vouchers'], authRequired);

router.get('/me/tiwala', wrap(async (req, res) => res.json(await myTiwala(req.user.id))));
router.get('/me/vouchers', wrap(async (req, res) => res.json(await myVouchers(req.user.id))));
router.get('/rewards/catalog', wrap(async (_req, res) => res.json(await rewardCatalog())));
router.post('/vouchers/:id/choose', wrap(async (req, res) => res.json(await chooseReward(Number(req.params.id), req.user, req.body?.catalog_id))));

export default router;
