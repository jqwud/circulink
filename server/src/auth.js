import jwt from 'jsonwebtoken';
import { PRIVACY_VERSION } from './privacy.js';
import { config } from './config.js';
import { one } from './db.js';
import { HttpError, forbidden } from './errors.js';

// Portal sessions (staff, partners, admins) last a working day; residents stay logged in for 14 days,
// renewed while they use the app (GET /me). `v` is the account's token_version: raising it ends older sessions.
export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, v: user.token_version || 0 }, config.jwtSecret, { expiresIn: user.role === 'resident' ? '14d' : '12h' });

// Loads the user fresh on every call, so a suspension or role change takes effect at once.
export async function authRequired(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Please log in.', 'auth_required');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Your session expired. Please log in again.', 'auth_expired');
    }
    const user = await one('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user) throw new HttpError(401, 'Account not found.', 'auth_required');
    if ((payload.v || 0) !== (user.token_version || 0)) throw new HttpError(401, 'Your session ended. Please log in again.', 'auth_expired');
    req.tokenIssuedAt = payload.iat;
    if (user.suspended) throw forbidden('This account is suspended. Please contact CircuLink support at your hub.', 'suspended');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

const allow = (roles, message, code) => (req, _res, next) => (roles.includes(req.user.role) ? next() : next(forbidden(message, code)));

export const requireResident = allow(['resident'], 'Residents only.', 'resident_only');
export const requireStaff = allow(['staff', 'admin'], 'Hub staff only.', 'staff_only');
export const requirePartner = allow(['partner'], 'Partner organizations only.', 'partner_only');
export const requireAdmin = allow(['admin'], 'Admins only.', 'admin_only');

// What the apps may see about the logged-in user. Never the password hash.
export const publicUser = (u, extra = {}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  student_id: u.student_id,
  role: u.role,
  language: u.language,
  privacy_ok: u.privacy_version === PRIVACY_VERSION,
  deletion_requested: !!u.deletion_requested_at,
  must_change_password: !!u.must_change_password,
  ...extra,
});
