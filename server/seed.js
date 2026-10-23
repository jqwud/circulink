// Demo data: 2 staff, 9 residents, 25 items (6 on the Barangay Shelf), 3 requests, wanted posts, an announcement.
// Run:  npm run seed      (safe to run again: it clears the demo tables first)
import bcrypt from 'bcryptjs';
import { pool, q } from './src/db.js';

const PASS = 'hiraman123';
const hash = await bcrypt.hash(PASS, 10);
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

await q('SET FOREIGN_KEY_CHECKS = 0');
for (const t of ['audit_log', 'ratings', 'impact_surveys', 'reports', 'announcements', 'notifications', 'wanted_posts', 'credit_ledger', 'requests', 'items', 'users']) {
  await q(`TRUNCATE TABLE ${t}`);
}
await q('SET FOREIGN_KEY_CHECKS = 1');

const user = async (name, email, role, purok, status, phone) => {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, phone, password_hash, role, purok, verification_status, language) VALUES (?,?,?,?,?,?,?,?)',
    [name, email, phone || null, hash, role, purok, status, 'fil']);
  return r.insertId;
};
const ledger = async (userId, amount, reason, requestId = null) => {
  await q('UPDATE users SET credits = credits + ? WHERE id = ?', [amount, userId]);
  await q('INSERT INTO credit_ledger (user_id, request_id, amount, reason) VALUES (?,?,?,?)', [userId, requestId, amount, reason]);
};

// Staff (password for the demo accounts is "hiraman123")
await user('Barangay Admin', 'admin@hiraman.test', 'lgu_admin', null, 'approved');
const staff = await user('Maria Santos (Secretary)', 'staff@hiraman.test', 'lgu_staff', null, 'approved');

// Residents
const ana = await user('Ana Dela Cruz', 'ana@hiraman.test', 'resident', 'Purok 1', 'approved', '0917 000 0001');
const ben = await user('Ben Reyes', 'ben@hiraman.test', 'resident', 'Purok 2', 'approved', '0917 000 0002');
const carlo = await user('Carlo Mendoza', 'carlo@hiraman.test', 'resident', 'Purok 2', 'approved', '0917 000 0003');
const dina = await user('Dina Villanueva', 'dina@hiraman.test', 'resident', 'Purok 3', 'approved', '0917 000 0004');
const elena = await user('Elena Garcia', 'elena@hiraman.test', 'resident', 'Purok 1', 'approved', '0917 000 0005');
const fidel = await user('Fidel Navarro', 'fidel@hiraman.test', 'resident', 'Purok 3', 'approved', '0917 000 0006');
await user('Gina Ramos', 'gina@hiraman.test', 'resident', 'Purok 1', 'pending', '0917 000 0007');
await user('Hector Bautista', 'hector@hiraman.test', 'resident', 'Purok 2', 'pending', '0917 000 0008');
await user('Isa Flores', 'isa@hiraman.test', 'resident', 'Purok 3', 'unverified', '0917 000 0009');
for (const id of [ana, ben, carlo, dina, elena, fidel]) await ledger(id, 3, 'starter');

// Items: [owner, category, title, description, condition, tier, pickup point]
// categories: 1 party, 2 tools, 3 school, 4 travel.   pickup: 1 hall, 2 court, 3 store
const items = [
  [ana, 1, 'Folding chairs (set of 12)', 'Plastic monobloc chairs, clean, good for parties.', 'good', 'low', 1],
  [ana, 1, 'Bluetooth speaker', 'Loud party speaker with a microphone input.', 'good', 'medium', 1],
  [ben, 1, 'Large cooking pot (30 L)', 'Good for fiesta or birthday cooking.', 'good', 'low', 2],
  [ben, 1, 'Cooler box', '60 L cooler, no cracks.', 'fair', 'low', 2],
  [carlo, 2, 'Electric drill', 'Corded drill with bits.', 'good', 'medium', 3],
  [carlo, 2, 'Ladder (6 ft)', 'Aluminum step ladder.', 'good', 'medium', 3],
  [dina, 2, 'Screwdriver set', '30-piece set in a case.', 'new', 'low', 1],
  [dina, 2, 'Paint rollers and trays', 'Two rollers, one tray.', 'fair', 'low', 1],
  [dina, 3, 'Scientific calculator', 'Casio fx-991, works well.', 'good', 'low', 1],
  [elena, 3, 'Glue gun with sticks', 'Great for school projects.', 'good', 'low', 2],
  [elena, 3, 'Portable projector', 'HD projector, HDMI cable included.', 'good', 'high', 1],
  [elena, 3, 'Graduation toga (medium)', 'Clean, pressed.', 'good', 'low', 1],
  [fidel, 4, 'Camping tent (4 persons)', 'Dome tent, complete poles.', 'good', 'medium', 2],
  [fidel, 4, 'Picnic mat', 'Large waterproof mat.', 'good', 'low', 2],
  [fidel, 4, 'Badminton rackets (2) with shuttlecocks', 'Slightly worn grips.', 'fair', 'low', 2],
  [ana, 4, 'Travel luggage (large)', 'Hard-shell, 4 wheels.', 'good', 'medium', 1],
  [ben, 3, 'Portable whiteboard', 'With two markers.', 'good', 'low', 2],
  [carlo, 2, 'Wrench set', 'Open-end set, 8 to 19 mm.', 'good', 'low', 3],
];
const ids = [];
for (const [owner, cat, title, desc, cond, tier, pickup] of items) {
  const [r] = await pool.query(
    'INSERT INTO items (owner_id, category_id, title, description, item_condition, tier, pickup_point_id) VALUES (?,?,?,?,?,?,?)',
    [owner, cat, title, desc, cond, tier, pickup]);
  ids.push(r.insertId);
}
// A broken but fixable donation: "Repair and Reuse"
await q("INSERT INTO items (owner_id, category_id, title, description, item_condition, tier, pickup_point_id, repair_reuse) VALUES (?,?,?,?,?,?,?,1)",
  [fidel, 1, 'Electric fan (needs a new switch)', 'Motor works. Looking for someone who can fix the switch.', 'worn', 'low', 2]);

// Barangay Shelf (community-owned, free, handled at the hall)
const shelf = [
  [1, 'Shelf: Folding tables (4)', 'Barangay-owned folding tables.', 'good', 'low'],
  [1, 'Shelf: Monobloc chairs (30)', 'Barangay-owned chairs for events.', 'good', 'low'],
  [2, 'Shelf: Extension ladder', 'Tall ladder, ask the staff to hand it over.', 'good', 'medium'],
  [2, 'Shelf: Basic hand-tool set', 'Hammer, pliers, saw, tape measure.', 'good', 'low'],
  [4, 'Shelf: Event tent (3 x 3 m)', 'Canopy tent for barangay or family events.', 'good', 'medium'],
  [3, 'Shelf: Portable whiteboard', 'For meetings and school projects.', 'good', 'low'],
];
for (const [cat, title, desc, cond, tier] of shelf) {
  await q('INSERT INTO items (owner_id, is_shelf, category_id, title, description, item_condition, tier, pickup_point_id) VALUES (NULL,1,?,?,?,?,?,1)', [cat, title, desc, cond, tier]);
}

// An established community: accounts joined three months ago and items were shared weeks ago, so the
// demo neighbors do not look like brand-new accounts to the automatic checks. The order stays the same.
await q('UPDATE users SET created_at = created_at - INTERVAL 90 DAY');
await q('UPDATE items SET created_at = created_at - INTERVAL 30 DAY');

// Requests
const req = async (item, borrower, start, end, status, cost, extra = {}) => {
  const [r] = await pool.query(
    `INSERT INTO requests (item_id, borrower_id, start_date, end_date, status, credit_cost, credits_held, handed_over_at, returned_at, return_condition, on_time, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, NOW() - INTERVAL ? DAY)`,
    [item, borrower, start, end, status, cost, extra.held ? 1 : 0, extra.handed || null, extra.returned || null, extra.cond || null, extra.onTime ?? null, extra.age || 0]);
  return r.insertId;
};
// 1) Ben borrowed Ana's chairs, returned on time (closed): Ben -1, Ana +1
const r1 = await req(ids[0], ben, day(-12), day(-10), 'closed', 1, { handed: `${day(-12)} 10:00:00`, returned: `${day(-10)} 16:00:00`, cond: 'good', onTime: 1, age: 13 });
await ledger(ben, -1, 'borrow_hold', r1); await ledger(ana, 1, 'lend_reward', r1);
await q("INSERT INTO impact_surveys (request_id, would_have_bought) VALUES (?, 'yes')", [r1]);
// 2) Carlo borrowed Dina's calculator, returned on time (closed): Carlo -1, Dina +1
const r2 = await req(ids[8], carlo, day(-8), day(-6), 'closed', 1, { handed: `${day(-8)} 09:00:00`, returned: `${day(-6)} 15:00:00`, cond: 'good', onTime: 1, age: 9 });
await ledger(carlo, -1, 'borrow_hold', r2); await ledger(dina, 1, 'lend_reward', r2);
await q("INSERT INTO impact_surveys (request_id, would_have_bought) VALUES (?, 'maybe')", [r2]);
// 3) Elena has Fidel's picnic mat out right now, due tomorrow (handed_over): Elena -1
const r3 = await req(ids[13], elena, day(-2), day(1), 'handed_over', 1, { handed: `${day(-2)} 11:00:00`, held: true, age: 3 });
await ledger(elena, -1, 'borrow_hold', r3);
// 4) Ben asked for Ana's speaker (pending, medium tier): Ben -1 held
const r4 = await req(ids[1], ben, day(3), day(4), 'pending', 1, { held: true, age: 0 });
await ledger(ben, -1, 'borrow_hold', r4);
// 5) Dina is overdue with Carlo's wrench set (handed_over, ended yesterday)
const r5 = await req(ids[17], dina, day(-5), day(-1), 'handed_over', 1, { handed: `${day(-5)} 10:00:00`, held: true, age: 6 });
await ledger(dina, -1, 'borrow_hold', r5);

// Wanted board, announcement, one report
await q('INSERT INTO wanted_posts (user_id, title, details, needed_by) VALUES (?,?,?,?)', [dina, 'Scientific calculator for exam week', 'Need it for 3 days, Purok 3 pickup is fine.', day(6)]);
await q('INSERT INTO wanted_posts (user_id, title, details, needed_by) VALUES (?,?,?,?)', [carlo, 'Extra folding tables (2)', 'For a family reunion this weekend.', day(5)]);
await q('INSERT INTO wanted_posts (user_id, title, details, needed_by) VALUES (?,?,?,?)', [ana, 'Ladder for repainting', 'About 8 ft tall, one day only.', day(9)]);
await q('INSERT INTO announcements (author_id, audience, title, message) VALUES (?,?,?,?)', [staff, 'all', 'Welcome to Hiraman!', 'Borrow what you need, lend what you do not. The Barangay Shelf at the hall has tables, chairs, a tent and tools. Help desk every Saturday 9 AM.']);
await q('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?)', [ben, 'item', ids[3], 'item_condition', 'The cooler lid has a small crack that was not in the photo.']);
await q('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)', [ben, 'announcement', 'Welcome to Hiraman!', 'Borrow what you need, lend what you do not.']);

console.log('Seed done. Demo logins (password "hiraman123"):');
console.log('  LGU admin : admin@hiraman.test');
console.log('  LGU staff : staff@hiraman.test');
console.log('  Residents : ana@, ben@, carlo@, dina@, elena@, fidel@ (verified);  gina@, hector@ (waiting for verification);  isa@ (not yet submitted)  all @hiraman.test');
await pool.end();
