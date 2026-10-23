// The staff journeys that matter most, clicked through in a real browser.
import { expect, test } from '@playwright/test';
import { api, day, loginApi, portalLogin, residentWaitingForVerification } from './helpers.js';

test('staff verify a new resident, who then has starter credits', async ({ page }) => {
  const r = await residentWaitingForVerification('Paolo Santos', 'paolo@hiraman.test');
  await portalLogin(page, 'staff');
  await page.getByRole('link', { name: /Verification/ }).click();
  const row = page.getByRole('row', { name: /Paolo Santos/ });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Resident approved/)).toBeVisible();
  await expect(page.getByRole('row', { name: /Paolo Santos/ })).toHaveCount(0);
  expect((await api('GET', '/me', r.token)).json.credits).toBe(3);
});

test('staff settle a disputed return as an accident; the owner gets a credit', async ({ page }) => {
  const [carlo, ben] = await Promise.all([loginApi('carlo'), loginApi('ben')]);
  const cooler = (await api('GET', '/items?q=Cooler', carlo)).json[0];
  const loan = await api('POST', '/requests', carlo, { item_id: cooler.id, start_date: day(0), end_date: day(1) });
  await api('POST', `/requests/${loan.json.id}/handover`, ben);
  await api('POST', `/requests/${loan.json.id}/return`, ben, { condition: 'damaged', note: 'Cracked lid' });
  const before = (await api('GET', '/me', ben)).json.credits;

  await portalLogin(page, 'staff');
  await page.getByRole('link', { name: /Reports & disputes/ }).click();
  await page.getByRole('row', { name: new RegExp(`request #${loan.json.id}`) }).getByRole('button', { name: 'View' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Outcome').fill('Talked with both. The lid cracked in the heat.');
  await dialog.getByLabel(/An accident, nobody to blame/).check();
  await dialog.getByRole('button', { name: 'Resolve case' }).click();
  await expect(page.getByText('Case updated.')).toBeVisible();
  expect((await api('GET', '/me', ben)).json.credits).toBe(before + 1);
  expect((await api('GET', `/requests/${loan.json.id}`, carlo)).json.dispute_outcome).toBe('accident');
});

test('a flagged listing raises the alert, and staff clear it after checking', async ({ page }) => {
  const ana = await loginApi('ana');
  const flagged = await api('POST', '/items', ana, { title: 'Old g.u.n for display', category_id: 2, pickup_point_id: 1, tier: 'low' });
  expect(flagged.json.review_status).toBe('flagged');

  await portalLogin(page, 'admin');
  await expect(page.getByRole('alert').filter({ hasText: /may harm the community/ })).toBeVisible();
  await page.getByRole('link', { name: /Review now/ }).click();
  const row = page.getByRole('row', { name: /Old g\.u\.n for display/ });
  await expect(row.getByText(/written in disguise/)).toBeVisible();
  await row.getByRole('button', { name: 'Looks fine, show it' }).click();
  await expect(page.getByText('Visible to neighbors again.')).toBeVisible();
  expect((await api('GET', `/items/${flagged.json.id}`, await loginApi('ben'))).status).toBe(200);
});

test('a harassment concern raises the urgent alert, and staff answer it', async ({ page }) => {
  const fidel = await loginApi('fidel');
  const luggage = (await api('GET', '/items?q=luggage', fidel)).json[0];
  const loan = await api('POST', '/requests', fidel, { item_id: luggage.id, start_date: day(20), end_date: day(21) });
  const sent = await api('POST', `/requests/${loan.json.id}/messages`, fidel, { body: 'free text is not allowed' });
  expect(sent.json.code).toBe('phrases_only');
  expect((await api('POST', '/reports', fidel, { target_type: 'request', target_id: loan.json.id, reason: 'harassment', details: 'Keeps asking for money' })).status).toBe(201);

  await portalLogin(page, 'staff');
  await expect(page.getByRole('alert').filter({ hasText: /safety or harassment/ })).toBeVisible();
  await page.getByRole('link', { name: /Answer now/ }).click();
  const row = page.getByRole('row', { name: new RegExp(`request #${loan.json.id}`) });
  await expect(row.getByText('Urgent')).toBeVisible();
  await expect(row.getByText('Rude or harassing behavior')).toBeVisible();
  await row.getByRole('button', { name: 'View' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Outcome').fill('Called both. Reminded Ana that no money is ever asked on Hiraman.');
  await dialog.getByRole('button', { name: 'Resolve case' }).click();
  await expect(page.getByText('Case updated.')).toBeVisible();
  const note = (await api('GET', '/notifications', fidel)).json.find((n) => n.type === 'report_resolved');
  expect(note).toBeTruthy();
});

test('staff choose who receives a gift, and the priority household is listed first', async ({ page }) => {
  const [ana, ben, dina, staffTok] = await Promise.all([loginApi('ana'), loginApi('ben'), loginApi('dina'), loginApi('staff')]);
  const gift = await api('POST', '/items', ana, { title: 'Electric fan (gift)', category_id: 4, pickup_point_id: 1, tier: 'low', listing_type: 'donate', claim_mode: 'barangay' });
  expect(gift.status).toBe(201);
  await api('POST', `/items/${gift.json.id}/claim`, ben);
  await api('POST', `/items/${gift.json.id}/claim`, dina);
  const dinaId = (await api('GET', '/admin/users?q=dina', staffTok)).json[0].id;
  await api('POST', `/admin/users/${dinaId}/priority`, staffTok, { priority: true });

  await portalLogin(page, 'staff');
  await page.getByRole('link', { name: /Donations/ }).click();
  const row = page.getByRole('row', { name: /Electric fan \(gift\)/ });
  await expect(row.getByText('Priority household')).toBeVisible();
  await row.getByRole('button', { name: 'Choose' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Resident', { exact: true })).toHaveValue(String(dinaId));
  await dialog.getByLabel(/The barangay delivers it/).check();
  await dialog.getByRole('button', { name: 'Choose' }).click();
  await expect(page.getByText('Chosen. Everyone involved was told.')).toBeVisible();
  const mine = (await api('GET', '/donations/mine', dina)).json;
  expect(mine.find((c) => c.item.id === gift.json.id).status).toBe('reserved');
});
