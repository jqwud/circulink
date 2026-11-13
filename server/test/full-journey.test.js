// The complete test case (docs/TEST_CASES.md): one story from sign-up to the monthly report, over real HTTP,
// with the security checks a well-known website makes at each point: screening what people type at sign-up,
// never saying who has an account, sessions that really end, and every person seeing only what is theirs.
// The numbers TC-.. match the table in docs/TEST_CASES.md.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer } from './helpers/api.js';

let s; let admin; let staff; let staff2; let partner; let partner2; let ana;
let hubSchool; const cat = {}; const recycler = {};
// The new resident this story follows.
const dina = { name: 'Dina Villanueva', email: 'dina.v@example.com', password: 'tahimik-na-ilog-42', phone: '0919 555 0101', student_id: '2024-00789', accept_privacy: true };
let dinaToken; let dinaId; let drop; let jackets; let phone; let toy; let release;

const signUp = (changes) => s.api('POST', '/auth/register', null, { ...dina, email: `x${Math.random().toString(36).slice(2, 9)}@example.com`, phone: `0918${String(Math.random()).slice(2, 9)}`, student_id: undefined, ...changes });
const login = (email, password) => s.api('POST', '/auth/login', null, { email, password });
const ledger = (itemId) => one('SELECT points, status FROM points_ledger WHERE item_id = ?', [itemId]);

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [admin, staff, staff2, partner, partner2, ana] = await Promise.all(['admin', 'staff', 'staff2', 'partner', 'partner2', 'ana'].map((w) => s.login(w)));
  hubSchool = (await one("SELECT id FROM hubs WHERE type = 'school'")).id;
  for (const c of await q('SELECT id, slug FROM categories')) cat[c.slug] = c.id;
  for (const r of await q('SELECT id, accredited FROM recyclers')) recycler[r.accredited ? 'certified' : 'junkShop'] = r.id;
});
after(async () => { await s.close(); await pool.end(); });

describe('1. Sign-up screening', () => {
  test('TC-01 every field is checked before an account exists', async () => {
    assert.equal((await signUp({ accept_privacy: false })).json.code, 'privacy_required');
    assert.equal((await signUp({ email: 'not-an-email' })).json.code, 'bad_email');
    assert.equal((await signUp({ email: 'a@b.c<script>' })).json.code, 'bad_email');
    assert.equal((await signUp({ phone: 'call me' })).json.code, 'bad_phone');
    assert.equal((await signUp({ phone: '' })).json.code, 'bad_phone');
    assert.equal((await signUp({ student_id: 'x' })).json.code, 'bad_student_id');
    assert.equal((await signUp({ name: 'D' })).json.code, 'bad_name');
  });

  test('TC-02 a name cannot carry a link, markup or a message', async () => {
    for (const name of ['<script>alert(1)</script>', 'Visit http://win-prizes.example', 'Dina 4 President!!!', "Robert'); DROP TABLE users;--"]) {
      assert.equal((await signUp({ name })).json.code, 'bad_name', name);
    }
    for (const name of ['María Niña Dela Peña', "Juan D'Angelo Jr.", 'Anne-Marie Santos, RN']) {
      assert.equal((await signUp({ name })).status, 201, name);
    }
  });

  test('TC-03 weak passwords are refused: short, common, repeated, or made of your own details', async () => {
    assert.equal((await signUp({ password: 'short1' })).json.code, 'bad_password');
    for (const password of ['password123', 'Qwerty123', '12345678', 'aaaaaaaaaa', 'circulink123']) {
      assert.equal((await signUp({ password })).json.code, 'weak_password', password);
    }
    assert.equal((await signUp({ email: 'longlocalpart@example.com', password: 'longlocalpart' })).json.code, 'weak_password');
    assert.equal((await signUp({ phone: '0917 222 3333', password: '09172223333' })).json.code, 'weak_password');
    assert.equal((await signUp({ name: 'Maria Clara', password: 'mariaclara' })).json.code, 'weak_password');
  });

  test('TC-04 a good sign-up makes a resident, and the answer holds no secrets', async () => {
    const r = await s.api('POST', '/auth/register', null, { ...dina, role: 'admin', suspended: 0, points: 9999 });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.role, 'resident', 'a role cannot be chosen');
    assert.equal(r.json.user.email, dina.email);
    const text = JSON.stringify(r.json);
    for (const secret of ['password_hash', 'token_version', '$2a$', '$2b$', dina.password]) assert.ok(!text.includes(secret), secret);
    dinaToken = r.json.token;
    dinaId = r.json.user.id;
    const row = await one('SELECT password_hash FROM users WHERE id = ?', [dinaId]);
    assert.match(row.password_hash, /^\$2[ab]\$10\$/, 'the password is stored only as a bcrypt hash');
  });

  test('TC-05 one account per person, and sign-up never says which detail is taken', async () => {
    const sameEmail = await signUp({ email: 'DINA.V@example.com' });
    const samePhone = await signUp({ phone: '+63 919 555 0101' });
    const sameId = await signUp({ student_id: '2024-00789' });
    for (const r of [sameEmail, samePhone, sameId]) {
      assert.equal(r.status, 400);
      assert.equal(r.json.code, 'signup_failed');
      assert.equal(r.json.error, sameEmail.json.error, 'the same words for each');
    }
  });
});

describe('2. Logging in and sessions', () => {
  test('TC-06 a wrong password and an unknown email get the same answer', async () => {
    const wrong = await login(dina.email, 'not-the-password');
    const nobody = await login('nobody.here@example.com', 'not-the-password');
    assert.equal(wrong.status, 401);
    assert.deepEqual(nobody.json, wrong.json);
  });

  test('TC-07 text meant to break the database is just a wrong login', async () => {
    for (const email of ["' OR '1'='1", "admin@circulink.test' --", '"; DROP TABLE users; --']) {
      assert.equal((await login(email, "' OR '1'='1")).status, 401);
    }
    assert.equal((await login({ $ne: null }, { $ne: null })).status, 401);
    assert.ok((await one('SELECT COUNT(*) AS n FROM users')).n > 5, 'the users are still there');
  });

  test('TC-08 nothing works without a real token', async () => {
    const forged = jwt.sign({ id: dinaId, role: 'admin', v: 0 }, 'a-guessed-secret');
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: dinaId, role: 'admin' })).toString('base64url')}.`;
    for (const token of [null, 'nonsense', forged, unsigned, `${dinaToken}x`]) {
      assert.equal((await s.api('GET', '/me', token)).status, 401);
      assert.equal((await s.api('GET', '/admin/users', token)).status, 401);
    }
  });

  test('TC-09 the right password logs in; logging out ends the session everywhere', async () => {
    const first = await login(dina.email, dina.password);
    assert.equal(first.status, 200);
    assert.equal((await s.api('GET', '/me', first.json.token)).json.name, dina.name);
    assert.equal((await s.api('POST', '/auth/logout', first.json.token)).status, 200);
    assert.equal((await s.api('GET', '/me', first.json.token)).status, 401, 'the old token is dead');
    assert.equal((await s.api('GET', '/me', dinaToken)).status, 401, 'and so is the one from sign-up');
    dinaToken = (await login(dina.email, dina.password)).json.token;
  });

  test('TC-10 changing the password needs the old one, refuses a weak one, and ends other sessions', async () => {
    const other = (await login(dina.email, dina.password)).json.token;
    assert.equal((await s.api('POST', '/me/password', dinaToken, { current: 'wrong', new_password: 'bagong-umaga-sa-bukid-7' })).json.code, 'wrong_password');
    assert.equal((await s.api('POST', '/me/password', dinaToken, { current: dina.password, new_password: 'password123' })).json.code, 'weak_password');
    assert.equal((await s.api('POST', '/me/password', dinaToken, { current: dina.password, new_password: 'dinavillanueva' })).json.code, 'weak_password');
    const r = await s.api('POST', '/me/password', dinaToken, { current: dina.password, new_password: 'bagong-umaga-sa-bukid-7' });
    assert.equal(r.status, 200);
    assert.equal((await s.api('GET', '/me', other)).status, 401, 'the other device is logged out');
    assert.equal((await login(dina.email, dina.password)).status, 401, 'the old password no longer works');
    dinaToken = r.json.token;
  });

  test('TC-11 a profile can be changed only within the same checks, and never its role', async () => {
    assert.equal((await s.api('PATCH', '/me', dinaToken, { name: '<b>Dina</b>' })).json.code, 'bad_name');
    const r = await s.api('PATCH', '/me', dinaToken, { name: 'Dina V. Santos', role: 'admin', student_id: '9999-00001' });
    assert.equal(r.status, 200);
    assert.equal(r.json.role, 'resident');
    assert.equal(r.json.student_id, '2024-00789', 'the student ID stays as it was');
  });

  test('TC-12 each role is kept to its own side', async () => {
    for (const path of ['/admin/users', '/admin/reports', '/admin/audit', '/admin/flags', '/staff/queue', '/staff/stock', '/stock']) {
      assert.equal((await s.api('GET', path, dinaToken)).status, 403, `resident ${path}`);
    }
    for (const path of ['/admin/users', '/admin/reports', '/admin/audit']) {
      assert.equal((await s.api('GET', path, staff)).status, 403, `staff ${path}`);
      assert.equal((await s.api('GET', path, partner)).status, 403, `partner ${path}`);
    }
    assert.equal((await s.api('POST', '/declarations', staff, { hub_id: hubSchool, items: [{ category_id: cat.clothes }] })).status, 403);
  });
});

describe('3. The main process: from a declaration to confirmed points', () => {
  test('TC-13 the resident declares three items and gets a 6-character code', async () => {
    const r = await s.api('POST', '/declarations', dinaToken, {
      hub_id: hubSchool,
      items: [{ category_id: cat.clothes, description: 'Two jackets' }, { category_id: cat.ewaste, description: 'Old phone' }, { category_id: cat.toys, description: '<img src=x onerror=alert(1)>' }],
    });
    assert.equal(r.status, 201);
    drop = r.json;
    assert.match(drop.code, /^[A-HJKMNP-Z2-9]{6}$/);
    [jackets, phone, toy] = drop.items.map((i) => i.id);
    assert.equal(drop.items[2].description, '<img src=x onerror=alert(1)>', 'kept as plain text; the app and the portal never run it');
    assert.equal((await s.api('GET', '/me/impact', dinaToken)).json.points_confirmed, 0, 'declaring earns nothing (R1)');
  });

  test('TC-14 nobody else can read the drop-off or its code', async () => {
    assert.equal((await s.api('GET', `/declarations/${drop.id}`, ana)).status, 404);
    assert.equal((await s.api('DELETE', `/declarations/${drop.id}`, ana)).status, 404);
    assert.ok(!JSON.stringify((await s.api('GET', '/declarations', ana)).json).includes(drop.code));
  });

  test('TC-15 only staff of that hub can check the code in, once', async () => {
    assert.equal((await s.api('POST', '/staff/checkin', dinaToken, { code: drop.code })).status, 403, 'not the resident');
    assert.equal((await s.api('POST', '/staff/checkin', staff2, { code: drop.code })).json.code, 'not_your_hub');
    assert.equal((await s.api('POST', '/staff/checkin', staff, { code: 'ZZZZZZ' })).json.code, 'bad_code');
    const r = await s.api('POST', '/staff/checkin', staff, { code: drop.code.toLowerCase() });
    assert.equal(r.status, 200);
    assert.equal(r.json.code, undefined, 'staff never get the code back');
    assert.equal((await s.api('POST', '/staff/checkin', staff, { code: drop.code })).json.code, 'code_used');
  });

  test('TC-16 staff weigh and sort; only that creates points, and they start as pending', async () => {
    const sort = (token, id, body) => s.api('POST', `/staff/items/${id}/sort`, token, body);
    assert.equal((await sort(dinaToken, jackets, { weight_kg: 400, outcome: 'reuse' })).status, 403, 'a resident cannot sort');
    assert.equal((await sort(staff2, jackets, { weight_kg: 2, outcome: 'reuse' })).json.code, 'not_your_hub');
    assert.equal((await sort(staff, jackets, { weight_kg: -1, outcome: 'reuse' })).json.code, 'bad_weight');
    assert.equal((await sort(staff, jackets, { weight_kg: 2, outcome: 'keep' })).json.code, 'bad_outcome');
    assert.equal((await sort(staff, jackets, { weight_kg: 2, outcome: 'reuse' })).json.points, 20);   // 2 kg x 10 x 1.0
    assert.equal((await sort(staff, phone, { weight_kg: 0.5, outcome: 'recycle' })).json.points, 3);  // 0.5 x 15 x 0.5 = 3.75 -> 3
    assert.equal((await sort(staff, toy, { weight_kg: 1, outcome: 'reject' })).json.points, 0);
    assert.equal((await sort(staff, jackets, { weight_kg: 50, outcome: 'reuse' })).json.code, 'bad_state', 'an item is sorted once');
    const impact = (await s.api('GET', '/me/impact', dinaToken)).json;
    assert.equal(impact.kg_kept, 2.5, 'the rejected kilo is not counted');
    assert.equal(impact.points_confirmed, 0);
    assert.equal(impact.points_pending, 23);
  });

  test('TC-17 only an approved partner sees stock and asks for it; it never shows who gave it', async () => {
    assert.equal((await s.api('GET', '/stock', partner2)).json.code, 'partner_not_approved');
    const stock = (await s.api('GET', '/stock', partner)).json;
    assert.ok(stock.some((i) => i.id === jackets));
    assert.ok(!JSON.stringify(stock).includes('Dina'));
    assert.equal((await s.api('POST', '/releases', dinaToken, { hub_id: hubSchool, item_ids: [jackets] })).status, 403, 'a resident cannot receive items (R2)');
    const r = await s.api('POST', '/releases', partner, { hub_id: hubSchool, item_ids: [jackets] });
    assert.equal(r.status, 201);
    release = r.json;
  });

  test('TC-18 staff hand the item over: its points are confirmed, the unfinished item stays pending', async () => {
    assert.equal((await ledger(jackets)).status, 'pending', 'asked for, but still at the hub');
    assert.equal((await s.api('POST', `/staff/releases/${release.id}/hand-over`, staff2)).json.code, 'not_your_hub');
    assert.equal((await s.api('POST', `/staff/releases/${release.id}/hand-over`, partner)).status, 403, 'a partner cannot hand over to itself');
    assert.equal((await s.api('POST', `/staff/releases/${release.id}/hand-over`, staff)).status, 200);
    assert.equal((await ledger(jackets)).status, 'confirmed', 'the jackets are final (R6)');
    assert.equal((await ledger(phone)).status, 'pending', 'the phone still waits for the recycler');
    assert.equal((await s.api('POST', `/releases/${release.id}/picked-up`, partner)).status, 200);
  });

  test('TC-19 e-waste leaves only with an accredited recycler', async () => {
    const make = (recyclerId) => s.api('POST', '/staff/recycle-batches', staff, { hub_id: hubSchool, recycler_id: recyclerId, item_ids: [phone] });
    assert.equal((await make(recycler.junkShop)).status, 400, 'the junk shop is refused (R10)');
    const batch = await make(recycler.certified);
    assert.equal(batch.status, 201);
    assert.equal((await s.api('POST', `/staff/recycle-batches/${batch.json.id}/send`, staff)).status, 200);
  });

  test('TC-20 every item is finished: the points are confirmed and the resident is told', async () => {
    assert.deepEqual((await Promise.all([jackets, phone, toy].map(ledger))).map((p) => [p.points, p.status]), [[20, 'confirmed'], [3, 'confirmed'], [0, 'confirmed']]);
    const impact = (await s.api('GET', '/me/impact', dinaToken)).json;
    assert.equal(impact.points_confirmed, 23);
    assert.equal(impact.points_pending, 0);
    assert.equal(impact.badge, 'seed');
    const mine = (await s.api('GET', `/declarations/${drop.id}`, dinaToken)).json;
    assert.deepEqual(mine.items.map((i) => i.state), ['released', 'recycled', 'rejected']);
    assert.ok((await s.api('GET', '/notifications', dinaToken)).json.length >= 1);
  });

  test('TC-21 points cannot be made any other way', async () => {
    for (const [method, path] of [['POST', '/points'], ['POST', '/me/points'], ['PATCH', '/me/impact'], ['POST', '/points/transfer'], ['POST', '/admin/points']]) {
      assert.equal((await s.api(method, path, dinaToken, { points: 500, to: 1 })).status, 404, path);
      assert.equal((await s.api(method, path, admin, { user_id: dinaId, points: 500 })).status, 404, `admin ${path}`);
    }
    assert.equal((await s.api('PATCH', '/me', dinaToken, { points: 500, points_confirmed: 500 })).status, 200);
    assert.equal((await s.api('GET', '/me/impact', dinaToken)).json.points_confirmed, 23);
  });
});

describe('4. Oversight and privacy', () => {
  test('TC-22 the admin report counts it, without names', async () => {
    const r = (await s.api('GET', '/admin/reports', admin)).json;
    assert.equal(r.totals.kg_kept, 2.5);
    assert.equal(r.totals.kg_reject, 1);
    assert.equal(r.totals.items_released, 1);
    assert.ok(!JSON.stringify(r).includes('Dina'));
  });

  test('TC-23 every step is in the audit log, which nobody can change', async () => {
    const log = (await s.api('GET', '/admin/audit?limit=200', admin)).json.map((a) => a.action);
    for (const action of ['account_created', 'password_changed', 'declaration_created', 'declaration_received', 'item_sorted']) {
      assert.ok(log.includes(action), action);
    }
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await s.api(method, '/admin/audit', admin, {})).status, 404);
    assert.equal((await s.api('DELETE', '/admin/audit/1', admin)).status, 404);
  });

  test('TC-24 a person can get a copy of their own data, and only their own', async () => {
    const mine = (await s.api('GET', '/me/data', dinaToken)).json;
    assert.equal(mine.profile.email, dina.email);
    assert.equal(mine.items.length, 3);
    const text = JSON.stringify(mine);
    for (const other of ['Ana Dela Cruz', 'ana@circulink.test', 'password_hash']) assert.ok(!text.includes(other), other);
  });

  test('TC-25 an admin suspends the account: it is locked out at once', async () => {
    assert.equal((await s.api('POST', `/admin/users/${dinaId}/suspend`, admin)).status, 200);
    assert.notEqual((await s.api('GET', '/me', dinaToken)).status, 200);
    assert.equal((await login(dina.email, 'bagong-umaga-sa-bukid-7')).json.code, 'suspended');
    assert.equal((await s.api('POST', `/admin/users/${dinaId}/reinstate`, admin)).status, 200);
    assert.equal((await login(dina.email, 'bagong-umaga-sa-bukid-7')).status, 200);
  });

  test('TC-26 five wrong passwords lock the account for a while, even for the right password', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login(dina.email, `guess-number-${i}`)).status, 401);
    const locked = await login(dina.email, 'bagong-umaga-sa-bukid-7');
    assert.equal(locked.status, 429);
    assert.equal(locked.json.code, 'too_many_attempts');
  });
});
