// npm run backup  →  server/backups/<database>-<time>/ (database.sql, uploads/, manifest.json)
import { backup } from '../src/backup.js';

try {
  const b = backup();
  console.log(`Backup saved: ${b.dir}`);
  console.log(`  database ${b.database}: ${(b.sql_bytes / 1024).toFixed(1)} KB · uploads: ${b.uploads} files`);
} catch (e) {
  console.error(`Backup failed: ${e.message}`);
  process.exitCode = 1;
}
