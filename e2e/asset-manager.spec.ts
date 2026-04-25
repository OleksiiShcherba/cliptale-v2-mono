// QA: cross-browser — intentionally Chromium-only for initial suite.
// Requires the deploy-config globalSetup to pre-authenticate via storageState.

import { test, expect } from '@playwright/test';

import { installCorsWorkaround } from './helpers/cors-workaround';
import { readE2eProjectId } from './helpers/e2e-context';
import { readBearerToken } from './helpers/storyboard';

const editorUrl = () => `/editor?projectId=${readE2eProjectId()}`;

test.describe('Asset manager — panel and upload dropzone', () => {
  test.beforeEach(async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);
    await page.goto(editorUrl());
    await expect(
      page.getByRole('complementary', { name: 'Left sidebar' }),
    ).toBeVisible();
  });

  test('left sidebar hosting the asset browser is present', async ({ page }) => {
    await expect(
      page.getByRole('complementary', { name: 'Left sidebar' }),
    ).toBeVisible();
  });

  test('filter tabs are visible (All, Video, Audio, Image)', async ({ page }) => {
    const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });

    await expect(sidebar.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Video', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Audio', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Image', exact: true })).toBeVisible();
  });

  test('search bar is visible', async ({ page }) => {
    const searchInput = page.getByRole('searchbox', { name: 'Search assets' });
    await expect(searchInput).toBeVisible();
  });

  test('asset list region resolves to a deterministic state', async ({ page }) => {
    // The seeded e2e user's project state is not guaranteed to be empty on a
    // deploy instance (prior runs may have left assets linked). Assert only
    // that the async asset query settles into one of the four observable
    // states: populated cards / empty-state copy / alert / "Loading…"
    // (we wait for loading to finish though).
    const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });

    await expect(async () => {
      const emptyText = sidebar.getByText('No assets yet — upload to get started');
      const errorText = sidebar.getByRole('alert');
      const assetCards = sidebar.getByRole('button', { name: /^Asset: /i });
      const hasEmpty = (await emptyText.count()) > 0;
      const hasError = (await errorText.count()) > 0;
      const hasCards = (await assetCards.count()) > 0;
      expect(hasEmpty || hasError || hasCards).toBe(true);
    }).toPass({ timeout: 15_000 });
  });

  test('upload button is present', async ({ page }) => {
    const uploadButton = page.getByRole('button', { name: /upload assets/i });
    await expect(uploadButton).toBeVisible();
  });

  test('clicking upload button opens the upload dropzone modal', async ({ page }) => {
    await page.getByRole('button', { name: /upload assets/i }).click();
    await expect(page.getByRole('dialog', { name: 'Upload Assets' })).toBeVisible();
  });

  test('upload modal contains the drop zone area', async ({ page }) => {
    await page.getByRole('button', { name: /upload assets/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Drop files here or browse')).toBeVisible();
  });

  test('upload modal contains the Browse Files button', async ({ page }) => {
    await page.getByRole('button', { name: /upload assets/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
    await expect(dialog.getByRole('button', { name: 'Browse Files' })).toBeVisible();
  });

  test('upload modal can be closed via the close button', async ({ page }) => {
    await page.getByRole('button', { name: /upload assets/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Close upload modal' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('upload modal can be closed via the Cancel button', async ({ page }) => {
    await page.getByRole('button', { name: /upload assets/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
