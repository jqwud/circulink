// Load test: many residents using the app at once, against a real server on the TEST database.
//   npm run test:load                         (50 people for 20 seconds)
//   npm run test:load -- --users 200 --seconds 30
// Each simulated person browses items, opens one, checks their requests, profile and notifications, with a
// short pause between taps. Passes when 95% of answers come back within the target (QA plan: under 300 ms
// for 50 people on a laptop) and nothing fails. Uses only Node itself, no extra tools.
import '../test/helpers/env.js';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resetTestDatabase, seedTestDatabase } from '../test/helpers/db.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

// The server runs in its own process, as it does for real, so the simulated people do not slow it down.
if (process.argv.includes('--serve')) {
  const server = createApp({ writeLimit: 1e6, logRequests: false }).listen(0, () => process.send(server.address().port));
  process.on('message', () => server.close(() => pool.end().then(() => process.exit(0))));
} else {
  await main();
}

async function main() {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : fallback;
  };
  const USERS = arg('users', 50);
  const SECONDS = arg('seconds', 20);
  const TARGET_P95_MS = arg('p95', 300);
  const PAUSE_MS = [200, 800]; // a person taps every 0.2 to 0.8 seconds

  await resetTestDatabase();
  seedTestDatabase();
  const child = fork(fileURLToPath(import.meta.url), ['--serve'], { env: process.env });
  const port = await new Promise((resolve) => child.once('message', resolve));
  const base = `http://127.0.0.1:${port}/api`;

  const residents = ['ana', 'ben', 'carlo', 'dina', 'elena', 'fidel'];
  const tokens = [];
  for (const who of residents) {
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${who}@hiraman.test`, password: 'hiraman123' }),
    });
    tokens.push((await r.json()).token);
  }
  const itemIds = (await (await fetch(`${base}/items?limit=100`, { headers: { Authorization: `Bearer ${tokens[0]}` } })).json()).map((i) => i.id);

  const timings = {};
  let failures = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function call(label, path, token) {
    const t0 = performance.now();
    try {
      const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
      await res.arrayBuffer();
      if (!res.ok) failures++;
    } catch {
      failures++;
    }
    (timings[label] ||= []).push(performance.now() - t0);
  }

  const until = Date.now() + SECONDS * 1000;
  async function person(n) {
    const token = tokens[n % tokens.length];
    const steps = [
      () => call('browse', '/items?limit=30', token),
      () => call('item', `/items/${itemIds[Math.floor(Math.random() * itemIds.length)]}`, token),
      () => call('requests', '/requests?as=borrower', token),
      () => call('me', '/me', token),
      () => call('notifications', '/notifications', token),
    ];
    for (let i = 0; Date.now() < until; i++) {
      await steps[i % steps.length]();
      await sleep(PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]));
    }
  }

  console.log(`Load test: ${USERS} people for ${SECONDS} s ...`);
  await Promise.all(Array.from({ length: USERS }, (_, n) => person(n)));
  child.send('stop');
  await pool.end();

  const pct = (list, p) => list[Math.min(list.length - 1, Math.floor((p / 100) * list.length))];
  const all = Object.values(timings)
    .flat()
    .sort((a, b) => a - b);
  console.log('\nanswer times (ms)        count    p50    p95    p99');
  for (const [label, list] of Object.entries(timings)) {
    list.sort((a, b) => a - b);
    console.log(
      `${label.padEnd(22)} ${String(list.length).padStart(7)} ${pct(list, 50).toFixed(0).padStart(6)} ${pct(list, 95).toFixed(0).padStart(6)} ${pct(list, 99).toFixed(0).padStart(6)}`,
    );
  }
  const p95 = pct(all, 95);
  console.log(
    `${'all'.padEnd(22)} ${String(all.length).padStart(7)} ${pct(all, 50).toFixed(0).padStart(6)} ${p95.toFixed(0).padStart(6)} ${pct(all, 99).toFixed(0).padStart(6)}`,
  );
  console.log(`\nrequests per second: ${(all.length / SECONDS).toFixed(0)}   failures: ${failures}`);
  const ok = p95 < TARGET_P95_MS && failures === 0;
  console.log(
    ok
      ? `PASS: p95 ${p95.toFixed(0)} ms is under ${TARGET_P95_MS} ms with no failures.`
      : `FAIL: p95 ${p95.toFixed(0)} ms (target under ${TARGET_P95_MS} ms), ${failures} failures.`,
  );
  process.exitCode = ok ? 0 : 1;
}
