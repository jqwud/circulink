// Backup and restore: the database (with mysqldump / mysql) plus the uploads folder.
// A backup is a folder server/backups/<database>-<time>/ holding database.sql, uploads/ and manifest.json.
// Backups contain personal data (names, phone numbers, ID photos): they are ignored by git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

export const BACKUP_ROOT = path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups'));

// Finds a MySQL command-line tool: on PATH, or in the usual Windows install folders.
export function findTool(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const fromEnv = process.env[name.toUpperCase()];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  }
  for (const base of ['C:/Program Files/MySQL', 'C:/xampp/mysql']) {
    if (!fs.existsSync(base)) continue;
    for (const sub of ['', ...fs.readdirSync(base)]) {
      const candidate = path.join(base, sub, 'bin', exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`Cannot find ${name}. Install the MySQL command-line tools or set ${name.toUpperCase()} to its full path.`);
}

const connArgs = () => ['-h', config.db.host, '-P', String(config.db.port), '-u', config.db.user, '--default-character-set=utf8mb4'];
// The password goes through the environment, never on the command line.
const toolEnv = () => ({ ...process.env, MYSQL_PWD: config.db.password });

// Local time, e.g. 20261022-010456 (the 'sv-SE' format is YYYY-MM-DD HH:MM:SS).
const stamp = () => new Date().toLocaleString('sv-SE').replace(/[-:]/g, '').replace(' ', '-');

export function backup({ label = '' } = {}) {
  const dir = path.join(BACKUP_ROOT, `${config.db.database}-${stamp()}${label ? `-${label}` : ''}`);
  fs.mkdirSync(dir, { recursive: true });
  const sqlFile = path.join(dir, 'database.sql');
  execFileSync(findTool('mysqldump'), [
    ...connArgs(), '--single-transaction', '--no-tablespaces', '--routines', '--skip-comments',
    `--result-file=${sqlFile}`, config.db.database,
  ], { env: toolEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
  const hasUploads = fs.existsSync(config.uploadDir);
  if (hasUploads) fs.cpSync(config.uploadDir, path.join(dir, 'uploads'), { recursive: true });
  const manifest = {
    database: config.db.database,
    created_at: new Date().toISOString(),
    sql_bytes: fs.statSync(sqlFile).size,
    uploads: hasUploads ? countFiles(path.join(dir, 'uploads')) : 0,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, ...manifest };
}

// Replaces the database (and the uploads folder, if the backup has one) with the backup's contents.
export function restore(dir) {
  const sqlFile = path.join(dir, 'database.sql');
  if (!fs.existsSync(sqlFile)) throw new Error(`No database.sql in ${dir}`);
  execFileSync(findTool('mysql'), [...connArgs(), config.db.database], {
    env: toolEnv(), input: fs.readFileSync(sqlFile), stdio: ['pipe', 'ignore', 'pipe'],
  });
  const uploads = path.join(dir, 'uploads');
  if (fs.existsSync(uploads)) {
    fs.rmSync(config.uploadDir, { recursive: true, force: true });
    fs.cpSync(uploads, config.uploadDir, { recursive: true });
  }
  return { restored: dir };
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  return n;
}
