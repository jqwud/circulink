// Starts the API on a free port and gives tests small helpers to call it.
// Import './env.js' before this file so the server uses the test database.
import { createApp } from '../../src/app.js';

// A 1x1 PNG, the start of a JPEG and the start of a WEBP: enough for the file-signature check.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(14)]);
export const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');

// Philippine date n days from today, YYYY-MM-DD.
export const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export function startServer(options) {
  const server = createApp(options).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function api(method, p, token, body) {
    const res = await fetch(base + p, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* csv or empty */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  async function upload(p, token, bytes, type, name) {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type }), name);
    const res = await fetch(base + p, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json };
  }

  const login = async (who) => (await api('POST', '/auth/login', null, { email: `${who}@hiraman.test`, password: 'hiraman123' })).json.token;
  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, api, upload, login, close };
}
