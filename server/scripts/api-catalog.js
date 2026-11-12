// Every API route, described once. `npm run docs:api` turns this into docs/openapi.json, and
// test/api-docs.test.js fails when a route exists that is not described here (or the other way round).
// Access: public (no login), user (any logged-in account), resident, staff (staff or admin), partner, admin.
// Fields: "name" is optional, "name*" is required. Every error answers { error, code } with a code from `errors`.

const R = (method, path, access, summary, extra = {}) => ({ method, path, access, summary, ...extra });

export const TAGS = {
  account: 'Sign-up, login, profile and privacy',
  reference: 'Hubs, categories, rule numbers, photos and notifications',
  dropoffs: 'Residents declare items and get a drop-off code',
  staff: 'Hub staff check codes in, then weigh and sort items (the only place points are created)',
  partners: 'Approved partner organizations ask for reusable stock and confirm pickups',
  stock: 'Hub staff hand stock to partners, move items after sorting, and send recycle batches (items become final here)',
  admin: 'Admins review flagged drop-offs',
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
  R('POST', '/declarations', 'resident', 'Declare items for a hub; returns the drop-off with its 6-character code (at most 3 open)', { tag: 'dropoffs', ok: 201, body: ['hub_id*', 'items*', 'note'], errors: ['too_many_open', 'bad_hub', 'bad_items', 'bad_category'] }),
  R('GET', '/declarations', 'resident', 'My drop-offs, newest first, with each item, its outcome and its points', { tag: 'dropoffs' }),
  R('GET', '/declarations/{id}', 'resident', 'One of my drop-offs', { tag: 'dropoffs', errors: ['not_found'] }),
  R('DELETE', '/declarations/{id}', 'resident', 'Cancel an open drop-off', { tag: 'dropoffs', errors: ['not_found', 'bad_state'] }),
  R('GET', '/me/impact', 'user', 'kg kept in use, estimated CO2e avoided, points (confirmed and pending) and badge', { tag: 'dropoffs' }),
  R('GET', '/staff/hubs', 'staff', 'The hubs I work at (every active hub for an admin)', { tag: 'staff' }),
  R('GET', '/staff/queue', 'staff', 'Checked-in drop-offs at my hubs with items still to sort', { tag: 'staff' }),
  R('POST', '/staff/checkin', 'staff', 'Check a drop-off in by its code (works once, only at its hub, never your own)', { tag: 'staff', body: ['code*'], errors: ['bad_code', 'code_used', 'code_expired', 'not_your_hub', 'own_drop_off', '429 too_many_codes'] }),
  R('GET', '/staff/declarations/{id}', 'staff', 'A drop-off at my hub, with the resident name', { tag: 'staff', errors: ['not_found', 'not_your_hub'] }),
  R('POST', '/staff/declarations/{id}/items', 'staff', 'Add an item the resident brought but did not list', { tag: 'staff', ok: 201, body: ['category_id*', 'description'], errors: ['not_received', 'bad_category', 'bad_items', 'not_your_hub', 'own_drop_off'] }),
  R('POST', '/staff/items/{id}/sort', 'staff', 'Weigh and sort one item: reuse, repair, recycle or reject. Creates its points (pending until final)', { tag: 'staff', body: ['weight_kg*', 'outcome*', 'category_id', 'expiry_date', 'description', 'photo_url'], errors: ['bad_weight', 'bad_outcome', 'bad_state', 'bad_category', 'food_outcome', 'food_expiring', 'not_received', 'not_your_hub', 'own_drop_off', 'bad_photo'] }),
  R('GET', '/admin/flags', 'admin', 'Flagged drop-offs (open, cleared or upheld)', { tag: 'admin', query: ['status'] }),
  R('POST', '/admin/flags/{id}/{decision}', 'admin', 'clear (points go on) or uphold (points of that drop-off are cancelled)', { tag: 'admin', errors: ['bad_decision', 'bad_state', 'not_found', 'own_drop_off'] }),
  R('GET', '/stock', 'partner', 'Reusable items in stock at active hubs (never who gave them); food only while fresh', { tag: 'partners', query: ['hub_id', 'category_id'], errors: ['partner_only', 'partner_not_approved'] }),
  R('POST', '/releases', 'partner', 'Ask a hub for stock items (one hub per request)', { tag: 'partners', ok: 201, body: ['hub_id*', 'item_ids*', 'note'], errors: ['partner_not_approved', 'bad_items', 'mixed_hubs', 'not_in_stock', 'already_requested', 'food_expiring'] }),
  R('GET', '/releases', 'partner', 'My organization’s requests, newest first', { tag: 'partners', errors: ['partner_only'] }),
  R('DELETE', '/releases/{id}', 'partner', 'Take back a request the hub has not handed over yet', { tag: 'partners', errors: ['not_found', 'bad_state'] }),
  R('POST', '/releases/{id}/picked-up', 'partner', 'Confirm the handed-over items arrived', { tag: 'partners', errors: ['not_found', 'bad_state'] }),
  R('GET', '/staff/stock', 'staff', 'Items at my hubs that are not final yet (stock, repair, recycling)', { tag: 'stock' }),
  R('GET', '/staff/releases', 'staff', 'Partner requests at my hubs', { tag: 'stock', query: ['status'] }),
  R('POST', '/staff/releases/{id}/hand-over', 'staff', 'Hand the items to the partner: they become final and their points are confirmed', { tag: 'stock', errors: ['not_found', 'bad_state', 'not_your_hub', 'partner_not_approved', 'own_release', 'food_expiring'] }),
  R('POST', '/staff/releases/{id}/decline', 'staff', 'Decline a request with a reason; the items are free again', { tag: 'stock', body: ['reason*'], errors: ['reason_required', 'not_found', 'bad_state', 'not_your_hub'] }),
  R('POST', '/staff/items/{id}/move', 'staff', 'Move a sorted item (repair done, spoiled, ...); its points can only go down', { tag: 'stock', body: ['to*'], errors: ['bad_state', 'item_busy', 'points_locked', 'not_your_hub', 'not_found'] }),
  R('GET', '/staff/recyclers', 'staff', 'Active recyclers, and which are accredited for e-waste and batteries', { tag: 'stock' }),
  R('GET', '/staff/recycle-batches', 'staff', 'Recycle batches at my hubs', { tag: 'stock' }),
  R('POST', '/staff/recycle-batches', 'staff', 'Put items sorted for recycling into a batch for one recycler', { tag: 'stock', ok: 201, body: ['hub_id*', 'recycler_id*', 'item_ids*'], errors: ['bad_recycler', 'bad_items', 'mixed_hubs', 'bad_state', 'item_busy', 'recycler_not_accredited', 'not_your_hub'] }),
  R('POST', '/staff/recycle-batches/{id}/send', 'staff', 'The batch leaves the hub: its items are recycled and their points confirmed', { tag: 'stock', errors: ['not_found', 'bad_state', 'recycler_not_accredited', 'not_your_hub'] }),
];
