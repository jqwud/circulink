import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool, q, one, withTx, purokNames } from '../db.js';
import { HttpError, bad, wrap } from '../errors.js';
import { authRequired, signToken, publicUser } from '../auth.js';
import { publicUpload, privateUpload, removePrivateFile } from '../uploads.js';
import { PRIVACY_VERSION, privacyNotice } from '../privacy.js';
import { audit, notify } from '../services.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many tries from this network. Please wait a few minutes.', code: 'too_many_requests' }),
});

// A purok must be one the barangay lists (empty is allowed: it is optional). Phone: digits, spaces, + and -.
async function checkPurok(p) {
  if (p === undefined || p === null || p === '') return null;
  const names = await purokNames();
  if (names.length && !names.includes(String(p).trim())) throw bad('Choose a purok from the list.', 'bad_purok');
  return String(p).trim();
}
function checkPhone(p) {
  const v = String(p ?? '').trim();
  if (!v) return null;
  if (!/^\+?[0-9][0-9 -]{5,18}[0-9]$/.test(v)) throw bad('Enter a phone number with digits only, like 0917 123 4567.', 'bad_phone');
  return v;
}

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

export const PASSWORD_MIN = 8;
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < PASSWORD_MIN || p.length > 200) {
    throw bad(`Password must be at least ${PASSWORD_MIN} characters.`, 'bad_password');
  }
}

// After 5 wrong passwords for one email within 15 minutes, that email is locked for 15 minutes, whatever
// the network. Kept in memory: a restart clears it, which is fine for one barangay server.
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
function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => letters[crypto.randomInt(letters.length)]).join('');
}

// The privacy notice. Public: people read it before they sign up.
router.get('/privacy', (req, res) => res.json(privacyNotice(req.query.lang)));

router.post('/auth/register', limiter, wrap(async (req, res) => {
  const { name, email, password, phone, purok, language, accept_privacy: acceptPrivacy } = req.body || {};
  if (!name || name.trim().length < 2) throw bad('Please enter your full name.', 'bad_name');
  if (!emailOk(email)) throw bad('Please enter a valid email.', 'bad_email');
  checkPassword(password);
  const purokOk = await checkPurok(purok);
  const phoneOk = checkPhone(phone);
  if (acceptPrivacy !== true) throw bad('Please read and accept the privacy notice.', 'privacy_required');
  const hash = await bcrypt.hash(password, 10);
  let r;
  try {
    [r] = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, purok, language, privacy_version, privacy_accepted_at)
       VALUES (?,?,?,?,?,?,?, NOW())`,
      [name.trim(), email.trim().toLowerCase(), phoneOk, hash, purokOk, language === 'en' ? 'en' : 'fil', PRIVACY_VERSION]);
  } catch (e) {
    // The same answer whether or not the email is taken, so sign-up cannot be used to find out who is a member.
    if (e.code === 'ER_DUP_ENTRY') throw bad('We could not create an account with these details. If you signed up before, log in or ask the barangay to reset your password.', 'signup_failed');
    throw e;
  }
  const user = await one('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/auth/login', limiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const key = String(email || '').trim().toLowerCase();
  if (loginLocked(key)) {
    throw new HttpError(429, 'Too many wrong passwords. Wait 15 minutes, or ask the barangay to reset your password.', 'too_many_attempts');
  }
  const user = await one('SELECT * FROM users WHERE email = ?', [key]);
  const ok = user && (await bcrypt.compare(String(password || ''), user.password_hash));
  if (!ok) {
    loginFailed(key);
    throw bad('Wrong email or password.', 'bad_login');
  }
  failures.delete(key);
  if (user.suspended) throw bad('This account is suspended. Please contact the barangay.', 'suspended');
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
  const fresh = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  await audit(req.user.id, 'password_changed', `user #${req.user.id}`);
  res.json({ token: signToken(fresh), user: publicUser(fresh) });
}));

export { temporaryPassword };

router.patch('/me', authRequired, wrap(async (req, res) => {
  const { name, phone, purok, language } = req.body || {};
  if (name !== undefined && String(name).trim().length < 2) throw bad('Please enter your full name.', 'bad_name');
  // A field that is sent is saved; an empty phone clears it. Fields that are not sent stay as they are.
  const fields = {};
  if (name !== undefined) fields.name = String(name).trim().slice(0, 120);
  if (phone !== undefined) fields.phone = checkPhone(phone);
  if (purok !== undefined && purok !== '') fields.purok = await checkPurok(purok);
  if (['en', 'fil'].includes(language)) fields.language = language;
  const keys = Object.keys(fields);
  if (keys.length) await q(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), req.user.id]);
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

// Agreeing to the current privacy notice (people who joined before it existed, or after it changed).
router.post('/me/privacy', authRequired, wrap(async (req, res) => {
  await q('UPDATE users SET privacy_version = ?, privacy_accepted_at = NOW() WHERE id = ?', [PRIVACY_VERSION, req.user.id]);
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

// Agreeing that barangay staff may view the ID photo. Needed before the first ID upload.
router.post('/me/id-consent', authRequired, wrap(async (req, res) => {
  await q('UPDATE users SET id_consent_at = NOW() WHERE id = ?', [req.user.id]);
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

// "My data": everything Hiraman holds about the person, in one download. Other people appear by first name only.
router.get('/me/data', authRequired, wrap(async (req, res) => {
  const id = req.user.id;
  const u = req.user;
  const first = "SUBSTRING_INDEX(%s, ' ', 1)";
  res.json({
    exported_at: new Date().toISOString(),
    profile: {
      name: u.name, email: u.email, phone: u.phone, purok: u.purok, language: u.language, role: u.role,
      verification_status: u.verification_status, credits: u.credits, joined: u.created_at, has_id_photo: !!u.id_photo_path,
      privacy_version: u.privacy_version, privacy_accepted_at: u.privacy_accepted_at, id_consent_at: u.id_consent_at,
      deletion_requested_at: u.deletion_requested_at,
    },
    items: await q('SELECT id, title, description, item_condition, tier, status, created_at FROM items WHERE owner_id = ? ORDER BY id', [id]),
    requests_as_borrower: await q(
      `SELECT r.id, i.title AS item, ${first.replace('%s', 'o.name')} AS owner, r.start_date, r.end_date, r.status, r.on_time, r.created_at
         FROM requests r JOIN items i ON i.id = r.item_id LEFT JOIN users o ON o.id = i.owner_id WHERE r.borrower_id = ? ORDER BY r.id`, [id]),
    requests_for_my_items: await q(
      `SELECT r.id, i.title AS item, ${first.replace('%s', 'b.name')} AS borrower, r.start_date, r.end_date, r.status, r.created_at
         FROM requests r JOIN items i ON i.id = r.item_id JOIN users b ON b.id = r.borrower_id WHERE i.owner_id = ? ORDER BY r.id`, [id]),
    credit_history: await q('SELECT amount, reason, request_id, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id', [id]),
    checkins: await q(
      'SELECT c.request_id, c.day, c.answer, c.note FROM request_checkins c JOIN requests r ON r.id = c.request_id WHERE r.borrower_id = ? ORDER BY c.id', [id]),
    messages_sent: await q('SELECT request_id, body, created_at FROM request_messages WHERE sender_id = ? ORDER BY id', [id]),
    ratings_given: await q('SELECT request_id, stars, comment, created_at FROM ratings WHERE rater_id = ? ORDER BY id', [id]),
    ratings_received: await q('SELECT request_id, stars, comment, created_at FROM ratings WHERE ratee_id = ? ORDER BY id', [id]),
    reports_filed: await q('SELECT target_type, reason, details, status, outcome, created_at FROM reports WHERE reporter_id = ? ORDER BY id', [id]),
    wanted_posts: await q('SELECT title, details, needed_by, status, created_at FROM wanted_posts WHERE user_id = ? ORDER BY id', [id]),
    survey_answers: await q(
      'SELECT s.request_id, s.would_have_bought FROM impact_surveys s JOIN requests r ON r.id = s.request_id WHERE r.borrower_id = ?', [id]),
    notifications: await q('SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 200', [id]),
  });
}));

// Asking for the account to be deleted. An admin does it from the portal once no loan is active.
router.post('/me/delete-request', authRequired, wrap(async (req, res) => {
  if (req.user.role !== 'resident') throw bad('Staff accounts are managed by an admin.', 'bad_state');
  await withTx(async (conn) => {
    await conn.query('UPDATE users SET deletion_requested_at = NOW() WHERE id = ?', [req.user.id]);
    const reason = String(req.body?.reason || '').trim().slice(0, 200);
    await audit(req.user.id, 'deletion_requested', `user #${req.user.id}${reason ? `: ${reason}` : ''}`, conn);
  });
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

router.delete('/me/delete-request', authRequired, wrap(async (req, res) => {
  await q('UPDATE users SET deletion_requested_at = NULL WHERE id = ?', [req.user.id]);
  await audit(req.user.id, 'deletion_cancelled', `user #${req.user.id}`);
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

// Public item photos (listings, handover and return photos).
router.post('/uploads', authRequired, publicUpload, wrap(async (req, res) => {
  if (!req.file) throw bad('Choose a photo first.', 'no_file');
  res.status(201).json({ url: `/uploads/public/${req.file.filename}` });
}));

// ID photo: stored privately. Only LGU staff can view it, through an authenticated endpoint.
router.post('/me/id-photo', authRequired, privateUpload, wrap(async (req, res) => {
  if (!req.file) throw bad('Choose a photo of your ID.', 'no_file');
  if (req.user.role !== 'resident') {
    removePrivateFile(req.file.filename);
    throw bad('Staff accounts do not need verification.', 'bad_state');
  }
  if (!req.user.id_consent_at) {
    removePrivateFile(req.file.filename);
    throw bad('Please agree that barangay staff may view your ID first.', 'id_consent_required');
  }
  await q("UPDATE users SET id_photo_path = ?, verification_status = 'pending', reject_reason = NULL WHERE id = ?", [req.file.filename, req.user.id]);
  // Keep only the newest ID photo: the old one is personal data we no longer need.
  if (req.user.id_photo_path && req.user.id_photo_path !== req.file.filename) removePrivateFile(req.user.id_photo_path);
  const staff = await q("SELECT id FROM users WHERE role IN ('lgu_staff','lgu_admin')");
  for (const s of staff) {
    await notify(pool, s.id, 'verification_new', `${req.user.name} sent an ID for verification`, null, req.user.id, { name: req.user.name });
  }
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

export default router;
