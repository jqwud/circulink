// Accessibility scan (axe: WCAG 2.2 A and AA, plus its best-practice rules) of the login page and every page
// of each role. Any problem fails, whatever its impact: keep the portal clean.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { portalLogin } from './helpers.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PAGES = {
  admin: ['/', '/check-in', '/stock', '/releases', '/reports', '/flags', '/accounts', '/partners', '/places', '/categories', '/audit'],
  partner: ['/', '/browse', '/requests'],
};

test('the login page has no accessibility problems', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Log in|Mag-log in/ })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
});

for (const [who, paths] of Object.entries(PAGES)) {
  test(`every ${who} page has no accessibility problems`, async ({ page }) => {
    await portalLogin(page, who);
    const problems = [];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of result.violations) {
        problems.push(`${path} ${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
      }
    }
    expect(problems).toEqual([]);
  });
}
