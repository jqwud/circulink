// The server for the end-to-end tests: the real API and the built portal, on the TEST database with fresh
// demo data (server/test/helpers/env.js refuses any database whose name does not end in _test).
import '../../server/test/helpers/env.js';
import { resetTestDatabase, seedTestDatabase } from '../../server/test/helpers/db.js';
import { createApp } from '../../server/src/app.js';
import { q } from '../../server/src/db.js';

await resetTestDatabase();
seedTestDatabase();
// Rewards fixture (test database only): Ana is Silver, and the hall has rice and vegetables in stock.
await q(`INSERT INTO trust_scores (user_id, period, score, tier, parts, signals, counted_loans, computed_on)
         SELECT id, 'live', 72, 'silver', '{"start":40}', '[]', 4, CURDATE() FROM users WHERE email = 'ana@hiraman.test'`);
await q("INSERT INTO reward_catalog (name_en, name_fil, stock, value_estimate) VALUES ('2 kg rice', '2 kilong bigas', 10, 110), ('1 kg fresh vegetables', '1 kilong sariwang gulay', 5, 80)");
const port = Number(process.env.E2E_PORT) || 4300;
createApp({ writeLimit: 1e6 }).listen(port, '127.0.0.1', () => console.log(`e2e server on ${port}`));
