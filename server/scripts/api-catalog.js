// Every API route, described once. `npm run docs:api` turns this into docs/openapi.json, and
// test/api-docs.test.js fails when a route exists that is not described here (or the other way round).
// Access: public (no login), user (any logged-in account), resident, staff (staff or admin), partner, admin.
// Fields: "name" is optional, "name*" is required. Every error answers { error, code } with a code from `errors`.

const R = (method, path, access, summary, extra = {}) => ({ method, path, access, summary, ...extra });

export const TAGS = {
  account: 'Sign-up, login, profile and privacy',
  reference: 'Hubs, categories, rule numbers, photos and notifications',
};

export const CATALOG = [
  R('GET', '/health', 'public', 'Is the API up, and can it reach the database?', { tag: 'account', ok: 200, errors: ['503 when the database is down'] }),
  R('GET', '/privacy', 'public', 'The privacy notice in English or Filipino', { tag: 'account', query: ['lang'] }),
  R('POST', '/auth/register', 'public', 'Create a resident account (one per email, phone and student ID; privacy notice must be accepted)', { tag: 'account', ok: 201, body: ['name*', 'email*', 'password*', 'phone*', 'student_id', 'language', 'accept_privacy*'], errors: ['bad_name', 'bad_email', 'bad_password', 'bad_phone', 'bad_student_id', 'privacy_required', 'signup_failed', 'too_many_requests'] }),
  R('POST', '/auth/login', 'public', 'Log in; returns a token and the user', { tag: 'account', body: ['email*', 'password*'], errors: ['401 bad_login', 'suspended', '429 too_many_attempts', 'too_many_requests'] }),
  R('GET', '/me', 'user', 'The logged-in account (with a renewed token once a day for residents)', { tag: 'account' }),
  R('POST', '/auth/logout', 'user', 'Log out: ends every session of this account', { tag: 'account' }),
  R('POST', '/me/password', 'user', 'Change the password (other sessions end; a new token is returned)', { tag: 'account', body: ['current*', 'new_password*'], errors: ['wrong_password', 'bad_password'] }),
  R('PATCH', '/me', 'user', 'Change name, phone or language', { tag: 'account', body: ['name', 'phone', 'language'], errors: ['bad_name', 'bad_phone', 'phone_taken'] }),
  R('POST', '/me/privacy', 'user', 'Agree to the current privacy notice', { tag: 'account' }),
  R('GET', '/me/data', 'user', 'Everything CircuLink holds about this person ("My data")', { tag: 'account' }),
  R('POST', '/me/delete-request', 'resident', 'Ask for the account to be deleted', { tag: 'account', body: ['reason'] }),
  R('DELETE', '/me/delete-request', 'user', 'Take back a deletion request', { tag: 'account' }),
  R('POST', '/uploads', 'user', 'Upload a public photo (JPG, PNG or WEBP, at most 5 MB); returns its url', { tag: 'reference', ok: 201, upload: true, errors: ['no_file', 'bad_file_type', 'file_too_large'] }),
  R('GET', '/hubs', 'public', 'Active drop-off hubs', { tag: 'reference' }),
  R('GET', '/meta', 'user', 'Categories, hubs, outcomes, badge tiers and the rule numbers', { tag: 'reference' }),
  R('GET', '/notifications', 'user', 'My notifications, newest first (paged)', { tag: 'reference', query: ['limit', 'offset'] }),
  R('POST', '/notifications/read-all', 'user', 'Mark all my notifications read', { tag: 'reference' }),
  R('POST', '/notifications/{id}/read', 'user', 'Mark one notification read', { tag: 'reference', errors: ['not_found'] }),
];
