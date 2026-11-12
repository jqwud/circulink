// Rule R12: the audit log is append-only. No code outside src/services.js may write to it, and nothing
// anywhere may UPDATE or DELETE its rows. This reads the source, so it also catches code that is never run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(p);
  return e.name.endsWith('.js') ? [p] : [];
});
const files = [...sourceFiles(path.join(root, 'src')), ...sourceFiles(path.join(root, 'scripts'))];

describe('audit log is append-only (R12)', () => {
  test('no code updates or deletes audit rows', () => {
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      assert.ok(!/UPDATE\s+audit_log/i.test(text), `${path.relative(root, f)} updates audit_log`);
      assert.ok(!/DELETE\s+(\w+\s+)?FROM\s+audit_log/i.test(text), `${path.relative(root, f)} deletes from audit_log`);
      assert.ok(!/TRUNCATE\s+(TABLE\s+)?audit_log/i.test(text), `${path.relative(root, f)} truncates audit_log`);
    }
  });
  test('only src/services.js inserts audit rows', () => {
    const writers = files.filter((f) => /INSERT\s+INTO\s+audit_log/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f).replace(/\\/g, '/'));
    assert.deepEqual(writers, ['src/services.js']);
  });
});
