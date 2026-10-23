// Runs the app's end-to-end tests (test/e2e/) against a fresh test server, then stops the server.
//   cd app && node tools/e2e.mjs
// Needs the test database (docs/SETUP.md, "Running the automated tests"). Uses the same server as the
// portal's browser tests: portal/e2e/test-server.mjs.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(appDir, '..', 'server');
const port = process.env.E2E_PORT || '4300';
const env = { ...process.env, E2E_PORT: port };

const server = spawn(process.execPath, [path.join('..', 'portal', 'e2e', 'test-server.mjs')], { cwd: serverDir, env, stdio: ['ignore', 'inherit', 'inherit'] });
let code = 1;
try {
  await waitForHealth(`http://127.0.0.1:${port}/api/health`, 90_000);
  code = await new Promise((resolve) => {
    // One fixed command (no outside input), through the shell so Windows finds flutter.bat.
    const run = spawn('flutter test test/e2e --concurrency=1', { cwd: appDir, env, stdio: 'inherit', shell: true });
    run.on('exit', (c) => resolve(c ?? 1));
  });
} catch (e) {
  console.error(e.message);
} finally {
  server.kill();
}
process.exit(code);

async function waitForHealth(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error('The test server stopped. See the message above.');
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The test server did not answer at ${url}.`);
}
