// Creates an LGU admin account: the first one on a new install, or another one later.
//   npm run create-admin -- "Full Name" email@example.com
// Prints a temporary password once. It must be changed at the first login (the portal asks).
import bcrypt from 'bcryptjs';
import { pool, one } from '../src/db.js';
import { temporaryPassword } from '../src/routes/auth.js';

const [name, email] = process.argv.slice(2);
try {
  if (!name || name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) {
    console.error('Usage: npm run create-admin -- "Full Name" email@example.com');
    process.exitCode = 1;
  } else if (await one('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()])) {
    console.error(`An account with ${email} already exists. To reset its password, use the portal (Staff page).`);
    process.exitCode = 1;
  } else {
    const temp = temporaryPassword();
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, verification_status, must_change_password)
       VALUES (?,?,?, 'lgu_admin', 'approved', 1)`,
      [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(temp, 10)]);
    console.log(`Admin account created for ${email.trim().toLowerCase()}.`);
    console.log(`Temporary password: ${temp}`);
    console.log('Log in to the portal with it; you will be asked to choose your own password.');
  }
} finally {
  await pool.end();
}
