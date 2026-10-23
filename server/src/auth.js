import jwt from 'jsonwebtoken';
import { PRIVACY_VERSION } from './privacy.js';
import { config } from './config.js';
import { one } from './db.js';
import { HttpError, forbidden } from './errors.js';

// Staff sessions last a working day (shared computers at the hall); residents stay logged in for 14 days,
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
    if (user.suspended) throw forbidden('This account is suspended. Please contact the barangay.', 'suspended');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export const requireApproved = (req, _res, next) =>
  req.user.verification_status === 'approved' || req.user.role !== 'resident'
    ? next()
    : next(forbidden('Your account must be verified by the barangay first.', 'not_verified'));

export const requireStaff = (req, _res, next) =>
  ['lgu_staff', 'lgu_admin'].includes(req.user.role)
    ? next()
    : next(forbidden('LGU staff only.', 'staff_only'));

export const requireAdmin = (req, _res, next) =>
  req.user.role === 'lgu_admin' ? next() : next(forbidden('LGU admin only.', 'admin_only'));

// What the apps may see about the logged-in user. Never the password hash or the ID photo path.
export const publicUser = (u, extra = {}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  purok: u.purok,
  verification_status: u.verification_status,
  reject_reason: u.reject_reason,
  credits: u.credits,
  language: u.language,
  has_id_photo: !!u.id_photo_path,
  privacy_ok: u.privacy_version === PRIVACY_VERSION,
  id_consent: !!u.id_consent_at,
  deletion_requested: !!u.deletion_requested_at,
  lender_terms_accepted: !!u.lender_terms_accepted_at,
  shelf_paused_until: u.shelf_paused_until || null,
  must_change_password: !!u.must_change_password,
  ...extra,
});
