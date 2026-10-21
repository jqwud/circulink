// npm run restore -- <backup folder> --yes
// Replaces the current database and uploads with a backup. A safety backup of the current state is taken first.
import fs from 'node:fs';
import path from 'node:path';
import { backup, restore, BACKUP_ROOT } from '../src/backup.js';
import { config } from '../src/config.js';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  const list = fs.existsSync(BACKUP_ROOT) ? fs.readdirSync(BACKUP_ROOT).sort().reverse() : [];
  console.log('Usage: npm run restore -- <backup folder> --yes\n\nBackups (newest first):');
  for (const b of list.slice(0, 10)) console.log(`  ${b}`);
  process.exit(list.length ? 0 : 1);
}
const dir = fs.existsSync(target) ? target : path.join(BACKUP_ROOT, target);
if (!args.includes('--yes')) {
  console.log(`This replaces the "${config.db.database}" database and the uploads folder with:\n  ${dir}\nRun again with --yes to continue.`);
  process.exit(1);
}
try {
  const safety = backup({ label: 'before-restore' });
  console.log(`Safety backup of the current state: ${safety.dir}`);
  restore(dir);
  console.log(`Restored "${config.db.database}" from ${dir}`);
} catch (e) {
  console.error(`Restore failed: ${e.message}`);
  process.exitCode = 1;
}
