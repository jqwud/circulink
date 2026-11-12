// The drop-off flow (spec section 3): a resident declares items and gets a code, staff check the code in at
// the hub, then weigh and sort each item. Points are written here and nowhere else (R1, R12). Every check is
// a rule function from rules.js; this file only loads rows, calls the rules and saves the result.
import { pool, q, one, withTx, todayPH, phTimestamp } from './db.js';
import { HttpError, bad, notFound } from './errors.js';
import { audit, notify } from './services.js';
import {
  STATE_FOR_OUTCOME, assertCanActAtHub, assertNotOwnDropOff, assertCanDeclare, assertCodeUsable, assertFoodOk,
  assertFoodOutcome, assertTransition, checkOutcome, checkWeight, cleanCode, codeExpiry, codeLooksValid, flagsFor, impactOf,
  badgeFor, newCode, pointsFor, pointsStatus,
} from './rules.js';

export const MAX_ITEMS_PER_DECLARATION = 20;

// The hubs a staff member works at (hub_staff). Admins may act anywhere, so they need none.
export const staffHubIds = async (userId, conn = null) =>
  (await (conn || pool).query('SELECT hub_id FROM hub_staff WHERE user_id = ?', [userId]))[0].map((r) => r.hub_id);

const lockUser = async (conn, id) => (await conn.query('SELECT * FROM users WHERE id = ?', [id]))[0][0];

// ---------- resident: declare, list, cancel ----------

// items: [{ category_id, description? }]. One declaration, one code, one hub.
export function declare(resident, { hub_id: hubId, items, note }, now = new Date()) {
  return withTx(async (conn) => {
    // Lock the resident so two quick taps cannot both pass the "3 open codes" check (R9).
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [resident.id]);
    const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM declarations WHERE resident_id = ? AND status = 'open'", [resident.id]);
    assertCanDeclare(Number(n));

    const [[hub]] = await conn.query("SELECT id FROM hubs WHERE id = ? AND status = 'active'", [hubId]);
    if (!hub) throw bad('Choose an open hub.', 'bad_hub');
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS_PER_DECLARATION) {
      throw bad(`List between 1 and ${MAX_ITEMS_PER_DECLARATION} items.`, 'bad_items');
    }
    const [cats] = await conn.query('SELECT id FROM categories WHERE active = 1');
    const active = new Set(cats.map((c) => c.id));
    for (const it of items) {
      if (!active.has(Number(it?.category_id))) throw bad('Choose a category for every item.', 'bad_category');
    }

    // A fresh code; a clash with an existing one (about 1 in 887 million) just picks another.
    let id;
    let code;
    for (let tries = 0; !id; tries++) {
      code = newCode();
      try {
        [{ insertId: id }] = await conn.query(
          'INSERT INTO declarations (resident_id, hub_id, code, note, expires_at) VALUES (?,?,?,?,?)',
          [resident.id, hub.id, code, note ? String(note).trim().slice(0, 255) : null, phTimestamp(codeExpiry(now))]);
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY' || tries >= 5) throw e;
      }
    }
    for (const it of items) {
      await conn.query('INSERT INTO items (declaration_id, category_id, description) VALUES (?,?,?)',
        [id, Number(it.category_id), it.description ? String(it.description).trim().slice(0, 160) || null : null]);
    }
    await audit(resident.id, 'declaration_created', { entity: 'declaration', entityId: id, details: { hub_id: hub.id, items: items.length } }, conn);
    return id;
  });
}

const ITEM_SQL = `
  SELECT i.id, i.declaration_id, i.category_id, c.slug AS category_slug, c.name_en AS category_en, c.name_fil AS category_fil,
         c.hazardous, c.food, c.co2_per_kg, i.description, i.weight_kg, i.outcome, i.state, i.expiry_date, i.photo_url, i.processed_at,
         p.points, p.status AS points_status
    FROM items i JOIN categories c ON c.id = i.category_id LEFT JOIN points_ledger p ON p.item_id = i.id`;

const itemView = (i) => ({
  id: i.id, category_id: i.category_id, category: { slug: i.category_slug, name_en: i.category_en, name_fil: i.category_fil, hazardous: !!i.hazardous, food: !!i.food },
  description: i.description, weight_kg: i.weight_kg === null ? null : Number(i.weight_kg), outcome: i.outcome, state: i.state,
  expiry_date: i.expiry_date, photo_url: i.photo_url, processed_at: i.processed_at,
  points: i.points === null || i.points === undefined ? null : Number(i.points), points_status: i.points_status || null,
});

// One declaration with its items. `forStaff` adds the resident's name (staff need it at the counter).
export async function declarationView(id, { forStaff = false } = {}) {
  const d = await one(
    `SELECT d.*, h.name AS hub_name, h.type AS hub_type, u.name AS resident_name
       FROM declarations d JOIN hubs h ON h.id = d.hub_id JOIN users u ON u.id = d.resident_id WHERE d.id = ?`, [id]);
  if (!d) return null;
  const items = (await q(`${ITEM_SQL} WHERE i.declaration_id = ? ORDER BY i.id`, [id])).map(itemView);
  return {
    id: d.id, code: forStaff ? undefined : d.code, status: d.status, note: d.note, expires_at: d.expires_at,
    received_at: d.received_at, created_at: d.created_at,
    hub: { id: d.hub_id, name: d.hub_name, type: d.hub_type },
    ...(forStaff ? { resident: { id: d.resident_id, name: d.resident_name } } : {}),
    items,
  };
}

export async function myDeclarations(residentId) {
  const ids = await q('SELECT id FROM declarations WHERE resident_id = ? ORDER BY id DESC LIMIT 100', [residentId]);
  return Promise.all(ids.map((r) => declarationView(r.id)));
}

export function cancelDeclaration(id, resident) {
  return withTx(async (conn) => {
    const [[d]] = await conn.query('SELECT * FROM declarations WHERE id = ? FOR UPDATE', [id]);
    if (!d || d.resident_id !== resident.id) throw notFound();
    if (d.status !== 'open') throw bad('Only an open drop-off can be cancelled.', 'bad_state');
    await conn.query("UPDATE declarations SET status = 'cancelled' WHERE id = ?", [id]);
    await audit(resident.id, 'declaration_cancelled', { entity: 'declaration', entityId: id }, conn);
  });
}

// What the person kept in use, and their points. Only confirmed points count for badges.
export async function myImpact(userId) {
  const items = await q(
    `SELECT i.weight_kg, i.outcome, c.co2_per_kg FROM items i JOIN declarations d ON d.id = i.declaration_id
       JOIN categories c ON c.id = i.category_id WHERE d.resident_id = ? AND i.outcome IS NOT NULL`, [userId]);
  const sums = await one(
    `SELECT COALESCE(SUM(CASE WHEN status = 'confirmed' THEN points END), 0) AS confirmed,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN points END), 0) AS pending
       FROM points_ledger WHERE user_id = ?`, [userId]);
  const confirmed = Number(sums.confirmed);
  return { ...impactOf(items), items_sorted: items.length, points_confirmed: confirmed, points_pending: Number(sums.pending), badge: badgeFor(confirmed) };
}

// ---------- staff: check in, add, sort ----------

// Staff type the code the resident shows. The code works once (R9), only at its own hub (R4), and never for
// the staff member's own drop-off (R3).
export function checkIn(rawCode, actor, now = new Date()) {
  const code = cleanCode(rawCode);
  if (!codeLooksValid(code)) throw bad('A code has 6 letters and numbers. Check it with the resident.', 'bad_code');
  return withTx(async (conn) => {
    const [[d]] = await conn.query('SELECT * FROM declarations WHERE code = ? FOR UPDATE', [code]);
    if (!d) throw new HttpError(404, 'No drop-off has this code. Check it with the resident.', 'bad_code');
    assertCanActAtHub(actor, d.hub_id, await staffHubIds(actor.id, conn));
    assertCodeUsable(d, now);
    assertNotOwnDropOff(actor, await lockUser(conn, d.resident_id));
    await conn.query("UPDATE declarations SET status = 'received', received_at = ?, received_by = ? WHERE id = ?", [phTimestamp(now), actor.id, d.id]);
    await conn.query("UPDATE items SET state = 'received' WHERE declaration_id = ? AND state = 'declared'", [d.id]);
    await audit(actor.id, 'declaration_received', { entity: 'declaration', entityId: d.id, details: { hub_id: d.hub_id } }, conn);
    await notify(conn, d.resident_id, 'dropoff_received', 'Your items arrived at the hub', 'Staff will weigh and sort them soon.', d.id);
    return d.id;
  });
}

// Loads a received declaration for a staff action, with every rule that guards it.
async function staffDeclaration(conn, declarationId, actor) {
  const [[d]] = await conn.query('SELECT * FROM declarations WHERE id = ? FOR UPDATE', [declarationId]);
  if (!d) throw notFound();
  assertCanActAtHub(actor, d.hub_id, await staffHubIds(actor.id, conn));
  assertNotOwnDropOff(actor, await lockUser(conn, d.resident_id));
  if (d.status !== 'received') throw bad('Check the code in first.', 'not_received');
  return d;
}

export async function staffDeclarationView(id, actor) {
  const d = await one('SELECT hub_id FROM declarations WHERE id = ?', [id]);
  if (!d) throw notFound();
  assertCanActAtHub(actor, d.hub_id, await staffHubIds(actor.id));
  return declarationView(id, { forStaff: true });
}

// The resident brought something they did not list: staff add it before sorting.
export function addItem(declarationId, actor, { category_id: categoryId, description }) {
  return withTx(async (conn) => {
    const d = await staffDeclaration(conn, declarationId, actor);
    const [[cat]] = await conn.query('SELECT id FROM categories WHERE id = ? AND active = 1', [categoryId]);
    if (!cat) throw bad('Choose a category.', 'bad_category');
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM items WHERE declaration_id = ?', [d.id]);
    if (Number(n) >= MAX_ITEMS_PER_DECLARATION) throw bad(`A drop-off holds at most ${MAX_ITEMS_PER_DECLARATION} items.`, 'bad_items');
    const [r] = await conn.query("INSERT INTO items (declaration_id, category_id, description, state) VALUES (?,?,?, 'received')",
      [d.id, cat.id, description ? String(description).trim().slice(0, 160) || null : null]);
    await audit(actor.id, 'item_added', { entity: 'item', entityId: r.insertId, details: { declaration_id: d.id } }, conn);
    return r.insertId;
  });
}

// R7: totals around this drop-off, compared with the thresholds. Returns the kinds of new flags raised.
async function raiseFlags(conn, d, now) {
  const today = todayPH(now);
  const [[a]] = await conn.query('SELECT COALESCE(SUM(weight_kg), 0) AS kg FROM items WHERE declaration_id = ?', [d.id]);
  const [[b]] = await conn.query(
    `SELECT COALESCE(SUM(i.weight_kg), 0) AS kg FROM items i JOIN declarations x ON x.id = i.declaration_id
      WHERE x.resident_id = ? AND i.processed_at >= ? - INTERVAL 30 DAY`, [d.resident_id, phTimestamp(now)]);
  const [[c]] = await conn.query(
    `SELECT COALESCE(SUM(i.weight_kg), 0) AS kg FROM items i JOIN declarations x ON x.id = i.declaration_id
      WHERE x.hub_id = ? AND DATE(i.processed_at) = ?`, [d.hub_id, today]);
  const [[e]] = await conn.query(
    `SELECT COALESCE(SUM(i.weight_kg), 0) AS kg, COUNT(DISTINCT DATE(i.processed_at)) AS days
       FROM items i JOIN declarations x ON x.id = i.declaration_id
      WHERE x.hub_id = ? AND DATE(i.processed_at) < ? AND DATE(i.processed_at) >= ? - INTERVAL 30 DAY`, [d.hub_id, today, today]);
  const kinds = flagsFor({
    dropOffKg: Number(a.kg), residentKg30: Number(b.kg), hubTodayKg: Number(c.kg),
    hubDailyAvg30: Number(e.days) ? Number(e.kg) / Number(e.days) : 0,
  });
  const raised = [];
  for (const kind of kinds) {
    // One flag of each kind per drop-off is enough: it already holds all of its points.
    const [[exists]] = await conn.query("SELECT id FROM flags WHERE kind = ? AND entity = 'declaration' AND entity_id = ?", [kind, d.id]);
    if (exists) continue;
    await conn.query("INSERT INTO flags (kind, entity, entity_id, detail) VALUES (?, 'declaration', ?, ?)",
      [kind, d.id, `${Number(a.kg)} kg in this drop-off; ${Number(b.kg)} kg from this resident in 30 days; ${Number(c.kg)} kg at the hub today`]);
    raised.push(kind);
  }
  return raised;
}

// R6: brings every points row of a drop-off up to date with its item and the drop-off's flags.
export async function settlePoints(conn, declarationId) {
  const [[f]] = await conn.query(
    `SELECT COALESCE(SUM(status = 'open'), 0) AS open, COALESCE(SUM(status = 'upheld'), 0) AS upheld
       FROM flags WHERE entity = 'declaration' AND entity_id = ?`, [declarationId]);
  const [[u]] = await conn.query("SELECT COUNT(*) AS n FROM items WHERE declaration_id = ? AND state IN ('declared','received')", [declarationId]);
  const [rows] = await conn.query(
    `SELECT p.id, p.user_id, p.points, p.status, i.state FROM points_ledger p JOIN items i ON i.id = p.item_id
      WHERE i.declaration_id = ? AND p.status = 'pending'`, [declarationId]);
  let confirmed = 0;
  for (const r of rows) {
    const status = pointsStatus({ itemState: r.state, dropOffSorted: Number(u.n) === 0, openFlag: Number(f.open) > 0, flagUpheld: Number(f.upheld) > 0 });
    if (status === r.status) continue;
    await conn.query('UPDATE points_ledger SET status = ?, decided_at = NOW() WHERE id = ? AND status = ?', [status, r.id, 'pending']);
    if (status === 'confirmed') confirmed += r.points;
  }
  return { confirmed };
}

// Weigh and sort one item: the only place points are created (R1). body: { weight_kg, outcome,
// category_id?, expiry_date?, description?, photo_url? }. Returns the new points and any flags raised.
export function sortItem(itemId, actor, body, now = new Date(), { photo = (p) => p } = {}) {
  const outcome = checkOutcome(body?.outcome);
  const weight = checkWeight(body?.weight_kg);
  return withTx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item) throw notFound();
    const d = await staffDeclaration(conn, item.declaration_id, actor);
    const to = STATE_FOR_OUTCOME[outcome];
    assertTransition(item.state, to);
    const categoryId = body.category_id ? Number(body.category_id) : item.category_id;
    const [[cat]] = await conn.query('SELECT * FROM categories WHERE id = ? AND active = 1', [categoryId]);
    if (!cat) throw bad('Choose a category.', 'bad_category');
    assertFoodOutcome(cat, outcome);
    const expiry = cat.food ? String(body.expiry_date || '') : null;
    if (cat.food && outcome === 'reuse') assertFoodOk(cat, expiry, todayPH(now));

    const points = pointsFor(weight, cat.rate_per_kg, outcome);
    await conn.query(
      `UPDATE items SET category_id = ?, weight_kg = ?, outcome = ?, state = ?, expiry_date = ?, photo_url = COALESCE(?, photo_url),
              description = COALESCE(?, description), processed_by = ?, processed_at = ? WHERE id = ?`,
      [cat.id, weight, outcome, to, expiry || null, photo(body.photo_url) || null,
        body.description ? String(body.description).trim().slice(0, 160) : null, actor.id, phTimestamp(now), item.id]);
    await conn.query("INSERT INTO points_ledger (user_id, item_id, points, reason) VALUES (?,?,?,?)",
      [d.resident_id, item.id, points, `${outcome} ${weight} kg ${cat.slug}`.slice(0, 120)]);
    const flags = await raiseFlags(conn, d, now);
    await settlePoints(conn, d.id);
    await audit(actor.id, 'item_sorted', { entity: 'item', entityId: item.id, details: { outcome, weight_kg: weight, category: cat.slug, points, flags } }, conn);
    const [[p]] = await conn.query('SELECT points, status FROM points_ledger WHERE item_id = ?', [item.id]);
    return { item_id: item.id, outcome, state: to, weight_kg: weight, points: p.points, points_status: p.status, flags };
  });
}

// When the last item of a drop-off is sorted, the resident hears once what happened.
export async function tellResidentIfDone(declarationId) {
  const left = await one("SELECT COUNT(*) AS n FROM items WHERE declaration_id = ? AND state IN ('declared','received')", [declarationId]);
  if (Number(left.n)) return;
  const d = await one('SELECT resident_id FROM declarations WHERE id = ?', [declarationId]);
  const told = await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'dropoff_sorted' AND ref_id = ?", [d.resident_id, declarationId]);
  if (told) return;
  const s = await one(
    `SELECT COALESCE(SUM(CASE WHEN i.outcome <> 'reject' THEN i.weight_kg END), 0) AS kg, COALESCE(SUM(p.points), 0) AS pts
       FROM items i LEFT JOIN points_ledger p ON p.item_id = i.id WHERE i.declaration_id = ?`, [declarationId]);
  await notify(null, d.resident_id, 'dropoff_sorted', 'Your items were sorted',
    `${Number(s.kg)} kg kept in use, ${Number(s.pts)} points (confirmed when each item reaches its new home).`, declarationId,
    { kg: Number(s.kg), points: Number(s.pts) });
}

// ---------- admin: review flags (R7) ----------

export async function listFlags(status = 'open') {
  return q(
    `SELECT f.*, d.hub_id, h.name AS hub_name, u.name AS resident_name, d.resident_id
       FROM flags f JOIN declarations d ON f.entity = 'declaration' AND d.id = f.entity_id
       JOIN hubs h ON h.id = d.hub_id JOIN users u ON u.id = d.resident_id
      WHERE f.status = ? ORDER BY f.id DESC LIMIT 200`, [['open', 'cleared', 'upheld'].includes(status) ? status : 'open']);
}

// cleared: the weights were real, the points go on. upheld: the points of that drop-off are cancelled.
export function decideFlag(flagId, actor, decision) {
  if (!['clear', 'uphold'].includes(decision)) throw bad('Choose clear or uphold.', 'bad_decision');
  return withTx(async (conn) => {
    const [[f]] = await conn.query('SELECT * FROM flags WHERE id = ? FOR UPDATE', [flagId]);
    if (!f) throw notFound();
    if (f.status !== 'open') throw bad('This flag was already decided.', 'bad_state');
    const [[d]] = await conn.query('SELECT * FROM declarations WHERE id = ?', [f.entity_id]);
    // Admins are bound by R3 too: nobody decides on their own drop-off.
    assertNotOwnDropOff(actor, await lockUser(conn, d.resident_id));
    await conn.query('UPDATE flags SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [decision === 'clear' ? 'cleared' : 'upheld', actor.id, f.id]);
    await settlePoints(conn, d.id);
    await audit(actor.id, decision === 'clear' ? 'flag_cleared' : 'flag_upheld', { entity: 'flag', entityId: f.id, details: { declaration_id: d.id } }, conn);
    if (decision === 'uphold') {
      await notify(conn, d.resident_id, 'points_cancelled', 'Points from a drop-off were cancelled', 'An admin reviewed the weights. Ask the hub staff if you have questions.', d.id);
    }
  });
}

// ---------- job: codes that were never used ----------

export async function expireDeclarations(now = new Date()) {
  const r = await q("UPDATE declarations SET status = 'expired' WHERE status = 'open' AND expires_at <= ?", [phTimestamp(now)]);
  return { expired: r.affectedRows };
}

