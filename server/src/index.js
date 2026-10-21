import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { runReminders } from './services.js';
import { pendingMigrations } from './migrations.js';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error('\n[hiraman] Cannot reach MySQL. Is it running, and are DB_* values in .env correct?\n  ', e.message, '\n');
  process.exit(1);
}

// A database that is behind on migrations still starts, but loudly, so nobody runs old tables by accident.
try {
  const pending = await pendingMigrations();
  if (pending.length) {
    console.warn(`\n[hiraman] The database is missing ${pending.length} migration(s): ${pending.join(', ')}\n  Run:  npm run migrate   (it takes a backup first)\n`);
  }
} catch (e) {
  console.warn('[hiraman] Could not check migrations:', e.message);
}

const app = createApp();
app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hiraman API running on http://localhost:${config.port}  (health: /api/health)`);
});

// Return reminders: check every hour (staff can also trigger it from the portal).
const tick = () => runReminders().catch((e) => console.error('[hiraman] reminder run failed:', e.message));
setTimeout(tick, 5000);
setInterval(tick, 60 * 60 * 1000);
