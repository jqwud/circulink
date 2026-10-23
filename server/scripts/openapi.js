// Writes docs/openapi.json (OpenAPI 3.1) from scripts/api-catalog.js:  npm run docs:api
// Open it in any OpenAPI viewer (for example editor.swagger.io) to browse the API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, TAGS } from './api-catalog.js';

export const OPENAPI_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'openapi.json');

const ACCESS = {
  public: 'No login needed.',
  user: 'Any logged-in account.',
  resident: 'A logged-in resident.',
  staff: 'LGU staff or admin.',
  admin: 'LGU admin only.',
};

export function buildOpenApi() {
  const paths = {};
  for (const r of CATALOG) {
    const pathParams = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: m[1] === 'id' ? 'integer' : 'string' } }));
    const queryParams = (r.query || []).map((q) => ({ name: q, in: 'query', required: false, schema: { type: ['limit', 'offset', 'category_id'].includes(q) ? 'integer' : 'string' } }));
    const op = {
      operationId: r.method.toLowerCase() + r.path.split(/[/{}.-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(''),
      tags: [r.tag],
      summary: r.summary,
      description: `${ACCESS[r.access]}${r.errors?.length ? ` Error codes: ${r.errors.join(', ')}.` : ''}`,
      ...(r.access === 'public' ? { security: [] } : {}),
      ...(pathParams.length || queryParams.length ? { parameters: [...pathParams, ...queryParams] } : {}),
      responses: {
        [String(r.ok || 200)]: { description: r.csv ? 'A CSV file' : 'Success', content: r.csv ? { 'text/csv': {} } : { 'application/json': {} } },
        '4XX': { description: 'An error: { error, code }', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    };
    if (r.body) {
      const required = r.body.filter((f) => f.endsWith('*')).map((f) => f.slice(0, -1));
      op.requestBody = {
        required: required.length > 0,
        content: { 'application/json': { schema: { type: 'object', properties: Object.fromEntries(r.body.map((f) => [f.replace('*', ''), {}])), ...(required.length ? { required } : {}) } } },
      };
    }
    if (r.upload) {
      op.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } } };
    }
    (paths[r.path] ||= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Hiraman API',
      version: '1.0.0',
      description: 'The API behind the Hiraman resident app and the LGU portal. All paths are under /api. Dates are Philippine time (UTC+8). Generated from server/scripts/api-catalog.js by npm run docs:api.',
    },
    servers: [{ url: 'http://localhost:4000/api' }],
    tags: Object.entries(TAGS).map(([name, description]) => ({ name, description })),
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Error: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' }, request_id: { type: 'string' } }, required: ['error', 'code'] } },
    },
    paths,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(OPENAPI_FILE, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
  console.log(`Wrote ${OPENAPI_FILE} (${CATALOG.length} operations).`);
}
