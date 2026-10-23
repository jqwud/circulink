// Shared steps for the end-to-end tests: talk to the API directly to set things up, and log in in the browser.
import { expect } from '@playwright/test';

const port = Number(process.env.E2E_PORT) || 4300;
export const API = `http://127.0.0.1:${port}/api`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

export const loginApi = async (who) => (await api('POST', '/auth/login', null, { email: `${who}@hiraman.test`, password: 'hiraman123' })).json.token;

// A new resident who has sent an ID photo and waits for staff.
export async function residentWaitingForVerification(name, email) {
  const reg = await api('POST', '/auth/register', null, { name, email, password: 'goodpass1', accept_privacy: true });
  const token = reg.json.token;
  await api('POST', '/me/id-consent', token);
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'id.png');
  await fetch(`${API}/me/id-photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { id: reg.json.user.id, token };
}

// Logs in to the portal in English.
export async function portalLogin(page, who = 'admin') {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('hiraman_portal_lang', 'en'));
  await page.reload();
  await page.getByLabel('Email').fill(`${who}@hiraman.test`);
  await page.getByLabel('Password').fill('hiraman123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
}

export const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
