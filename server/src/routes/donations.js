// Donation claims as residents see them: my claims and my donations, one claim, its actions and its thread.
import { Router } from 'express';
import { q, withTx } from '../db.js';
import { wrap } from '../errors.js';
import { authRequired } from '../auth.js';
import {
  loadClaim, assertCanSee, claimView, claimThread, confirmGiven, confirmReceived, releaseClaim, cancelClaim, noShow, problemClaim,
} from '../donations.js';
import { readThread, postToThread } from '../threads.js';
import { SITUATIONS_BY_CLAIM_STATUS } from '../phrases.js';

const router = Router();
router.use('/donations', authRequired);

const seeClaim = async (req) => {
  const c = await withTx((conn) => loadClaim(conn, Number(req.params.id), false));
  assertCanSee(c, req.user);
  return c;
};

// My claims (as the receiver) and the open claims on my donations (as the donor).
router.get('/donations/mine', wrap(async (req, res) => {
  const rows = await q(
    `SELECT c.id FROM donation_claims c JOIN items i ON i.id = c.item_id
      WHERE (c.claimer_id = ? OR (i.owner_id = ? AND c.status <> 'waiting'))
        AND (c.status IN ('waiting','reserved') OR c.closed_at >= NOW() - INTERVAL 30 DAY)
      ORDER BY FIELD(c.status,'reserved','waiting','given'), c.id DESC LIMIT 50`, [req.user.id, req.user.id]);
  const out = [];
  for (const { id } of rows) out.push(await claimView(await withTx((conn) => loadClaim(conn, id, false)), req.user));
  res.json(out);
}));

router.get('/donations/claims/:id', wrap(async (req, res) => res.json(await claimView(await seeClaim(req), req.user))));

const ACTIONS = { given: confirmGiven, received: confirmReceived, release: releaseClaim, cancel: cancelClaim, 'no-show': noShow, problem: problemClaim };
for (const [path, fn] of Object.entries(ACTIONS)) {
  router.post(`/donations/claims/:id/${path}`, wrap(async (req, res) => res.json(await fn(Number(req.params.id), req.user))));
}

const thread = (c) => ({ ...claimThread(c), statusMap: SITUATIONS_BY_CLAIM_STATUS });
router.get('/donations/claims/:id/messages', wrap(async (req, res) => res.json(await readThread(thread(await seeClaim(req)), req.user))));
router.post('/donations/claims/:id/messages', wrap(async (req, res) => res.status(201).json(await postToThread(thread(await seeClaim(req)), req.user, req.body))));

export default router;
