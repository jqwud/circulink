// Demo data: an admin, hub staff, a partner organization, residents, two hubs (a school and a barangay)
// and two recyclers. Run:  npm run seed      (safe to run again: it clears the demo tables first)
// For a demo with six months of drop-offs already in it (reports, badges, stock, a partner request and a
// flag to review):  npm run seed:demo
// Every demo account's password is "circulink123".
import bcrypt from 'bcryptjs';
import { pool, q, phTimestamp } from './src/db.js';
import { CODE_ALPHABET, pointsFor } from './src/rules.js';

const PASS = 'circulink123';
const hash = await bcrypt.hash(PASS, 10);

await q('SET FOREIGN_KEY_CHECKS = 0');
for (const t of ['flags', 'points_ledger', 'recycle_batch_items', 'recycle_batches', 'release_items', 'releases', 'items', 'declarations',
  'recyclers', 'partners', 'hub_staff', 'hubs', 'audit_log', 'notifications', 'job_runs', 'users']) {
  await q(`TRUNCATE TABLE ${t}`);
}
await q('SET FOREIGN_KEY_CHECKS = 1');

const user = async (name, email, role, phone = null, studentId = null) => {
  const [r] = await pool.query(
    `INSERT INTO users (name, email, phone, student_id, password_hash, role, language, privacy_version, privacy_accepted_at)
     VALUES (?,?,?,?,?,?, 'en', '2026-11-12', NOW())`,
    [name, email, phone, studentId, hash, role]);
  return r.insertId;
};
const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;

// Accounts
await user('CircuLink Admin', 'admin@circulink.test', 'admin');
const staffSchool = await user('Maria Santos', 'staff@circulink.test', 'staff', '09170000101');
const staffBrgy = await user('Jose Ramos', 'staff2@circulink.test', 'staff', '09170000102');
const partnerUser = await user('Lingap Shelter (Rosa Cruz)', 'partner@circulink.test', 'partner', '09170000201');
const pendingPartnerUser = await user('Bagong Pag-asa NGO (Leo Tan)', 'partner2@circulink.test', 'partner', '09170000202');
const ana = await user('Ana Dela Cruz', 'ana@circulink.test', 'resident', '09170000001', '2023-00123');
const ben = await user('Ben Reyes', 'ben@circulink.test', 'resident', '09170000002', '2023-00456');
const carlo = await user('Carlo Mendoza', 'carlo@circulink.test', 'resident', '09170000003');

// Hubs: one at a school, one at a barangay. Each staff member works at one hub.
const school = await insert(
  "INSERT INTO hubs (name, type, address, hours) VALUES (?, 'school', ?, ?)",
  ['Campus Green Hub', 'Ground floor, Main Building', 'Mon to Fri, 8:00 to 17:00']);
const brgy = await insert(
  "INSERT INTO hubs (name, type, address, hours) VALUES (?, 'barangay', ?, ?)",
  ['Barangay San Isidro MRF', 'Beside the Barangay Hall', 'Mon to Sat, 7:00 to 16:00']);
await q('INSERT INTO hub_staff (hub_id, user_id) VALUES (?,?), (?,?)', [school, staffSchool, brgy, staffBrgy]);

// Partner organizations: one approved, one waiting for an admin.
const lingap = await insert("INSERT INTO partners (user_id, org_name, kind, status, approved_at) VALUES (?, 'Lingap Shelter', 'shelter', 'approved', NOW())", [partnerUser]);
await q("INSERT INTO partners (user_id, org_name, kind, status) VALUES (?, 'Bagong Pag-asa NGO', 'ngo', 'pending')", [pendingPartnerUser]);

// Recyclers: only the accredited one may receive e-waste and batteries (rule R10).
const greenCycle = await insert("INSERT INTO recyclers (name, materials, accredited) VALUES ('GreenCycle E-Waste Center', 'E-waste, batteries, small appliances', 1)");
const junkShop = await insert("INSERT INTO recyclers (name, materials, accredited) VALUES ('Mang Rudy Junk Shop', 'Plastic, cans, glass, paper', 0)");

if (process.argv.includes('--history')) await history();

console.log(`Demo data loaded. Log in with any @circulink.test account, password "${PASS}".`);
await pool.end();

// ---------- npm run seed:demo: what six months of use look like ----------
// Written straight into the tables with past dates, in the shape the API leaves them: every finished item has
// confirmed points, reused items went to the partner, and recyclables left in a batch (R10: e-waste and
// batteries only to the accredited recycler). The same drop-offs every run.
async function history() {
  const cats = Object.fromEntries((await q('SELECT id, slug, rate_per_kg, hazardous FROM categories')).map((c) => [c.slug, c]));
  let n = 12;
  const rand = (max) => { n = (n * 1103515245 + 12345) % 2147483648; return Math.floor((n / 2147483648) * max); };
  const code = () => Array.from({ length: 6 }, () => CODE_ALPHABET[rand(CODE_ALPHABET.length)]).join('');
  const at = (daysAgo, hour = 10) => `${phTimestamp(new Date(Date.now() - daysAgo * 86400000)).slice(0, 10)} ${String(hour).padStart(2, '0')}:15:00`;
  const hubs = [{ id: school, staff: staffSchool }, { id: brgy, staff: staffBrgy }];

  // One checked-in drop-off. list: [slug, kg, outcome, description]. `final`: reused items were handed to the
  // partner and recyclables were sent. `flag`: held for an admin (R7), so its points stay pending.
  async function dropOff(resident, hub, daysAgo, list, { final = true, flag = false } = {}) {
    const when = at(daysAgo);
    const d = await insert(
      "INSERT INTO declarations (resident_id, hub_id, code, status, expires_at, received_at, received_by, created_at) VALUES (?,?,?,'received',?,?,?,?)",
      [resident, hub.id, code(), at(daysAgo - 6), when, hub.staff, at(daysAgo + 1)]);
    const made = [];
    for (const [slug, kg, outcome, description] of list) {
      const c = cats[slug];
      const state = { reject: 'rejected', reuse: final ? 'released' : 'in_stock', repair: 'in_repair', recycle: final ? 'recycled' : 'in_recycle_batch' }[outcome];
      const done = ['rejected', 'released', 'recycled'].includes(state);
      // Points are confirmed only when every item of the drop-off is finished and nothing is flagged (R6, R7).
      const item = await insert(
        'INSERT INTO items (declaration_id, category_id, description, weight_kg, outcome, state, processed_by, processed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [d, c.id, description, kg, outcome, state, hub.staff, when, at(daysAgo + 1)]);
      made.push({ item, kg, state, done, hazardous: !!c.hazardous, points: pointsFor(kg, c.rate_per_kg, outcome), reason: `${outcome} ${kg} kg ${slug}` });
    }
    const confirmed = !flag && made.every((m) => m.done);
    for (const m of made) {
      await q('INSERT INTO points_ledger (user_id, item_id, points, status, reason, created_at, decided_at) VALUES (?,?,?,?,?,?,?)',
        [resident, m.item, m.points, confirmed ? 'confirmed' : 'pending', m.reason, when, confirmed ? when : null]);
    }
    if (flag) {
      await q("INSERT INTO flags (kind, entity, entity_id, detail) VALUES ('heavy_drop_off', 'declaration', ?, ?)",
        [d, `${list.reduce((sum, x) => sum + x[1], 0)} kg in this drop-off`]);
    }
    return { hub, daysAgo, made };
  }

  // A finished month at each hub: one pickup by the partner, and batches sent to the recyclers.
  async function close(drops) {
    for (const hub of hubs) {
      const mine = drops.filter((d) => d.hub === hub);
      if (!mine.length) continue;
      const day = Math.max(Math.min(...mine.map((d) => d.daysAgo)) - 2, 0);
      const items = mine.flatMap((d) => d.made);
      const released = items.filter((m) => m.state === 'released');
      if (released.length) {
        const r = await insert(
          "INSERT INTO releases (partner_id, hub_id, status, released_by, released_at, picked_up_at, created_at) VALUES (?,?,'picked_up',?,?,?,?)",
          [lingap, hub.id, hub.staff, at(day, 14), at(day, 16), at(day + 1)]);
        for (const m of released) await q('INSERT INTO release_items (release_id, item_id) VALUES (?,?)', [r, m.item]);
      }
      for (const hazardous of [false, true]) {
        const batch = items.filter((m) => m.state === 'recycled' && m.hazardous === hazardous);
        if (!batch.length) continue;
        const b = await insert("INSERT INTO recycle_batches (hub_id, recycler_id, total_kg, status, sent_at, sent_by, created_at) VALUES (?,?,?,'sent',?,?,?)",
          [hub.id, hazardous ? greenCycle : junkShop, batch.reduce((sum, m) => sum + m.kg, 0), at(day, 15), hub.staff, at(day + 1)]);
        for (const m of batch) await q('INSERT INTO recycle_batch_items (batch_id, item_id) VALUES (?,?)', [b, m.item]);
      }
    }
  }

  const BRING = [
    [['clothes', 3.5, 'reuse', 'Shirts and jeans'], ['plastic', 1.2, 'recycle', 'Water bottles']],
    [['books', 6, 'reuse', 'Grade 7 textbooks'], ['books', 2.5, 'recycle', 'Old test papers']],
    [['ewaste', 0.8, 'recycle', 'Old phone and chargers'], ['batteries', 0.3, 'recycle', 'AA batteries']],
    [['kitchen', 2.4, 'reuse', 'Pots and plates'], ['glass', 3, 'recycle', 'Jars'], ['toys', 0.9, 'reject', 'Broken toy with sharp edges']],
    [['shoes_bags', 1.8, 'reuse', 'School bag and rubber shoes'], ['cans', 1.5, 'recycle', 'Soft drink cans']],
    [['school', 1.1, 'reuse', 'Notebooks and pens'], ['clothes', 2, 'recycle', 'Torn shirts, for rags']],
    [['appliances', 2.6, 'reuse', 'Electric fan'], ['plastic', 2.2, 'recycle', 'Bottles']],
    [['toys', 1.6, 'reuse', 'Building blocks'], ['furniture', 4.5, 'reuse', 'Small study table']],
  ];
  const people = [ana, ben, carlo];
  // Five finished months, a little busier each month.
  for (let month = 5; month >= 1; month--) {
    const drops = [];
    for (let visit = 0; visit < 8 - month; visit++) {
      drops.push(await dropOff(people[rand(3)], hubs[rand(2)], month * 30 + 3 + rand(22), BRING[rand(BRING.length)]));
    }
    await close(drops);
  }

  // This month, still moving: stock a partner can ask for, an item in repair, recyclables waiting for a
  // batch, one request from the partner, one heavy drop-off for the admin to review, and an open code for Ana.
  await dropOff(ana, hubs[0], 3, [['clothes', 4, 'reuse', 'Winter jackets'], ['appliances', 1.9, 'repair', 'Rice cooker with a loose cord']], { final: false });
  const bens = await dropOff(ben, hubs[0], 2, [['books', 5, 'reuse', 'Story books'], ['plastic', 1.4, 'recycle', 'Bottles']], { final: false });
  await dropOff(ben, hubs[1], 1, [['kitchen', 3.2, 'reuse', 'Glasses and bowls'], ['cans', 2, 'recycle', 'Cans']], { final: false });
  await dropOff(carlo, hubs[1], 1, [['clothes', 62, 'reuse', 'Sacks of clothes from a clean-up drive']], { final: false, flag: true });
  const asked = await insert("INSERT INTO releases (partner_id, hub_id, note, status) VALUES (?,?,'For the reading corner','requested')", [lingap, school]);
  await q('INSERT INTO release_items (release_id, item_id) VALUES (?,?)', [asked, bens.made[0].item]);
  const open = await insert('INSERT INTO declarations (resident_id, hub_id, code, expires_at) VALUES (?,?,?,?)', [ana, school, code(), at(-6, 23)]);
  await q('INSERT INTO items (declaration_id, category_id, description) VALUES (?,?,?), (?,?,?)',
    [open, cats.shoes_bags.id, 'Two pairs of shoes', open, cats.batteries.id, 'Used batteries']);
  console.log('Six months of demo drop-offs added.');
}
