import { Router } from 'express';
import { q, one } from '../db.js';
import { bad, forbidden, notFound, wrap } from '../errors.js';
import { authRequired, requireApproved } from '../auth.js';
import { ownPhoto } from '../uploads.js';
import {
  createRequest, decideRequest, cancelRequest, handOver, returnItem, saveSurvey, saveRating,
} from '../services.js';

const router = Router();

export const SELECT_REQUEST = `
  SELECT r.*, i.title AS item_title, i.photo_url AS item_photo, i.tier AS item_tier, i.is_shelf, i.owner_id,
         c.slug AS category_slug,
         b.name AS borrower_name, b.purok AS borrower_purok,
         o.name AS owner_name,
         p.name AS pickup_name,
         (SELECT would_have_bought FROM impact_surveys s WHERE s.request_id = r.id) AS survey,
         (r.status = 'handed_over' AND r.end_date < CURDATE()) AS overdue
    FROM requests r
    JOIN items i ON i.id = r.item_id
    JOIN categories c ON c.id = i.category_id
    JOIN users b ON b.id = r.borrower_id
    LEFT JOIN users o ON o.id = i.owner_id
    LEFT JOIN pickup_points p ON p.id = i.pickup_point_id`;

const first = (n) => (n ? String(n).split(' ')[0] : null);

export function mapRequest(r, viewerId = null) {
  return {
    id: r.id,
    item: { id: r.item_id, title: r.item_title, photo_url: r.item_photo, tier: r.item_tier, is_shelf: !!r.is_shelf, category_slug: r.category_slug },
    borrower: { id: r.borrower_id, name: first(r.borrower_name), purok: r.borrower_purok },
    owner: r.owner_id ? { id: r.owner_id, name: first(r.owner_name) } : null,
    pickup_point: r.pickup_name,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    credit_cost: r.credit_cost,
    handled_by_staff: !!r.handled_by_staff,
    handed_over_at: r.handed_over_at,
    returned_at: r.returned_at,
    return_condition: r.return_condition,
    on_time: r.on_time === null ? null : !!r.on_time,
    overdue: !!r.overdue,
    note: r.note,
    survey: r.survey,
    kit_id: r.kit_id,
    my_role: viewerId ? (r.borrower_id === viewerId ? 'borrower' : r.owner_id === viewerId ? 'owner' : null) : null,
    created_at: r.created_at,
  };
}

router.post('/requests', authRequired, requireApproved, wrap(async (req, res) => {
  const { item_id, start_date, end_date, note } = req.body || {};
  const r = await createRequest({ borrower: req.user, itemId: Number(item_id), start: start_date, end: end_date, note: note || null });
  res.status(201).json(r);
}));

// as=borrower (things I borrow) or as=owner (people asking for my items)
router.get('/requests', authRequired, wrap(async (req, res) => {
  const as = req.query.as === 'owner' ? 'owner' : 'borrower';
  const rows = await q(
    `${SELECT_REQUEST} WHERE ${as === 'owner' ? 'i.owner_id' : 'r.borrower_id'} = ? ORDER BY
       FIELD(r.status,'pending','approved','handed_over','disputed','closed','rejected','cancelled'), r.start_date DESC`,
    [req.user.id]);
  res.json(rows.map((r) => mapRequest(r, req.user.id)));
}));

router.get('/requests/:id', authRequired, wrap(async (req, res) => {
  const row = await one(`${SELECT_REQUEST} WHERE r.id = ?`, [req.params.id]);
  if (!row) throw notFound('Request not found.');
  if (row.borrower_id !== req.user.id && row.owner_id !== req.user.id && req.user.role === 'resident') {
    throw forbidden('This is not your request.', 'cannot_manage');
  }
  res.json(mapRequest(row, req.user.id));
}));

router.post('/requests/:id/approve', authRequired, wrap(async (req, res) => res.json(await decideRequest(Number(req.params.id), req.user, 'approve'))));
router.post('/requests/:id/reject', authRequired, wrap(async (req, res) => res.json(await decideRequest(Number(req.params.id), req.user, 'reject', req.body?.reason || null))));
router.post('/requests/:id/cancel', authRequired, wrap(async (req, res) => res.json(await cancelRequest(Number(req.params.id), req.user))));
router.post('/requests/:id/handover', authRequired, wrap(async (req, res) => res.json(await handOver(Number(req.params.id), req.user, ownPhoto(req.body?.photo)))));
router.post('/requests/:id/return', authRequired, wrap(async (req, res) => {
  const { condition, note, photo } = req.body || {};
  res.json(await returnItem(Number(req.params.id), req.user, { condition: condition || 'good', note: note || null, photo: ownPhoto(photo) }));
}));
router.post('/requests/:id/survey', authRequired, wrap(async (req, res) => res.json(await saveSurvey(Number(req.params.id), req.user, req.body?.would_have_bought))));
router.post('/requests/:id/rate', authRequired, wrap(async (req, res) => res.json(await saveRating(Number(req.params.id), req.user, req.body?.stars, req.body?.comment || null))));

export default router;
