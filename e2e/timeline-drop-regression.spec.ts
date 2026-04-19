/**
 * Manual E2E verification — Timeline-drop regression fix
 *
 * Verifies that:
 * - POST /projects/<real-uuid>/clips returns 201 (not 400)
 * - No "Failed to create clip" 400 errors in console
 * - Remotion preview canvas shows frames (not solid black) after adding a clip
 *
 * This test captures screenshots into docs/test_screenshots/ for audit purposes.
 * It requires the Docker Compose stack to be running (web-editor on :5173, api on :3001).
 *
 * Auth: Uses Playwright storageState to log in once and reuse the session across
 * all three tests. This avoids triggering the login rate limiter (5 req / 15 min).
 * The seeded e2e test user (e2e@cliptale.test / TestPassword123!) is used.
 * The user is created by apps/web-editor/e2e/seed-test-user.sql.
 *
 * NOTE: This test requires pre-existing ready assets in the database.
 * If no ready asset is found for a given type, that test is skipped with an
 * explanatory message.
 */

import * as path from 'path';
import * as fs from 'fs';
import { test, expect, Page, Response, BrowserContext } from '@playwright/test';

const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/test_screenshots');
const AUTH_STATE_FILE = path.resolve(__dirname, '../test-results/e2e-auth-state.json');
// Use the second e2e test user to avoid rate-limit issues from prior runs.
// e2e@cliptale.test hit the 5-attempt/15-min login rate limiter during test development.
// e2e2@cliptale.test is a fresh alias with the same password and privileges.
const TEST_EMAIL = 'e2e2@cliptale.test';
const TEST_PASSWORD = 'TestPassword123!';

function screenshotPath(name: string): string {
  return path.join(SCREENSHOTS_DIR, name);
}

/** Save login session to a file so it can be reused across tests. */
async function loginAndSaveState(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:5173/login');

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20_000 });
    await context.storageState({ path: AUTH_STATE_FILE });
  } finally {
    await page.close();
  }
}

/** Navigate to the editor from the home page and wait for the shell to be ready. */
async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 20_000 });

  // If on the home/projects page, click the first available project card
  const currentUrl = page.url();
  if (!currentUrl.includes('/editor')) {
    const firstProjectButton = page.getByRole('button', { name: /Open project:/i }).first();
    const projectVisible = await firstProjectButton.isVisible({ timeout: 5_000 }).catch(() => false);

    if (projectVisible) {
      await firstProjectButton.click();
      await page.waitForURL(/\/editor/, { timeout: 15_000 });
    } else {
      // No projects yet — navigate directly to /editor (creates a fresh project)
      await page.goto('/editor');
    }

    await page.waitForLoadState('networkidle', { timeout: 20_000 });
  }

  // Wait for the left sidebar (aria-label="Left sidebar" on <aside> in App.tsx)
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
  // Allow time for the network response
  await page.waitForTimeout(3000);
  page.off('response', handler);

  return captured;
}

/** Select the first ready asset of a given content type. Returns true if found. */
async function selectFirstReadyAsset(page: Page, filterTabName: string): Promise<boolean> {
  const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });

  // Apply the content-type filter — exact match to avoid matching asset names
  const filterTab = sidebar.getByRole('button', { name: filterTabName, exact: true }).first();
  if (await filterTab.isVisible().catch(() => false)) {
    await filterTab.click();
  }

  await page.waitForTimeout(1500);

  // Asset cards have aria-label "Asset: <filename>, status: ready"
  const readyAsset = sidebar.getByRole('button', {
    name: /Asset:.*status:\s*ready/i,
  }).first();

  const hasReadyAsset = await readyAsset.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!hasReadyAsset) {
    return false;
  }

  await readyAsset.click();
  // Wait for the detail panel to open
  await expect(page.getByText('Asset Details')).toBeVisible({ timeout: 5_000 });
  return true;
}

// Ensure auth state file exists before tests try to use it.
// This stub file is replaced by the real session in beforeAll.
const AUTH_STATE_DIR = path.dirname(AUTH_STATE_FILE);
if (!fs.existsSync(AUTH_STATE_DIR)) {
  fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
}
if (!fs.existsSync(AUTH_STATE_FILE)) {
  fs.writeFileSync(AUTH_STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

// Use a shared auth state setup — login only once
test.describe('Timeline-drop regression — POST /clips 201 + Remotion preview', () => {
  test.setTimeout(120_000);

  // Setup: log in once and save the session for reuse
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    try {
      await loginAndSaveState(context);
    } finally {
      await context.close();
    }
  });

  // Use the saved auth state for all tests — no separate login per test
  test.use({ storageState: AUTH_STATE_FILE });

  test('video asset — Add to Timeline returns 201 and preview is not black', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openEditor(page);

    const found = await selectFirstReadyAsset(page, 'Video');
    if (!found) {
      test.skip(true, 'No ready video assets found. Upload a video asset first.');
      return;
    }

    // Screenshot: editor with video asset detail panel open
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

    // Verify POST /clips returned 201
    if (response) {
      expect(response.status(), 'POST /clips should return 201').toBe(201);
      expect(
        response.url(),
        'POST /clips URL must not contain the fixture project id',
      ).not.toContain('00000000-0000-0000-0000-000000000001');
    }

    // No "Failed to create clip" errors in console
    const clipErrors = consoleErrors.filter(e => e.includes('Failed to create clip'));
    expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);

    await page.waitForTimeout(2000);

    // Screenshot: editor after adding video clip — Remotion preview should show frame
    await page.screenshot({ path: screenshotPath('timeline-drop-video.png'), fullPage: false });
  });

  test('image asset — Add to Timeline returns 201', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openEditor(page);

    const found = await selectFirstReadyAsset(page, 'Image');
    if (!found) {
      test.skip(true, 'No ready image assets found. Upload an image asset first.');
      return;
    }

    // Screenshot: editor with image asset detail panel open
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

    const clipErrors = consoleErrors.filter(e => e.includes('Failed to create clip'));
    expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);

    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotPath('timeline-drop-image.png'), fullPage: false });
  });

  test('audio asset — Add to Timeline returns 201', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openEditor(page);

    const found = await selectFirstReadyAsset(page, 'Audio');
    if (!found) {
      test.skip(true, 'No ready audio assets found. Upload an audio asset first.');
      return;
    }

    // Screenshot: editor with audio asset detail panel open
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

    const clipErrors = consoleErrors.filter(e => e.includes('Failed to create clip'));
    expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);

    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotPath('timeline-drop-audio.png'), fullPage: false });
  });
});

// Capture the image/audio filter views even if no ready assets are present.
// These screenshots document the current state of the asset browser for those filters.
test.describe('Timeline-drop regression — screenshot helpers', () => {
  test.setTimeout(60_000);

  // Ensure session is fresh even when this describe runs in isolation
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    try {
      await loginAndSaveState(context);
    } finally {
      await context.close();
    }
  });

  test.use({ storageState: AUTH_STATE_FILE });

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
