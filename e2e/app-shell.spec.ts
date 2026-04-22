// QA: cross-browser — intentionally Chromium-only for initial suite.
// Requires the deploy-config globalSetup to pre-authenticate via storageState
// and seed a reusable projectId in e2e-deploy-context.json.

import { test, expect } from '@playwright/test';

import { readE2eProjectId } from './helpers/e2e-context';

const editorUrl = () => `/editor?projectId=${readE2eProjectId()}`;

test.describe('App shell — two-column layout smoke tests', () => {
  test('left sidebar is visible', async ({ page }) => {
    await page.goto(editorUrl());

    const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });
    await expect(sidebar).toBeVisible();
  });

  test('preview area (main content region) is visible', async ({ page }) => {
    await page.goto(editorUrl());

    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('no uncaught JS errors on load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto(editorUrl());
    await page.waitForLoadState('networkidle');

    expect(jsErrors).toEqual([]);
  });
});
