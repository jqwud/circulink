// Shared steps for the end-to-end tests: talk to the API directly to set things up, and log in in the browser.
import { expect } from '@playwright/test';

const port = Number(process.env.E2E_PORT) || 4300;
export const API = `http://127.0.0.1:${port}/api`;

export async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

export const loginApi = async (who) => (await api('POST', '/auth/login', null, { email: `${who}@circulink.test`, password: 'circulink123' })).json.token;

// Logs in to the portal in English.
export async function portalLogin(page, who = 'admin') {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('circulink_portal_lang', 'en'));
  await page.reload();
  await page.getByLabel('Email').fill(`${who}@circulink.test`);
  await page.getByLabel('Password').fill('circulink123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
}
