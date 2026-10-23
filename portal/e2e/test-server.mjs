// The server for the end-to-end tests: the real API and the built portal, on the TEST database with fresh
// demo data (server/test/helpers/env.js refuses any database whose name does not end in _test).
import '../../server/test/helpers/env.js';
import { resetTestDatabase, seedTestDatabase } from '../../server/test/helpers/db.js';
import { createApp } from '../../server/src/app.js';

await resetTestDatabase();
seedTestDatabase();
const port = Number(process.env.E2E_PORT) || 4300;
createApp({ writeLimit: 1e6 }).listen(port, '127.0.0.1', () => console.log(`e2e server on ${port}`));
