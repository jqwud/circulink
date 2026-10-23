// The API description (docs/openapi.json) matches the server: every route is described, nothing extra is
// described, and the file is up to date with scripts/api-catalog.js.
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, describe, test } from 'node:test';
import { pool } from '../src/db.js';
import { createApp } from '../src/app.js';
import { CATALOG } from '../scripts/api-catalog.js';
import { buildOpenApi, OPENAPI_FILE } from '../scripts/openapi.js';

after(async () => { await pool.end(); });

// Every route the server registers, as "METHOD /path/{param}" (the portal's catch-all is not part of the API).
function serverRoutes() {
  const out = [];
  const walk = (stack) => {
    for (const layer of stack) {
      if (layer.route && typeof layer.route.path === 'string') {
        for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${layer.route.path.replace(/^\/api/, '').replace(/:(\w+)/g, '{$1}')}`);
      } else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk(createApp().router.stack);
  return out.sort();
}

describe('API description', () => {
  test('every route is described, and every description is a real route', () => {
    const described = CATALOG.map((r) => `${r.method} ${r.path}`).sort();
    const real = serverRoutes();
    assert.deepEqual(real.filter((r) => !described.includes(r)), [], 'routes missing from scripts/api-catalog.js');
    assert.deepEqual(described.filter((r) => !real.includes(r)), [], 'described routes that do not exist');
  });

  test('docs/openapi.json is up to date (run npm run docs:api after changing the catalog)', () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(OPENAPI_FILE, 'utf8')), buildOpenApi());
  });

  test('every operation says who may call it', () => {
    for (const r of CATALOG) assert.ok(['public', 'user', 'resident', 'staff', 'admin'].includes(r.access), `${r.method} ${r.path}`);
  });
});
