import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { runReminders } from './services.js';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error('\n[hiraman] Cannot reach MySQL. Is it running, and are DB_* values in .env correct?\n  ', e.message, '\n');
  process.exit(1);
}

const app = createApp();
app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hiraman API running on http://localhost:${config.port}  (health: /api/health)`);
});

// Return reminders: check every hour (staff can also trigger it from the portal).
const tick = () => runReminders().catch((e) => console.error('[hiraman] reminder run failed:', e.message));
setTimeout(tick, 5000);
setInterval(tick, 60 * 60 * 1000);
