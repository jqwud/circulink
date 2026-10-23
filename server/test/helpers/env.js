// Imported FIRST by every test file that touches the server or the database.
// It points the server at the test database and a throwaway upload folder before config.js reads .env
// (dotenv never overrides a value that is already set), so a test run can never touch real data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DB_NAME = process.env.TEST_DB_NAME || 'hiraman_test';
if (!/_test$/.test(process.env.DB_NAME)) {
  console.error(`\n[hiraman tests] Refusing to run against "${process.env.DB_NAME}". Test databases must end in "_test".\n`);
  process.exit(1);
}

process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'hiraman-test-uploads');
fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
process.env.BACKUP_DIR = path.join(os.tmpdir(), 'hiraman-test-backups');
fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });

process.env.JWT_SECRET ||= 'test-only-secret';
process.env.LOG_REQUESTS = '0';   // keep test output readable; logging.test.js turns it on for its own server
