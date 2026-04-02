// QA: cross-browser — intentionally Chromium-only for initial suite

import { test, expect } from '@playwright/test';

test.describe('Asset manager — panel and upload dropzone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the sidebar to confirm the asset manager is mounted
    await expect(
      page.getByRole('complementary', { name: 'Asset browser' }),
    ).toBeVisible();
  });

  test('asset browser panel is present', async ({ page }) => {
    await expect(
      page.getByRole('complementary', { name: 'Asset browser' }),
    ).toBeVisible();
  });

  test('filter tabs are visible (All, Video, Audio, Image)', async ({ page }) => {
    const sidebar = page.getByRole('complementary', { name: 'Asset browser' });

    await expect(sidebar.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Video' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Audio' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Image' })).toBeVisible();
  });

  test('search bar is visible', async ({ page }) => {
    const searchInput = page.getByRole('searchbox', { name: 'Search assets' });
    await expect(searchInput).toBeVisible();
  });

  test('empty-state message is shown when no assets are loaded', async ({ page }) => {
    // Without a live API the query will either fail or return an empty list.
    // Either way, the empty state text or error message should appear.
    // We allow both "no assets" text and "could not load" error text.
    const sidebar = page.getByRole('complementary', { name: 'Asset browser' });

    const emptyText = sidebar.getByText('No assets yet — upload to get started');
    const errorText = sidebar.getByRole('alert');

    // At least one of the two states must be present
    const hasEmpty = (await emptyText.count()) > 0;
    const hasError = (await errorText.count()) > 0;
    expect(hasEmpty || hasError).toBe(true);
  });

  test('upload button is present', async ({ page }) => {
    const uploadButton = page.getByRole('button', { name: /upload assets/i });
    await expect(uploadButton).toBeVisible();
  });

  test('clicking upload button opens the upload dropzone modal', async ({ page }) => {
    const uploadButton = page.getByRole('button', { name: /upload assets/i });
    await uploadButton.click();

    const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
    await expect(dialog).toBeVisible();
  });

  test('upload modal contains the drop zone area', async ({ page }) => {
    await page.getByRole('button', { name: /upload assets/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
    await expect(dialog).toBeVisible();

    // The drop zone contains the "Drop files here or browse" hint text
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

  // TODO: actual file upload flow is not tested here because it requires a running API
  // server (POST /projects/:id/assets/upload-url) and object storage (S3/R2) to issue
  // presigned upload URLs. Mocking those services at the E2E layer would defeat the
  // purpose of integration testing. Once Docker Compose is wired end-to-end in CI,
  // a separate test file (e2e/asset-upload-flow.spec.ts) should cover:
  //   1. Dragging a fixture file onto the dropzone
  //   2. Verifying the per-file progress bar appears (UploadProgressList)
  //   3. Verifying the asset card appears in the list after upload completes
});
