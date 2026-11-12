// Demo data: an admin, hub staff, a partner organization, residents, two hubs (a school and a barangay)
// and two recyclers. Run:  npm run seed      (safe to run again: it clears the demo tables first)
// Every demo account's password is "circulink123".
import bcrypt from 'bcryptjs';
import { pool, q } from './src/db.js';

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
await user('Ana Dela Cruz', 'ana@circulink.test', 'resident', '09170000001', '2023-00123');
await user('Ben Reyes', 'ben@circulink.test', 'resident', '09170000002', '2023-00456');
await user('Carlo Mendoza', 'carlo@circulink.test', 'resident', '09170000003');

// Hubs: one at a school, one at a barangay. Each staff member works at one hub.
const school = await insert(
  "INSERT INTO hubs (name, type, address, hours) VALUES (?, 'school', ?, ?)",
  ['Campus Green Hub', 'Ground floor, Main Building', 'Mon to Fri, 8:00 to 17:00']);
const brgy = await insert(
  "INSERT INTO hubs (name, type, address, hours) VALUES (?, 'barangay', ?, ?)",
  ['Barangay San Isidro MRF', 'Beside the Barangay Hall', 'Mon to Sat, 7:00 to 16:00']);
await q('INSERT INTO hub_staff (hub_id, user_id) VALUES (?,?), (?,?)', [school, staffSchool, brgy, staffBrgy]);

// Partner organizations: one approved, one waiting for an admin.
await q("INSERT INTO partners (user_id, org_name, kind, status, approved_at) VALUES (?, 'Lingap Shelter', 'shelter', 'approved', NOW())", [partnerUser]);
await q("INSERT INTO partners (user_id, org_name, kind, status) VALUES (?, 'Bagong Pag-asa NGO', 'ngo', 'pending')", [pendingPartnerUser]);

// Recyclers: only the accredited one may receive e-waste and batteries (rule R10).
await q(`INSERT INTO recyclers (name, materials, accredited) VALUES
  ('GreenCycle E-Waste Center', 'E-waste, batteries, small appliances', 1),
  ('Mang Rudy Junk Shop', 'Plastic, cans, glass, paper', 0)`);

console.log(`Demo data loaded. Log in with any @circulink.test account, password "${PASS}".`);
await pool.end();
