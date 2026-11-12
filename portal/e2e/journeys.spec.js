// End-to-end journeys of the portal in a real browser. More journeys arrive with each build step.
import { expect, test } from '@playwright/test';
import { portalLogin } from './helpers.js';

test('staff, partners and admins log in and see the hubs', async ({ page }) => {
  for (const who of ['staff', 'partner', 'admin']) {
    await portalLogin(page, who);
    await expect(page.getByRole('cell', { name: 'Campus Green Hub' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Barangay San Isidro MRF' })).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
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
});
