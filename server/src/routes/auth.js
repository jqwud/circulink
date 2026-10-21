import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool, q, one } from '../db.js';
import { bad, wrap } from '../errors.js';
import { authRequired, signToken, publicUser } from '../auth.js';
import { publicUpload, privateUpload, removePrivateFile } from '../uploads.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

router.post('/auth/register', limiter, wrap(async (req, res) => {
  const { name, email, password, phone, purok, language } = req.body || {};
  if (!name || name.trim().length < 2) throw bad('Please enter your full name.', 'bad_name');
  if (!emailOk(email)) throw bad('Please enter a valid email.', 'bad_email');
  if (!password || password.length < 6) throw bad('Password must be at least 6 characters.', 'bad_password');
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query(
    'INSERT INTO users (name, email, phone, password_hash, purok, language) VALUES (?,?,?,?,?,?)',
    [name.trim(), email.trim().toLowerCase(), phone || null, hash, purok || null, language === 'en' ? 'en' : 'fil']);
  const user = await one('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/auth/login', limiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await one('SELECT * FROM users WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  const ok = user && (await bcrypt.compare(String(password || ''), user.password_hash));
  if (!ok) throw bad('Wrong email or password.', 'bad_login');
  if (user.suspended) throw bad('This account is suspended. Please contact the barangay.', 'suspended');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', authRequired, wrap(async (req, res) => {
  const unread = await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json(publicUser(req.user, { unread_notifications: unread.n }));
}));

router.patch('/me', authRequired, wrap(async (req, res) => {
  const { name, phone, purok, language } = req.body || {};
  await q('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), purok = COALESCE(?, purok), language = COALESCE(?, language) WHERE id = ?',
    [name || null, phone || null, purok || null, ['en', 'fil'].includes(language) ? language : null, req.user.id]);
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
  await q("UPDATE users SET id_photo_path = ?, verification_status = 'pending', reject_reason = NULL WHERE id = ?", [req.file.filename, req.user.id]);
  // Keep only the newest ID photo: the old one is personal data we no longer need.
  if (req.user.id_photo_path && req.user.id_photo_path !== req.file.filename) removePrivateFile(req.user.id_photo_path);
  const staff = await q("SELECT id FROM users WHERE role IN ('lgu_staff','lgu_admin')");
  for (const s of staff) {
    await q('INSERT INTO notifications (user_id, type, title, body, ref_id) VALUES (?,?,?,?,?)',
      [s.id, 'verification_new', `${req.user.name} sent an ID for verification`, null, req.user.id]);
  }
  res.json(publicUser(await one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

export default router;
