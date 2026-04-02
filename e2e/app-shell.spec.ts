// QA: cross-browser — intentionally Chromium-only for initial suite

import { test, expect } from '@playwright/test';

test.describe('App shell — two-column layout smoke tests', () => {
  test('asset browser sidebar is visible', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.getByRole('complementary', { name: 'Asset browser' });
    await expect(sidebar).toBeVisible();
  });

  test('preview area (main content region) is visible', async ({ page }) => {
    await page.goto('/');

    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('no uncaught JS errors on load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/');

    // Allow the page to fully initialize before asserting
    await page.waitForLoadState('networkidle');

    expect(jsErrors).toEqual([]);
  });
});
