import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool, q, one, withTx } from '../db.js';
import { HttpError, bad, wrap } from '../errors.js';
import { authRequired, requireResident, signToken, publicUser } from '../auth.js';
import { publicUpload } from '../uploads.js';
import { PRIVACY_VERSION, privacyNotice } from '../privacy.js';
import { config } from '../config.js';
import { audit } from '../services.js';
import { normalizePhone, normalizeStudentId } from '../rules.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: config.authTriesPer15Min, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many tries from this network. Please wait a few minutes.', code: 'too_many_requests' }),
});


const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

export const PASSWORD_MIN = 8;
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < PASSWORD_MIN || p.length > 200) {
    throw bad(`Password must be at least ${PASSWORD_MIN} characters.`, 'bad_password');
  }
}

// After 5 wrong passwords for one email within 15 minutes, that email is locked for 15 minutes, whatever
// the network. Kept in memory: a restart clears it.
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();   // email -> { count, first, lockedUntil }
function loginLocked(email, now = Date.now()) {
  const f = failures.get(email);
  return !!f && f.lockedUntil > now;
}
function loginFailed(email, now = Date.now()) {
  let f = failures.get(email);
  if (!f || now - f.first > LOGIN_WINDOW_MS) f = { count: 0, first: now, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= LOGIN_MAX_FAILURES) f.lockedUntil = now + LOGIN_WINDOW_MS;
  failures.set(email, f);
  if (failures.size > 10000) for (const [k, v] of failures) if (v.lockedUntil < now && now - v.first > LOGIN_WINDOW_MS) failures.delete(k);
}

// A temporary password that is easy to read aloud and type: no 0/O or 1/l/I.
export function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => letters[crypto.randomInt(letters.length)]).join('');
}

const fresh = (id) => one('SELECT * FROM users WHERE id = ?', [id]);

// The privacy notice. Public: people read it before they sign up.
router.get('/privacy', (req, res) => res.json(privacyNotice(req.query.lang)));

// Sign-up makes a resident account only. Staff, partner and admin accounts are made by an admin.
router.post('/auth/register', limiter, wrap(async (req, res) => {
  const { name, email, password, phone, student_id: studentId, language, accept_privacy: acceptPrivacy } = req.body || {};
  if (!name || String(name).trim().length < 2) throw bad('Please enter your full name.', 'bad_name');
  if (!emailOk(email)) throw bad('Please enter a valid email.', 'bad_email');
  checkPassword(password);
  const phoneOk = normalizePhone(phone);
  if (!phoneOk) throw bad('Please enter your phone number.', 'bad_phone');
  const studentOk = normalizeStudentId(studentId);
  if (acceptPrivacy !== true) throw bad('Please read and accept the privacy notice.', 'privacy_required');
  const hash = await bcrypt.hash(password, 10);
  let r;
  try {
    [r] = await pool.query(
      `INSERT INTO users (name, email, phone, student_id, password_hash, language, privacy_version, privacy_accepted_at)
       VALUES (?,?,?,?,?,?,?, NOW())`,
      [String(name).trim().slice(0, 120), email.trim().toLowerCase(), phoneOk, studentOk, hash, language === 'fil' ? 'fil' : 'en', PRIVACY_VERSION]);
  } catch (e) {
    // The same answer whichever value is taken, so sign-up cannot be used to find out who is a member.
    if (e.code === 'ER_DUP_ENTRY') throw bad('We could not create an account with these details. If you signed up before, log in instead.', 'signup_failed');
    throw e;
  }
  const user = await fresh(r.insertId);
  await audit(user.id, 'account_created', { entity: 'user', entityId: user.id });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/auth/login', limiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const key = String(email || '').trim().toLowerCase();
  if (loginLocked(key)) {
    throw new HttpError(429, 'Too many wrong passwords. Wait 15 minutes, or ask an admin to reset your password.', 'too_many_attempts');
  }
  const user = await one('SELECT * FROM users WHERE email = ?', [key]);
  const ok = user && (await bcrypt.compare(String(password || ''), user.password_hash));
  if (!ok) {
    loginFailed(key);
    throw new HttpError(401, 'Wrong email or password.', 'bad_login');
  }
  failures.delete(key);
  if (user.suspended) throw bad('This account is suspended. Please contact CircuLink support at your hub.', 'suspended');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', authRequired, wrap(async (req, res) => {
  const unread = await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  // A resident who keeps using the app gets a fresh 14-day token once a day.
  const renew = req.user.role === 'resident' && Date.now() / 1000 - (req.tokenIssuedAt || 0) > 24 * 3600;
  res.json(publicUser(req.user, { unread_notifications: unread.n, ...(renew ? { token: signToken(req.user) } : {}) }));
}));

// Logging out ends every session of this account (all devices), not just this one.
router.post('/auth/logout', authRequired, wrap(async (req, res) => {
  await q('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
}));

// Changing the password needs the current one. Other sessions end; this device gets a new token.
router.post('/me/password', authRequired, wrap(async (req, res) => {
  const { current, new_password: next } = req.body || {};
  if (!(await bcrypt.compare(String(current || ''), req.user.password_hash))) throw bad('Your current password is not right.', 'wrong_password');
  checkPassword(next);
  await q('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
    [await bcrypt.hash(next, 10), req.user.id]);
  await audit(req.user.id, 'password_changed', { entity: 'user', entityId: req.user.id });
  const user = await fresh(req.user.id);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// Name, phone and language. A sent field is saved; fields that are not sent stay as they are.
// The student ID is fixed after sign-up (one account per student ID), so only an admin can change it.
router.patch('/me', authRequired, wrap(async (req, res) => {
  const { name, phone, language } = req.body || {};
  if (name !== undefined && String(name).trim().length < 2) throw bad('Please enter your full name.', 'bad_name');
  const fields = {};
  if (name !== undefined) fields.name = String(name).trim().slice(0, 120);
  if (phone !== undefined) {
    fields.phone = normalizePhone(phone);
    if (!fields.phone && req.user.role === 'resident') throw bad('Please enter your phone number.', 'bad_phone');
  }
  if (['en', 'fil'].includes(language)) fields.language = language;
  const keys = Object.keys(fields);
  try {
    if (keys.length) await q(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), req.user.id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw bad('That phone number belongs to another account.', 'phone_taken');
    throw e;
  }
  res.json(publicUser(await fresh(req.user.id)));
}));

// Agreeing to the current privacy notice (after it changed).
router.post('/me/privacy', authRequired, wrap(async (req, res) => {
  await q('UPDATE users SET privacy_version = ?, privacy_accepted_at = NOW() WHERE id = ?', [PRIVACY_VERSION, req.user.id]);
  res.json(publicUser(await fresh(req.user.id)));
}));

// "My data": everything CircuLink holds about the person, in one download.
router.get('/me/data', authRequired, wrap(async (req, res) => {
  const id = req.user.id;
  const u = req.user;
  res.json({
    exported_at: new Date().toISOString(),
    profile: {
      name: u.name, email: u.email, phone: u.phone, student_id: u.student_id, language: u.language, role: u.role, joined: u.created_at,
      privacy_version: u.privacy_version, privacy_accepted_at: u.privacy_accepted_at, deletion_requested_at: u.deletion_requested_at,
    },
    declarations: await q(
      `SELECT d.id, h.name AS hub, d.status, d.created_at, d.received_at FROM declarations d JOIN hubs h ON h.id = d.hub_id
        WHERE d.resident_id = ? ORDER BY d.id`, [id]),
    items: await q(
      `SELECT i.id, c.name_en AS category, i.description, i.weight_kg, i.outcome, i.state, i.processed_at
         FROM items i JOIN declarations d ON d.id = i.declaration_id JOIN categories c ON c.id = i.category_id
        WHERE d.resident_id = ? ORDER BY i.id`, [id]),
    points: await q('SELECT item_id, points, status, reason, created_at, decided_at FROM points_ledger WHERE user_id = ? ORDER BY id', [id]),
    notifications: await q('SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 200', [id]),
  });
}));

// Asking for the account to be deleted. An admin does it from the portal.
router.post('/me/delete-request', authRequired, requireResident, wrap(async (req, res) => {
  await withTx(async (conn) => {
    await conn.query('UPDATE users SET deletion_requested_at = NOW() WHERE id = ?', [req.user.id]);
    const reason = String(req.body?.reason || '').trim().slice(0, 200);
    await audit(req.user.id, 'deletion_requested', { entity: 'user', entityId: req.user.id, details: reason ? { reason } : null }, conn);
  });
  res.json(publicUser(await fresh(req.user.id)));
}));

router.delete('/me/delete-request', authRequired, wrap(async (req, res) => {
  await q('UPDATE users SET deletion_requested_at = NULL WHERE id = ?', [req.user.id]);
  await audit(req.user.id, 'deletion_cancelled', { entity: 'user', entityId: req.user.id });
  res.json(publicUser(await fresh(req.user.id)));
}));

// Public item photos (taken by staff when they sort an item).
router.post('/uploads', authRequired, publicUpload, wrap(async (req, res) => {
  if (!req.file) throw bad('Choose a photo first.', 'no_file');
  res.status(201).json({ url: `/uploads/public/${req.file.filename}` });
}));

export default router;
