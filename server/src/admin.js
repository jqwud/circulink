// What admins manage: accounts (staff, partners, other admins), which hubs staff work at, partner approval
// (R2), hubs, recyclers (R10 accreditation) and categories (point rates and CO2 estimates). Every change is
// audited (R12). Admins can never lock themselves out or change their own role, so one admin cannot quietly
// take over or break the system alone.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, one, withTx, likeText } from './db.js';
import { bad, forbidden, notFound } from './errors.js';
import { audit, notify } from './services.js';
import { normalizePhone, ROLES, HUB_TYPES } from './rules.js';
import { temporaryPassword } from './routes/auth.js';
import { ownPhoto } from './uploads.js';

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const text = (v, max, code, what, min = 2) => {
  const s = String(v ?? '').trim();
  if (s.length < min || s.length > max) throw bad(`Enter ${what}.`, code);
  return s;
};
const num = (v, min, max, code, what) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${what} must be between ${min} and ${max}.`, code);
  return Math.round(n * 100) / 100;
};
const notSelf = (actor, id, what) => {
  if (Number(actor.id) === Number(id)) throw forbidden(`You cannot ${what} your own account. Ask another admin.`, 'not_on_self');
};

// ---------- accounts ----------

export async function listUsers({ role = '', search = '' } = {}) {
  const where = [];
  const params = [];
  if (ROLES.includes(role)) { where.push('u.role = ?'); params.push(role); }
  if (String(search).trim()) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); params.push(likeText(search), likeText(search), likeText(search)); }
  const rows = await q(
    `SELECT u.id, u.name, u.email, u.phone, u.student_id, u.role, u.suspended, u.deletion_requested_at, u.created_at,
            p.id AS partner_id, p.org_name, p.status AS partner_status,
            (SELECT GROUP_CONCAT(hub_id ORDER BY hub_id) FROM hub_staff s WHERE s.user_id = u.id) AS hub_ids
       FROM users u LEFT JOIN partners p ON p.user_id = u.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.role, u.name LIMIT 500`, params);
  return rows.map((r) => ({ ...r, suspended: !!r.suspended, hub_ids: r.hub_ids ? String(r.hub_ids).split(',').map(Number) : [] }));
}

// Staff, partner and admin accounts are made here, never by sign-up. The temporary password is shown once
// and must be changed at the first login. A partner account comes with its organization, approved at once
// unless `approve` is false.
export async function createAccount(actor, body) {
  const role = String(body.role || '');
  if (!['staff', 'partner', 'admin'].includes(role)) throw bad('Choose staff, partner or admin. Residents sign up in the app.', 'bad_role');
  const name = text(body.name, 120, 'bad_name', 'the full name');
  const email = String(body.email || '').trim().toLowerCase();
  if (!emailOk(email)) throw bad('Enter a valid email.', 'bad_email');
  const phone = normalizePhone(body.phone);
  const org = role === 'partner' ? text(body.org_name, 160, 'bad_org', 'the organization name') : null;
  const kind = role === 'partner' ? String(body.kind || '') : null;
  if (role === 'partner' && !['shelter', 'school', 'ngo', 'other'].includes(kind)) throw bad('Choose the kind of organization.', 'bad_kind');
  const temp = temporaryPassword();
  const id = await withTx(async (conn) => {
    let r;
    try {
      [r] = await conn.query("INSERT INTO users (name, email, phone, password_hash, role, must_change_password) VALUES (?,?,?,?,?,1)",
        [name, email, phone, await bcrypt.hash(temp, 10), role]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw bad('Another account already uses this email or phone number.', 'account_exists');
      throw e;
    }
    if (role === 'partner') {
      const approve = body.approve !== false;
      await conn.query('INSERT INTO partners (user_id, org_name, kind, status, approved_by, approved_at) VALUES (?,?,?,?,?,?)',
        [r.insertId, org, kind, approve ? 'approved' : 'pending', approve ? actor.id : null, approve ? new Date() : null]);
    }
    await audit(actor.id, 'account_created', { entity: 'user', entityId: r.insertId, details: { role } }, conn);
    return r.insertId;
  });
  return { id, temporary_password: temp };
}

export function setSuspended(actor, userId, suspended) {
  notSelf(actor, userId, suspended ? 'suspend' : 'reinstate');
  return withTx(async (conn) => {
    const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!u) throw notFound();
    // Suspending also ends every session (token_version), so the person is out at once.
    await conn.query('UPDATE users SET suspended = ?, token_version = token_version + ? WHERE id = ?', [suspended ? 1 : 0, suspended ? 1 : 0, u.id]);
    await audit(actor.id, suspended ? 'account_suspended' : 'account_reinstated', { entity: 'user', entityId: u.id }, conn);
  });
}

// For a person standing at the hub or the office, after checking who they are.
export async function resetPassword(actor, userId) {
  notSelf(actor, userId, 'reset the password of');
  const u = await one('SELECT id FROM users WHERE id = ?', [userId]);
  if (!u) throw notFound();
  const temp = temporaryPassword();
  await q('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?', [await bcrypt.hash(temp, 10), u.id]);
  await audit(actor.id, 'password_reset', { entity: 'user', entityId: u.id });
  return { temporary_password: temp };
}

// The hubs a staff member works at (R4). Replaces the whole list.
export function setStaffHubs(actor, userId, hubIds) {
  const ids = [...new Set((Array.isArray(hubIds) ? hubIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return withTx(async (conn) => {
    const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!u) throw notFound();
    if (u.role !== 'staff') throw bad('Only staff accounts work at hubs. Admins may act at every hub.', 'not_staff');
    if (ids.length) {
      const [found] = await conn.query('SELECT id FROM hubs WHERE id IN (?)', [ids]);
      if (found.length !== ids.length) throw bad('Choose hubs from the list.', 'bad_hub');
    }
    await conn.query('DELETE FROM hub_staff WHERE user_id = ?', [u.id]);
    for (const h of ids) await conn.query('INSERT INTO hub_staff (hub_id, user_id) VALUES (?,?)', [h, u.id]);
    await audit(actor.id, 'staff_hubs_set', { entity: 'user', entityId: u.id, details: { hub_ids: ids } }, conn);
  });
}

// Deleting an account on request: the person's name and contact details go; item weights and points stay
// without a name, so the totals stay right (privacy notice, "How long we keep it").
export function deleteAccount(actor, userId) {
  notSelf(actor, userId, 'delete');
  return withTx(async (conn) => {
    const [[u]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!u) throw notFound();
    if (u.role !== 'resident') throw bad('Suspend staff, partner and admin accounts instead; their actions must stay traceable.', 'not_resident');
    if (!u.deletion_requested_at) throw bad('The person has not asked for their account to be deleted.', 'not_requested');
    await conn.query("UPDATE declarations SET status = 'cancelled' WHERE resident_id = ? AND status = 'open'", [u.id]);
    await conn.query(
      `UPDATE users SET name = 'Deleted account', email = ?, phone = NULL, student_id = NULL, password_hash = ?, suspended = 1,
              token_version = token_version + 1, deletion_requested_at = NULL WHERE id = ?`,
      [`deleted-${u.id}@deleted.invalid`, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), u.id]);
    await conn.query('DELETE FROM notifications WHERE user_id = ?', [u.id]);
    await audit(actor.id, 'account_deleted', { entity: 'user', entityId: u.id }, conn);
  });
}

// ---------- partner organizations (R2) ----------

export const listPartners = () => q(
  `SELECT p.id, p.org_name, p.kind, p.status, p.approved_at, p.created_at, u.id AS user_id, u.name AS contact_name, u.email, u.phone,
          (SELECT COUNT(*) FROM releases r WHERE r.partner_id = p.id AND r.status IN ('released','picked_up')) AS releases_received
     FROM partners p JOIN users u ON u.id = p.user_id ORDER BY FIELD(p.status, 'pending', 'approved', 'suspended'), p.org_name`);

export function setPartnerStatus(actor, partnerId, decision) {
  const status = { approve: 'approved', suspend: 'suspended' }[decision];
  if (!status) throw bad('Choose approve or suspend.', 'bad_decision');
  return withTx(async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM partners WHERE id = ? FOR UPDATE', [partnerId]);
    if (!p) throw notFound();
    notSelf(actor, p.user_id, `${decision}`);
    await conn.query('UPDATE partners SET status = ?, approved_by = IF(? = \'approved\', ?, approved_by), approved_at = IF(? = \'approved\', NOW(), approved_at) WHERE id = ?',
      [status, status, actor.id, status, p.id]);
    // Requests not handed over yet are dropped when an organization is suspended; the items go back to stock.
    if (status === 'suspended') {
      const [open] = await conn.query("SELECT id FROM releases WHERE partner_id = ? AND status = 'requested'", [p.id]);
      for (const r of open) {
        await conn.query("UPDATE releases SET status = 'cancelled' WHERE id = ?", [r.id]);
        await conn.query('DELETE FROM release_items WHERE release_id = ?', [r.id]);
      }
    }
    await audit(actor.id, status === 'approved' ? 'partner_approved' : 'partner_suspended', { entity: 'partner', entityId: p.id }, conn);
    await notify(conn, p.user_id, status === 'approved' ? 'partner_approved' : 'partner_suspended',
      status === 'approved' ? 'Your organization is approved' : 'Your organization is paused',
      status === 'approved' ? 'You can now ask the hubs for reusable items.' : 'You cannot ask for items for now. Contact CircuLink to ask why.', p.id);
  });
}

// ---------- hubs ----------

export const listHubs = () => q(
  `SELECT h.*, (SELECT COUNT(*) FROM hub_staff s WHERE s.hub_id = h.id) AS staff_count FROM hubs h
    ORDER BY FIELD(h.status, 'active', 'paused', 'closed'), h.name`);

function hubFields(body, partial) {
  const f = {};
  if (!partial || body.name !== undefined) f.name = text(body.name, 120, 'bad_name', 'the hub name');
  if (!partial || body.type !== undefined) {
    if (!HUB_TYPES.includes(body.type)) throw bad('Choose school, barangay or other.', 'bad_type');
    f.type = body.type;
  }
  if (!partial || body.address !== undefined) f.address = text(body.address, 255, 'bad_address', 'the address', 5);
  if (body.hours !== undefined) f.hours = String(body.hours || '').trim().slice(0, 120) || null;
  // A photo of the real place (empty removes it). Only files from our own upload endpoint.
  if (body.photo_url !== undefined) f.photo_url = ownPhoto(body.photo_url);
  if (body.status !== undefined) {
    if (!['active', 'paused', 'closed'].includes(body.status)) throw bad('Choose active, paused or closed.', 'bad_status');
    f.status = body.status;
  }
  return f;
}

export async function createHub(actor, body) {
  const f = hubFields(body, false);
  const keys = Object.keys(f);
  const r = await q(`INSERT INTO hubs (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => f[k]));
  await audit(actor.id, 'hub_created', { entity: 'hub', entityId: r.insertId, details: f });
  return r.insertId;
}

export async function updateHub(actor, id, body) {
  const h = await one('SELECT id FROM hubs WHERE id = ?', [id]);
  if (!h) throw notFound();
  const f = hubFields(body, true);
  const keys = Object.keys(f);
  if (keys.length) await q(`UPDATE hubs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
  // Codes for a hub that stops taking drop-offs no longer work; residents can choose another hub.
  if (f.status && f.status !== 'active') await q("UPDATE declarations SET status = 'cancelled' WHERE hub_id = ? AND status = 'open'", [id]);
  await audit(actor.id, 'hub_updated', { entity: 'hub', entityId: Number(id), details: f });
}

// ---------- recyclers (R10) ----------

export const listRecyclers = () => q('SELECT * FROM recyclers ORDER BY status, name')
  .then((rows) => rows.map((r) => ({ ...r, accredited: !!r.accredited })));

export async function saveRecycler(actor, id, body) {
  const f = {};
  if (!id || body.name !== undefined) f.name = text(body.name, 160, 'bad_name', 'the recycler name');
  if (!id || body.materials !== undefined) f.materials = text(body.materials, 255, 'bad_materials', 'what they take');
  if (body.accredited !== undefined) f.accredited = body.accredited ? 1 : 0;
  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) throw bad('Choose active or inactive.', 'bad_status');
    f.status = body.status;
  }
  const keys = Object.keys(f);
  if (!id) {
    const r = await q(`INSERT INTO recyclers (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => f[k]));
    await audit(actor.id, 'recycler_created', { entity: 'recycler', entityId: r.insertId, details: f });
    return r.insertId;
  }
  if (!(await one('SELECT id FROM recyclers WHERE id = ?', [id]))) throw notFound();
  if (keys.length) await q(`UPDATE recyclers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
  await audit(actor.id, 'recycler_updated', { entity: 'recycler', entityId: Number(id), details: f });
  return Number(id);
}

// ---------- categories ----------

export const listCategories = () => q('SELECT * FROM categories ORDER BY active DESC, name_en')
  .then((rows) => rows.map((c) => ({ ...c, rate_per_kg: Number(c.rate_per_kg), co2_per_kg: Number(c.co2_per_kg), hazardous: !!c.hazardous, food: !!c.food, active: !!c.active })));

// Limits keep a mistake (or a bad actor) from making points meaningless: at most 50 points per kg.
export const CATEGORY_LIMITS = { rate: [0, 50], co2: [0, 100] };

export async function saveCategory(actor, id, body) {
  const f = {};
  if (!id) {
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(slug)) throw bad('Use a short code of lower-case letters, like "shoes".', 'bad_slug');
    f.slug = slug;
  }
  if (!id || body.name_en !== undefined) f.name_en = text(body.name_en, 80, 'bad_name', 'the English name');
  if (!id || body.name_fil !== undefined) f.name_fil = text(body.name_fil, 80, 'bad_name', 'the Filipino name');
  if (!id || body.rate_per_kg !== undefined) f.rate_per_kg = num(body.rate_per_kg, ...CATEGORY_LIMITS.rate, 'bad_rate', 'Points per kg');
  if (!id || body.co2_per_kg !== undefined) f.co2_per_kg = num(body.co2_per_kg, ...CATEGORY_LIMITS.co2, 'bad_co2', 'kg CO2e per kg');
  for (const k of ['hazardous', 'food', 'active']) if (body[k] !== undefined) f[k] = body[k] ? 1 : 0;
  const keys = Object.keys(f);
  try {
    if (!id) {
      const r = await q(`INSERT INTO categories (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => f[k]));
      await audit(actor.id, 'category_created', { entity: 'category', entityId: r.insertId, details: f });
      return r.insertId;
    }
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw bad('A category with this code already exists.', 'duplicate');
    throw e;
  }
  const before = await one('SELECT * FROM categories WHERE id = ?', [id]);
  if (!before) throw notFound();
  if (keys.length) await q(`UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
  // The old values go into the audit row too, so a rate change can always be traced and undone.
  await audit(actor.id, 'category_updated', {
    entity: 'category', entityId: Number(id),
    details: { changes: f, before: Object.fromEntries(keys.map((k) => [k, before[k] === null ? null : String(before[k])])) },
  });
  return Number(id);
}

// ---------- the audit log (R12), read-only ----------

export async function auditLog({ entity = '', entityId = null, limit = 100, before = null } = {}) {
  const where = [];
  const params = [];
  if (entity) { where.push('a.entity = ?'); params.push(String(entity)); }
  if (entityId) { where.push('a.entity_id = ?'); params.push(Number(entityId)); }
  if (before) { where.push('a.id < ?'); params.push(Number(before)); }
  const rows = await q(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at, a.actor_id, u.name AS actor_name, u.role AS actor_role
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.id DESC LIMIT ${Math.min(500, Math.max(1, Number(limit) || 100))}`, params);
  return rows.map((r) => ({ ...r, details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details }));
}

