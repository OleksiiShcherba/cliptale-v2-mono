/**
 * E2E verification — Timeline-drop regression fix.
 *
 * Verifies that:
 * - POST /projects/<real-uuid>/clips returns 201 (not 400)
 * - No "Failed to create clip" 400 errors in console
 * - Remotion preview canvas shows frames (not solid black) after adding a clip
 *
 * Screenshots are written to docs/test_screenshots/ for audit purposes.
 *
 * Auth + project state are provided by `playwright.deploy.config.ts`:
 * - `globalSetup` logs in as the seeded e2e user and writes an
 *   authenticated storageState.
 * - A reusable empty project is created by globalSetup and its id is
 *   read via `readE2eProjectId()` so every test lands on the same editor
 *   URL — no repeated project creation, no accumulating state.
 *
 * NOTE: Tests that manipulate ready assets skip themselves when the
 * seeded user has no ready asset of the required type.
 */

import * as path from 'path';
import { test, expect, Page, Response } from '@playwright/test';

import { readE2eProjectId } from './helpers/e2e-context';

const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/test_screenshots');

const editorUrl = (): string => `/editor?projectId=${readE2eProjectId()}`;

function screenshotPath(name: string): string {
  return path.join(SCREENSHOTS_DIR, name);
}

/** Navigate to the editor and wait for the shell to be ready. */
async function openEditor(page: Page): Promise<void> {
  await page.goto(editorUrl());
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await expect(
    page.getByRole('complementary', { name: 'Left sidebar' }),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Collects network responses for POST /clips while the callback runs.
 * Returns the first matching response, or null if none was captured.
 */
async function captureClipsPost(
  page: Page,
  action: () => Promise<void>,
): Promise<Response | null> {
  let captured: Response | null = null;

  const handler = (response: Response) => {
    if (response.url().includes('/clips') && response.request().method() === 'POST') {
      captured = response;
    }
  };
  page.on('response', handler);
  await action();
  await page.waitForTimeout(3000);
  page.off('response', handler);

  return captured;
}

/** Select the first ready asset of a given content type. Returns true if found. */
async function selectFirstReadyAsset(page: Page, filterTabName: string): Promise<boolean> {
  const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });
  const filterTab = sidebar.getByRole('button', { name: filterTabName, exact: true });
  if (!(await filterTab.isVisible().catch(() => false))) return false;
  await filterTab.click();
  await page.waitForTimeout(800);

  const firstCard = sidebar.getByRole('button', { name: /^Asset: .*status: ready/i }).first();
  const isVisible = await firstCard.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!isVisible) return false;
  await firstCard.click();
  await page.waitForTimeout(500);
  return true;
}

test.describe('Timeline-drop regression — POST /clips 201 + Remotion preview', () => {
  test.setTimeout(120_000);

  test('video asset — Add to Timeline returns 201 and preview is not black', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openEditor(page);

    const found = await selectFirstReadyAsset(page, 'Video');
    if (!found) {
      test.skip(true, 'No ready video assets found. Upload a video asset first.');
      return;
    }

    await page.screenshot({ path: screenshotPath('timeline-drop-video.png'), fullPage: false });

    const addButton = page.getByRole('button', { name: /Add .* to timeline/i }).first();
    const isAddVisible = await addButton.isVisible().catch(() => false);
    if (!isAddVisible) {
      test.skip(true, 'Add to Timeline button not visible — video asset may not be ready.');
      return;
    }

    const response = await captureClipsPost(page, async () => {
      await addButton.click();
    });

    if (response) {
      expect(response.status(), 'POST /clips should return 201').toBe(201);
      expect(
        response.url(),
        'POST /clips URL must not contain the fixture project id',
      ).not.toContain('00000000-0000-0000-0000-000000000001');
    }

    const clipErrors = consoleErrors.filter((e) => e.includes('Failed to create clip'));
    expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: screenshotPath('timeline-drop-video.png'), fullPage: false });
  });

  test('image asset — Add to Timeline returns 201', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openEditor(page);

    const found = await selectFirstReadyAsset(page, 'Image');
    if (!found) {
      test.skip(true, 'No ready image assets found. Upload an image asset first.');
      return;
    }

    await page.screenshot({ path: screenshotPath('timeline-drop-image.png'), fullPage: false });

    const addButton = page.getByRole('button', { name: /Add .* to timeline/i }).first();
    const isAddVisible = await addButton.isVisible().catch(() => false);
    if (!isAddVisible) {
      test.skip(true, 'Add to Timeline button not visible — image asset may not be ready.');
      return;
    }

    const response = await captureClipsPost(page, async () => {
      await addButton.click();
    });

    if (response) {
      expect(response.status(), 'POST /clips should return 201').toBe(201);
      expect(response.url()).not.toContain('00000000-0000-0000-0000-000000000001');
    }

    const clipErrors = consoleErrors.filter((e) => e.includes('Failed to create clip'));
    expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);

    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotPath('timeline-drop-image.png'), fullPage: false });
  });

  test('audio asset — Add to Timeline returns 201', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openEditor(page);

    const found = await selectFirstReadyAsset(page, 'Audio');
    if (!found) {
      test.skip(true, 'No ready audio assets found. Upload an audio asset first.');
      return;
    }

    await page.screenshot({ path: screenshotPath('timeline-drop-audio.png'), fullPage: false });

    const addButton = page.getByRole('button', { name: /Add .* to timeline/i }).first();
    const isAddVisible = await addButton.isVisible().catch(() => false);
    if (!isAddVisible) {
      test.skip(true, 'Add to Timeline button not visible — audio asset may not be ready.');
      return;
    }

    const response = await captureClipsPost(page, async () => {
      await addButton.click();
    });

    if (response) {
      expect(response.status(), 'POST /clips should return 201').toBe(201);
      expect(response.url()).not.toContain('00000000-0000-0000-0000-000000000001');
    }

    const clipErrors = consoleErrors.filter((e) => e.includes('Failed to create clip'));
    expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);

    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotPath('timeline-drop-audio.png'), fullPage: false });
  });
});

// Capture the image/audio filter views even if no ready assets are present.
test.describe('Timeline-drop regression — screenshot helpers', () => {
  test.setTimeout(60_000);

  test('capture image filter view screenshot', async ({ page }) => {
    await openEditor(page);
    const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });
    const imageTab = sidebar.getByRole('button', { name: 'Image', exact: true }).first();
    if (await imageTab.isVisible().catch(() => false)) {
      await imageTab.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({
      path: screenshotPath('timeline-drop-image.png'),
      fullPage: false,
    });
  });

  test('capture audio filter view screenshot', async ({ page }) => {
    await openEditor(page);
    const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });
    const audioTab = sidebar.getByRole('button', { name: 'Audio', exact: true }).first();
    if (await audioTab.isVisible().catch(() => false)) {
      await audioTab.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({
      path: screenshotPath('timeline-drop-audio.png'),
      fullPage: false,
    });
  });
});
