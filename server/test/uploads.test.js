// Uploads: only real JPG, PNG or WEBP files; friendly errors; ID photos replaced, not piled up.
import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pool } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, PNG, JPEG, WEBP, GIF } from './helpers/api.js';

const publicDir = path.join(process.env.UPLOAD_DIR, 'public');
const privateDir = path.join(process.env.UPLOAD_DIR, 'private');
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
let s; let ana; let isa;

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  ana = await s.login('ana');
  isa = await s.login('isa');
});
after(async () => { await s.close(); await pool.end(); });

describe('public photo uploads', () => {
  test('a real PNG, JPEG or WEBP is accepted and named by what it really is', async () => {
    const png = await s.upload('/uploads', ana, PNG, 'image/png', 'a.png');
    assert.equal(png.status, 201); assert.match(png.json.url, /^\/uploads\/public\/[a-f0-9]{24}\.png$/);
    const jpg = await s.upload('/uploads', ana, JPEG, 'image/jpeg', 'b.jpg');
    assert.equal(jpg.status, 201); assert.match(jpg.json.url, /\.jpg$/);
    const webp = await s.upload('/uploads', ana, WEBP, 'image/webp', 'c.webp');
    assert.equal(webp.status, 201); assert.match(webp.json.url, /\.webp$/);
    // A PNG sent with the wrong label is still stored as .png
    const mislabeled = await s.upload('/uploads', ana, PNG, 'image/jpeg', 'd.jpg');
    assert.equal(mislabeled.status, 201); assert.match(mislabeled.json.url, /\.png$/);
  });

  test('a GIF is refused with a friendly 400, not a server error', async () => {
    const r = await s.upload('/uploads', ana, GIF, 'image/gif', 'x.gif');
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'bad_file_type');
    assert.equal(r.json.error, 'Only JPG, PNG or WEBP photos are allowed.');
  });

  test('a text file pretending to be a JPEG is refused and not kept on disk', async () => {
    const before = files(publicDir).length;
    const r = await s.upload('/uploads', ana, Buffer.from('this is not a photo'), 'image/jpeg', 'fake.jpg');
    assert.equal(r.status, 400); assert.equal(r.json.code, 'bad_file_type');
    assert.equal(files(publicDir).length, before);
  });

  test('a file over 5 MB is refused with a clear message', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const r = await s.upload('/uploads', ana, big, 'image/png', 'big.png');
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'file_too_large');
    assert.match(r.json.error, /5 MB/);
  });
});

describe('ID photos', () => {
  test('a new ID photo replaces the old file instead of keeping both', async () => {
    const first = await s.upload('/me/id-photo', isa, PNG, 'image/png', 'id1.png');
    assert.equal(first.status, 200);
    assert.equal(files(privateDir).length, 1);
    const oldFile = files(privateDir)[0];
    const second = await s.upload('/me/id-photo', isa, JPEG, 'image/jpeg', 'id2.jpg');
    assert.equal(second.status, 200);
    assert.deepEqual(files(privateDir).length, 1);
    assert.notEqual(files(privateDir)[0], oldFile);
  });

  test('a fake ID photo is refused and the account stays as it was', async () => {
    const r = await s.upload('/me/id-photo', isa, Buffer.from('nope'), 'image/png', 'id.png');
    assert.equal(r.status, 400); assert.equal(r.json.code, 'bad_file_type');
    assert.equal(files(privateDir).length, 1);
  });
});
