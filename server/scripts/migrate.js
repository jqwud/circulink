// npm run migrate          apply pending migrations (takes a backup first)
// npm run migrate:status   list migrations and whether they are applied
// npm run migrate:down     undo the most recent migration (takes a backup first)
// Add --no-backup to skip the automatic backup (used for test databases).
import { migrateUp, migrateDown, status, pendingMigrations, isFreshInstall } from '../src/migrations.js';
import { backup } from '../src/backup.js';
import { config } from '../src/config.js';

const command = process.argv[2] || 'up';
const noBackup = process.argv.includes('--no-backup');

function safetyBackup(label) {
  if (noBackup) return;
  const b = backup({ label });
  console.log(`Backup first: ${b.dir}`);
}

try {
  if (command === 'status') {
    for (const m of await status()) console.log(`${m.applied ? '[x]' : '[ ]'} ${m.id}`);
  } else if (command === 'up') {
    if (!(await pendingMigrations()).length) {
      console.log(`"${config.db.database}" is up to date.`);
    } else {
      if (await isFreshInstall()) console.log('New database with no accounts yet: nothing to back up.');
      else safetyBackup('before-migrate');
      const done = await migrateUp({ log: (m) => console.log(m) });
      console.log(`Applied ${done.length} migration(s) to "${config.db.database}".`);
    }
  } else if (command === 'down') {
    safetyBackup('before-migrate-down');
    const undone = await migrateDown({ log: (m) => console.log(m) });
    console.log(undone ? `Undid ${undone} on "${config.db.database}".` : 'Nothing to undo.');
  } else {
    console.log('Usage: node scripts/migrate.js [up|down|status] [--no-backup]');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Migration stopped: ${e.message}`);
  console.error('Your backup is in server/backups. Restore it with: npm run restore -- <folder> --yes');
  process.exitCode = 1;
}
