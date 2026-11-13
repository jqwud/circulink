// End-to-end journeys of the portal in a real browser, against the real API on the test database.
import { expect, test } from '@playwright/test';
import { api, loginApi, portalLogin } from './helpers.js';

const logout = async (page) => {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
};

test('staff, partners and admins log in and see the hubs', async ({ page }) => {
  for (const who of ['staff', 'partner', 'admin']) {
    await portalLogin(page, who);
    await expect(page.getByRole('cell', { name: 'Campus Green Hub' })).toBeVisible();
    await logout(page);
  }
});

test('a resident is turned away from the portal', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('ana@circulink.test');
  await page.getByLabel('Password').fill('circulink123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('Residents use the CircuLink app');
});

test('the language switch changes the words', async ({ page }) => {
  await portalLogin(page, 'staff');
  await page.getByRole('button', { name: 'Filipino' }).click();
  await expect(page.getByRole('heading', { name: /Magandang araw/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tanggapin at pagsunod-sunurin' })).toBeVisible();
});

test('the whole loop: check in, sort, a partner asks, hand over, recycle, and the points are confirmed', async ({ page }) => {
  // A resident declares two items in the app (here, through the API).
  const ana = await loginApi('ana');
  const hub = (await api('GET', '/hubs')).json.find((h) => h.type === 'school');
  const cats = (await api('GET', '/meta', ana)).json.categories;
  const id = (slug) => cats.find((c) => c.slug === slug).id;
  const d = (await api('POST', '/declarations', ana, { hub_id: hub.id, items: [{ category_id: id('clothes'), description: 'Winter jackets' }, { category_id: id('plastic') }] })).json;

  // Staff: check in by code (typed in lower case), then weigh and sort each item.
  await portalLogin(page, 'staff');
  await page.getByRole('link', { name: 'Check in and sort' }).click();
  await page.getByLabel('Drop-off code').fill(d.code.toLowerCase());
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drop-off of Ana Dela Cruz' })).toBeVisible();
  const [first, second] = d.items.map((i) => i.id);
  await page.locator(`#item-${first}-kg`).fill('2');
  await page.locator(`#item-${first}-out`).selectOption('reuse');
  await page.locator('form.sort-row').first().getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Sorted: 20 points')).toBeVisible();
  await page.locator(`#item-${second}-kg`).fill('1');
  await page.locator(`#item-${second}-out`).selectOption('recycle');
  await page.locator('form.sort-row').first().getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('All items sorted.')).toBeVisible();
  await logout(page);

  // Partner: choose the jackets and ask for them.
  await portalLogin(page, 'partner');
  await page.getByRole('link', { name: 'Available items' }).click();
  const row = page.getByRole('row', { name: /Winter jackets/ });
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Ask for these items' }).click();
  await page.getByLabel('Note for the hub (optional)').fill('Sister Rosa will pick up on Saturday');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible();
  await expect(page.getByText('Sister Rosa will pick up on Saturday')).toBeVisible();
  await logout(page);

  // Staff: hand the jackets over; put the plastic in a batch and send it.
  await portalLogin(page, 'staff');
  await page.getByRole('link', { name: 'Releases to partners' }).click();
  await expect(page.getByRole('heading', { name: 'Lingap Shelter' })).toBeVisible();
  await page.getByRole('button', { name: 'Hand over' }).click();
  await expect(page.getByText('Handed over. Points confirmed.')).toBeVisible();
  await page.getByRole('link', { name: 'Stock and recycling' }).click();
  await page.getByRole('tab', { name: /For recycling/ }).click();
  await page.getByRole('checkbox', { name: new RegExp(`Plastic bottles ${second}$`) }).check();
  await page.getByRole('button', { name: 'Make a recycle batch' }).click();
  await page.getByLabel('Recycler').selectOption({ label: 'Mang Rudy Junk Shop' });
  await page.getByRole('button', { name: 'Make batch' }).click();
  await expect(page.getByText('Batch made.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark as sent' }).first().click();
  await expect(page.getByText('Batch sent. Points confirmed.')).toBeVisible();
  await logout(page);

  // Partner confirms the jackets arrived.
  await portalLogin(page, 'partner');
  await page.getByRole('link', { name: 'My requests' }).click();
  await page.getByRole('button', { name: 'We received them' }).click();
  await expect(page.getByText('Thank you. Marked as received.')).toBeVisible();

  // Both items are final: 20 (2 kg clothes, reuse) + 2 (1 kg plastic, recycle) confirmed points.
  const impact = (await api('GET', '/me/impact', ana)).json;
  expect(impact.points_confirmed).toBe(22);
  expect(impact.kg_kept).toBe(3);
});

test('e-waste cannot go to a recycler that is not accredited', async ({ page }) => {
  const ana = await loginApi('ana');
  const staff = await loginApi('staff');
  const hub = (await api('GET', '/hubs')).json.find((h) => h.type === 'school');
  const ewaste = (await api('GET', '/meta', ana)).json.categories.find((c) => c.slug === 'ewaste').id;
  const d = (await api('POST', '/declarations', ana, { hub_id: hub.id, items: [{ category_id: ewaste, description: 'Old phones' }] })).json;
  await api('POST', '/staff/checkin', staff, { code: d.code });
  await api('POST', `/staff/items/${d.items[0].id}/sort`, staff, { weight_kg: 0.8, outcome: 'recycle' });

  await portalLogin(page, 'staff');
  await page.getByRole('link', { name: 'Stock and recycling' }).click();
  await page.getByRole('tab', { name: /For recycling/ }).click();
  await page.getByRole('checkbox', { name: new RegExp(`E-waste .* ${d.items[0].id}$`) }).check();
  await page.getByRole('button', { name: 'Make a recycle batch' }).click();
  await expect(page.getByText('only an accredited recycler can take it')).toBeVisible();
  await expect(page.getByRole('option', { name: 'Mang Rudy Junk Shop' })).toBeDisabled();
});

test('an admin approves a partner, makes a staff account and changes a point rate', async ({ page }) => {
  await portalLogin(page, 'admin');
  await page.getByRole('link', { name: 'Partner organizations' }).click();
  const row = page.getByRole('row', { name: /Bagong Pag-asa NGO/ });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row.getByText('Approved')).toBeVisible();

  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByRole('button', { name: 'New account' }).click();
  await page.getByLabel('Full name').fill('Lito Bautista');
  await page.getByLabel('Email').fill('lito.portal@example.com');
  await page.getByRole('checkbox', { name: 'Barangay San Isidro MRF' }).check();
  await page.getByRole('button', { name: 'Make account' }).click();
  await expect(page.getByRole('heading', { name: 'Temporary password for Lito Bautista' })).toBeVisible();
  await expect(page.locator('.temp-password')).toHaveText(/^[a-z2-9]{10}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('row', { name: /Lito Bautista.*Barangay San Isidro MRF/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /CircuLink Admin/ }).getByText('You')).toBeVisible();

  await page.getByRole('link', { name: 'Categories' }).click();
  await page.getByRole('row', { name: /Toys/ }).getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Points per kg (0 to 50)').fill('7');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /Toys/ }).getByRole('cell', { name: '7', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('cell', { name: /category updated/ }).first()).toBeVisible();
});

test('an admin reads the monthly impact report and exports it', async ({ page }) => {
  // Ben brings 3 kg of cans to the barangay hub; staff there recycle them.
  const ben = await loginApi('ben');
  const staff2 = await loginApi('staff2');
  const hub = (await api('GET', '/hubs')).json.find((h) => h.type === 'barangay');
  const cans = (await api('GET', '/meta', ben)).json.categories.find((c) => c.slug === 'cans').id;
  const d = (await api('POST', '/declarations', ben, { hub_id: hub.id, items: [{ category_id: cans }] })).json;
  await api('POST', '/staff/checkin', staff2, { code: d.code });
  expect((await api('POST', `/staff/items/${d.items[0].id}/sort`, staff2, { weight_kg: 3, outcome: 'recycle' })).status).toBe(200);

  await portalLogin(page, 'admin');
  await page.getByRole('link', { name: 'Impact reports' }).click();
  await expect(page.getByRole('heading', { name: 'Impact reports' })).toBeVisible();
  await page.getByLabel('Hub').selectOption({ label: hub.name });
  await expect(page.getByRole('row', { name: new RegExp(hub.name) })).toContainText('3 kg');
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await file).suggestedFilename()).toMatch(/^circulink-report-\d{4}-\d{2}\.csv$/);
});
