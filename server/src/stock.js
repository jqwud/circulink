// Where sorted items go (spec section 3, the bottom half): reusable stock released to approved partner
// organizations (R2), the repair queue, and recycle batches sent to recyclers (R10). Items reach their final
// state here, so this is where pending points become confirmed (R6, via settlePoints).
import { q, one, withTx, todayPH, phTimestamp } from './db.js';
import { HttpError, bad, notFound } from './errors.js';
import { audit, notify } from './services.js';
import { settlePoints, staffHubIds } from './dropoffs.js';
import {
  assertCanActAtHub, assertCanReceiveItems, assertCanSendToRecycler, assertFoodOk, assertMove, assertTransition, outcomeAfterMove,
  pointsAfterMove, repricePending, samePerson,
} from './rules.js';

export const MAX_ITEMS_PER_RELEASE = 50;
export const MAX_ITEMS_PER_BATCH = 200;

const ITEM_COLS = `i.id, i.category_id, c.slug AS category_slug, c.name_en AS category_en, c.name_fil AS category_fil, c.hazardous, c.food,
  i.description, i.weight_kg, i.outcome, i.state, i.expiry_date, i.photo_url, i.processed_at, d.hub_id, h.name AS hub_name`;
const ITEM_FROM = `items i JOIN categories c ON c.id = i.category_id JOIN declarations d ON d.id = i.declaration_id JOIN hubs h ON h.id = d.hub_id`;

// What partners and staff see of an item. Never who gave it (privacy notice: partners never see the giver).
export const stockView = (i) => ({
  id: i.id, hub: { id: i.hub_id, name: i.hub_name },
  category: { id: i.category_id, slug: i.category_slug, name_en: i.category_en, name_fil: i.category_fil, hazardous: !!i.hazardous, food: !!i.food },
  description: i.description, weight_kg: i.weight_kg === null ? null : Number(i.weight_kg), outcome: i.outcome, state: i.state,
  expiry_date: i.expiry_date, photo_url: i.photo_url, sorted_at: i.processed_at,
});

// The approved partner organization of this account, or a 403 (R2).
export async function partnerOf(user, conn = null) {
  const p = conn ? (await conn.query('SELECT * FROM partners WHERE user_id = ?', [user.id]))[0][0] : await one('SELECT * FROM partners WHERE user_id = ?', [user.id]);
  assertCanReceiveItems(user, p);
  return p;
}

// Items a partner can ask for: in stock, at an active hub, not already asked for, and food still fresh.
export async function availableStock({ hubId = null, categoryId = null } = {}, today = todayPH()) {
  const rows = await q(
    `SELECT ${ITEM_COLS} FROM ${ITEM_FROM}
      WHERE i.state = 'in_stock' AND h.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM release_items ri JOIN releases r ON r.id = ri.release_id WHERE ri.item_id = i.id AND r.status = 'requested')
        AND (c.food = 0 OR i.expiry_date >= ? + INTERVAL 3 DAY)
        ${hubId ? 'AND d.hub_id = ?' : ''} ${categoryId ? 'AND i.category_id = ?' : ''}
      ORDER BY h.name, c.name_en, i.id LIMIT 500`,
    [today, ...(hubId ? [hubId] : []), ...(categoryId ? [categoryId] : [])]);
  return rows.map(stockView);
}

// Everything at my hubs that is not final yet, for the staff stock page.
export async function staffStock(actor) {
  const hubs = actor.role === 'admin' ? null : await staffHubIds(actor.id);
  if (hubs && !hubs.length) return [];
  const rows = await q(
    `SELECT ${ITEM_COLS},
            (SELECT r.id FROM release_items ri JOIN releases r ON r.id = ri.release_id WHERE ri.item_id = i.id AND r.status = 'requested') AS requested_in,
            (SELECT b.id FROM recycle_batch_items bi JOIN recycle_batches b ON b.id = bi.batch_id WHERE bi.item_id = i.id AND b.status = 'open') AS in_batch
       FROM ${ITEM_FROM}
      WHERE i.state IN ('in_stock','in_repair','in_recycle_batch') ${hubs ? `AND d.hub_id IN (${hubs.map(() => '?').join(',')})` : ''}
      ORDER BY i.state, h.name, i.id LIMIT 1000`, hubs || []);
  return rows.map((r) => ({ ...stockView(r), requested_in: r.requested_in, in_batch: r.in_batch }));
}

const lockItems = async (conn, ids) => {
  const [rows] = await conn.query(`SELECT i.*, d.hub_id, c.food, c.hazardous, c.rate_per_kg, c.slug FROM items i
     JOIN declarations d ON d.id = i.declaration_id JOIN categories c ON c.id = i.category_id WHERE i.id IN (?) FOR UPDATE`, [ids]);
  return rows;
};
const cleanIds = (ids, max) => {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length || list.length > max) throw bad(`Choose between 1 and ${max} items.`, 'bad_items');
  return list;
};

// Brings the points of every drop-off these items came from up to date, and tells each resident whose points
// were just confirmed.
async function settleFor(conn, items) {
  const decls = [...new Set(items.map((i) => i.declaration_id))];
  for (const id of decls) {
    const { confirmed } = await settlePoints(conn, id);
    if (confirmed > 0) {
      const [[d]] = await conn.query('SELECT resident_id FROM declarations WHERE id = ?', [id]);
      await notify(conn, d.resident_id, 'points_confirmed', `${confirmed} points confirmed`, 'Your items reached their new home. Thank you for keeping them in use!', id, { points: confirmed });
    }
  }
}

// ---------- partners: ask for stock, see requests, confirm pickup ----------

export function requestRelease(user, { hub_id: hubId, item_ids: itemIds, note }, today = todayPH()) {
  const ids = cleanIds(itemIds, MAX_ITEMS_PER_RELEASE);
  return withTx(async (conn) => {
    const partner = await partnerOf(user, conn);
    const items = await lockItems(conn, ids);
    if (items.length !== ids.length) throw bad('Some of these items no longer exist.', 'bad_items');
    for (const i of items) {
      if (Number(i.hub_id) !== Number(hubId)) throw bad('One request covers one hub. Ask each hub separately.', 'mixed_hubs');
      if (i.state !== 'in_stock') throw bad('Some of these items are no longer in stock.', 'not_in_stock');
      assertFoodOk(i, i.expiry_date, today);
    }
    const [[taken]] = await conn.query(
      `SELECT COUNT(*) AS n FROM release_items ri JOIN releases r ON r.id = ri.release_id WHERE ri.item_id IN (?) AND r.status = 'requested'`, [ids]);
    if (Number(taken.n)) throw bad('Another organization already asked for some of these items.', 'already_requested');
    const [r] = await conn.query('INSERT INTO releases (partner_id, hub_id, note) VALUES (?,?,?)',
      [partner.id, hubId, note ? String(note).trim().slice(0, 255) : null]);
    for (const id of ids) await conn.query('INSERT INTO release_items (release_id, item_id) VALUES (?,?)', [r.insertId, id]);
    await audit(user.id, 'release_requested', { entity: 'release', entityId: r.insertId, details: { hub_id: Number(hubId), items: ids.length } }, conn);
    const [staff] = await conn.query('SELECT user_id FROM hub_staff WHERE hub_id = ?', [hubId]);
    for (const s of staff) {
      await notify(conn, s.user_id, 'release_requested', `${partner.org_name} asked for ${ids.length} item(s)`, 'Open Releases in the portal to hand them over.', r.insertId,
        { org: partner.org_name, n: ids.length });
    }
    return r.insertId;
  });
}

export async function releaseView(id) {
  const r = await one(
    `SELECT r.*, p.org_name, p.kind AS org_kind, h.name AS hub_name FROM releases r JOIN partners p ON p.id = r.partner_id
       JOIN hubs h ON h.id = r.hub_id WHERE r.id = ?`, [id]);
  if (!r) return null;
  const items = await q(`SELECT ${ITEM_COLS} FROM ${ITEM_FROM} JOIN release_items ri ON ri.item_id = i.id WHERE ri.release_id = ? ORDER BY i.id`, [id]);
  return {
    id: r.id, status: r.status, note: r.note, created_at: r.created_at, released_at: r.released_at, picked_up_at: r.picked_up_at,
    partner: { id: r.partner_id, org_name: r.org_name, kind: r.org_kind }, hub: { id: r.hub_id, name: r.hub_name },
    items: items.map(stockView), total_kg: Math.round(items.reduce((a, i) => a + Number(i.weight_kg || 0), 0) * 100) / 100,
  };
}

export async function myReleases(user) {
  const p = await one('SELECT id FROM partners WHERE user_id = ?', [user.id]);
  if (!p) return [];
  const ids = await q('SELECT id FROM releases WHERE partner_id = ? ORDER BY id DESC LIMIT 100', [p.id]);
  return Promise.all(ids.map((r) => releaseView(r.id)));
}

// The partner takes back a request the hub has not handed over yet. The items are free again.
export function cancelRelease(id, user) {
  return withTx(async (conn) => {
    const [[r]] = await conn.query('SELECT r.*, p.user_id FROM releases r JOIN partners p ON p.id = r.partner_id WHERE r.id = ? FOR UPDATE', [id]);
    if (!r || r.user_id !== user.id) throw notFound();
    if (r.status !== 'requested') throw bad('Only a request that was not handed over yet can be cancelled.', 'bad_state');
    await conn.query("UPDATE releases SET status = 'cancelled' WHERE id = ?", [id]);
    await conn.query('DELETE FROM release_items WHERE release_id = ?', [id]);
    await audit(user.id, 'release_cancelled', { entity: 'release', entityId: id }, conn);
  });
}

// The partner confirms the items arrived. A receipt for both sides; the points were confirmed at hand-over.
export function confirmPickup(id, user) {
  return withTx(async (conn) => {
    const [[r]] = await conn.query('SELECT r.*, p.user_id FROM releases r JOIN partners p ON p.id = r.partner_id WHERE r.id = ? FOR UPDATE', [id]);
    if (!r || r.user_id !== user.id) throw notFound();
    if (r.status !== 'released') throw bad('The hub has not handed these items over yet.', 'bad_state');
    await conn.query("UPDATE releases SET status = 'picked_up', picked_up_at = NOW() WHERE id = ?", [id]);
    await audit(user.id, 'release_picked_up', { entity: 'release', entityId: id }, conn);
  });
}

// ---------- staff: hand over to a partner, decline ----------

async function staffRelease(conn, id, actor) {
  const [[r]] = await conn.query('SELECT * FROM releases WHERE id = ? FOR UPDATE', [id]);
  if (!r) throw notFound();
  assertCanActAtHub(actor, r.hub_id, await staffHubIds(actor.id, conn));
  if (r.status !== 'requested') throw bad('This request was already handled.', 'bad_state');
  return r;
}

export async function staffReleases(actor, status = 'requested') {
  const hubs = actor.role === 'admin' ? null : await staffHubIds(actor.id);
  if (hubs && !hubs.length) return [];
  const ids = await q(
    `SELECT id FROM releases WHERE status = ? ${hubs ? `AND hub_id IN (${hubs.map(() => '?').join(',')})` : ''} ORDER BY id DESC LIMIT 100`,
    [['requested', 'released', 'picked_up', 'cancelled'].includes(status) ? status : 'requested', ...(hubs || [])]);
  return Promise.all(ids.map((r) => releaseView(r.id)));
}

// Staff hand the items over. Checked again at the counter: the partner is still approved (R2), staff never
// release to their own organization (R3), food is still fresh (R11). The items become final: points confirmed.
export function handOver(id, actor, now = new Date()) {
  return withTx(async (conn) => {
    const r = await staffRelease(conn, id, actor);
    const [[p]] = await conn.query('SELECT * FROM partners WHERE id = ?', [r.partner_id]);
    const [[partnerUser]] = await conn.query('SELECT * FROM users WHERE id = ?', [p.user_id]);
    assertCanReceiveItems(partnerUser, p);
    if (samePerson(actor, partnerUser)) throw new HttpError(403, 'You cannot hand items to your own organization. Ask another staff member.', 'own_release');
    const [links] = await conn.query('SELECT item_id FROM release_items WHERE release_id = ?', [id]);
    const items = await lockItems(conn, links.map((l) => l.item_id));
    const today = todayPH(now);
    for (const i of items) {
      assertTransition(i.state, 'released');
      assertFoodOk(i, i.expiry_date, today);
    }
    await conn.query("UPDATE items SET state = 'released' WHERE id IN (?)", [items.map((i) => i.id)]);
    await conn.query("UPDATE releases SET status = 'released', released_by = ?, released_at = ? WHERE id = ?", [actor.id, phTimestamp(now), id]);
    await settleFor(conn, items);
    await audit(actor.id, 'release_handed_over', { entity: 'release', entityId: id, details: { items: items.length } }, conn);
    await notify(conn, p.user_id, 'release_ready', 'Your items were handed over', 'Confirm in the portal once they arrive.', id);
  });
}

export function declineRelease(id, actor, reason) {
  const why = String(reason || '').trim();
  if (why.length < 3) throw bad('Write a short reason for the organization.', 'reason_required');
  return withTx(async (conn) => {
    const r = await staffRelease(conn, id, actor);
    await conn.query("UPDATE releases SET status = 'cancelled' WHERE id = ?", [id]);
    await conn.query('DELETE FROM release_items WHERE release_id = ?', [id]);
    const [[p]] = await conn.query('SELECT user_id FROM partners WHERE id = ?', [r.partner_id]);
    await audit(actor.id, 'release_declined', { entity: 'release', entityId: id, details: { reason: why.slice(0, 200) } }, conn);
    await notify(conn, p.user_id, 'release_declined', 'The hub could not hand over your request', why.slice(0, 255), id);
  });
}

// ---------- staff: moving an item after sorting (repair done, spoiled, ...) ----------

export function moveItem(itemId, actor, to) {
  return withTx(async (conn) => {
    const [item] = await lockItems(conn, [Number(itemId)]);
    if (!item) throw notFound();
    assertCanActAtHub(actor, item.hub_id, await staffHubIds(actor.id, conn));
    assertMove(item.state, to);
    const [[busy]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM release_items ri JOIN releases r ON r.id = ri.release_id WHERE ri.item_id = ? AND r.status = 'requested')
            + (SELECT COUNT(*) FROM recycle_batch_items bi JOIN recycle_batches b ON b.id = bi.batch_id WHERE bi.item_id = ? AND b.status = 'open') AS n`,
      [item.id, item.id]);
    if (Number(busy.n)) throw bad('This item is part of a request or a recycle batch. Remove it from there first.', 'item_busy');
    const outcome = outcomeAfterMove(item.outcome, to);
    const [[row]] = await conn.query('SELECT * FROM points_ledger WHERE item_id = ? FOR UPDATE', [item.id]);
    const points = repricePending(row, pointsAfterMove(row.points, item.weight_kg, item.rate_per_kg, outcome));
    await conn.query('UPDATE items SET state = ?, outcome = ? WHERE id = ?', [to, outcome, item.id]);
    await conn.query('UPDATE points_ledger SET points = ? WHERE id = ?', [points, row.id]);
    await settleFor(conn, [item]);
    await audit(actor.id, 'item_moved', { entity: 'item', entityId: item.id, details: { from: item.state, to, outcome, points } }, conn);
    return { item_id: item.id, state: to, outcome, points };
  });
}

// ---------- staff: recycle batches (R10) ----------

export const recyclers = () => q("SELECT id, name, materials, accredited FROM recyclers WHERE status = 'active' ORDER BY name");

export function createBatch(actor, { hub_id: hubId, recycler_id: recyclerId, item_ids: itemIds }) {
  const ids = cleanIds(itemIds, MAX_ITEMS_PER_BATCH);
  return withTx(async (conn) => {
    assertCanActAtHub(actor, hubId, await staffHubIds(actor.id, conn));
    const [[recycler]] = await conn.query('SELECT * FROM recyclers WHERE id = ?', [recyclerId]);
    if (!recycler) throw bad('Choose a recycler.', 'bad_recycler');
    const items = await lockItems(conn, ids);
    if (items.length !== ids.length) throw bad('Some of these items no longer exist.', 'bad_items');
    for (const i of items) {
      if (Number(i.hub_id) !== Number(hubId)) throw bad('A batch holds items from one hub.', 'mixed_hubs');
      if (i.state !== 'in_recycle_batch') throw bad('Only items sorted for recycling can go in a batch.', 'bad_state');
      assertCanSendToRecycler(i, recycler);
    }
    const [[inBatch]] = await conn.query(
      `SELECT COUNT(*) AS n FROM recycle_batch_items bi JOIN recycle_batches b ON b.id = bi.batch_id WHERE bi.item_id IN (?) AND b.status = 'open'`, [ids]);
    if (Number(inBatch.n)) throw bad('Some of these items are already in another batch.', 'item_busy');
    const total = Math.round(items.reduce((a, i) => a + Number(i.weight_kg), 0) * 100) / 100;
    const [b] = await conn.query('INSERT INTO recycle_batches (hub_id, recycler_id, total_kg) VALUES (?,?,?)', [hubId, recycler.id, total]);
    for (const id of ids) await conn.query('INSERT INTO recycle_batch_items (batch_id, item_id) VALUES (?,?)', [b.insertId, id]);
    await audit(actor.id, 'batch_created', { entity: 'recycle_batch', entityId: b.insertId, details: { recycler_id: recycler.id, items: ids.length, total_kg: total } }, conn);
    return b.insertId;
  });
}

// The batch leaves the hub: its items are recycled (final), points confirmed.
export function sendBatch(id, actor, now = new Date()) {
  return withTx(async (conn) => {
    const [[b]] = await conn.query('SELECT * FROM recycle_batches WHERE id = ? FOR UPDATE', [id]);
    if (!b) throw notFound();
    assertCanActAtHub(actor, b.hub_id, await staffHubIds(actor.id, conn));
    if (b.status !== 'open') throw bad('This batch was already sent.', 'bad_state');
    const [[recycler]] = await conn.query('SELECT * FROM recyclers WHERE id = ?', [b.recycler_id]);
    const [links] = await conn.query('SELECT item_id FROM recycle_batch_items WHERE batch_id = ?', [id]);
    const items = await lockItems(conn, links.map((l) => l.item_id));
    for (const i of items) {
      assertTransition(i.state, 'recycled');
      assertCanSendToRecycler(i, recycler);   // the recycler may have lost its accreditation since
    }
    await conn.query("UPDATE items SET state = 'recycled' WHERE id IN (?)", [items.map((i) => i.id)]);
    await conn.query("UPDATE recycle_batches SET status = 'sent', sent_at = ?, sent_by = ? WHERE id = ?", [phTimestamp(now), actor.id, id]);
    await settleFor(conn, items);
    await audit(actor.id, 'batch_sent', { entity: 'recycle_batch', entityId: id, details: { items: items.length, total_kg: Number(b.total_kg) } }, conn);
  });
}

export async function batches(actor) {
  const hubs = actor.role === 'admin' ? null : await staffHubIds(actor.id);
  if (hubs && !hubs.length) return [];
  const rows = await q(
    `SELECT b.id, b.status, b.total_kg, b.created_at, b.sent_at, h.name AS hub_name, r.name AS recycler_name, r.accredited,
            (SELECT COUNT(*) FROM recycle_batch_items bi WHERE bi.batch_id = b.id) AS items
       FROM recycle_batches b JOIN hubs h ON h.id = b.hub_id JOIN recyclers r ON r.id = b.recycler_id
      ${hubs ? `WHERE b.hub_id IN (${hubs.map(() => '?').join(',')})` : ''} ORDER BY b.id DESC LIMIT 100`, hubs || []);
  return rows.map((r) => ({ ...r, total_kg: Number(r.total_kg), items: Number(r.items), accredited: !!r.accredited }));
}
