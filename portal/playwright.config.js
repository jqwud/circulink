// End-to-end tests of the LGU portal in a real browser, against the real API on the test database.
//   npm run test:e2e        (builds the portal, starts e2e/test-server.mjs, runs e2e/*.spec.js)
// Locally it uses the installed Google Chrome; in CI, Playwright's own Chromium.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT) || 4300;

export default defineConfig({
  testDir: 'e2e',
  workers: 1,               // one shared test database
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node ../portal/e2e/test-server.mjs',
    cwd: '../server',       // the server reads its .env (database login) from its own folder
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
