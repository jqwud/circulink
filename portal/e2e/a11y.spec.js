// Accessibility scan (axe: WCAG 2.2 A and AA, plus its best-practice rules) of the login page and every main portal page. Any problem fails,
// whatever its impact: the portal was clean when this test was added (batch 25), so keep it that way.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { portalLogin } from './helpers.js';

const PAGES = ['/', '/verification', '/residents', '/listings', '/shelf', '/transactions', '/reports', '/announcements', '/impact', '/rules', '/staff'];

test('the login page has no accessibility problems', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Log in|Mag-log in/ })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
});

test('every portal page has no accessibility problems', async ({ page }) => {
  await portalLogin(page, 'admin');
  const problems = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    for (const v of result.violations) {
      problems.push(`${path} ${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    }
  }
  expect(problems).toEqual([]);
});
