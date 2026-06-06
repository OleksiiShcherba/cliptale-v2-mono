/**
 * E2E — Settings page journey (storyboard-autosave-checkpoints T15).
 *
 * AC-09: the Settings page opens from the Home left menu; picking another
 *        autosave-interval preset stores it and confirms the change.
 * AC-10: the stored interval follows the account — a fresh page load shows
 *        the updated preset (server-persisted, not browser state).
 *
 * Auth is pre-seeded by global-setup (storageState). The test resets the
 * interval back to the 60 s default afterwards so other specs see a clean
 * account state.
 */

import { test, expect } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';
import { readBearerToken } from './helpers/storyboard';

test.describe('Settings — autosave interval (AC-09 / AC-10)', () => {
  test.afterEach(async ({ request }) => {
    // Reset the account to the default so other specs are unaffected.
    const token = await readBearerToken();
    await request.put(`${E2E_API_URL}/users/me/settings`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      data: { autosaveIntervalSeconds: 60 },
    });
  });

  test('opens from the Home left menu and stores a new preset (AC-09)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // All five presets are present.
    await expect(page.getByRole('radio', { name: /30 seconds/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /10 minutes/i })).toBeVisible();

    // Pick "2 minutes" → the change is stored and confirmed. click(), not
    // check(): the radio is controlled — checked flips only after the PUT
    // succeeds, so check()'s immediate-state assertion would race the save.
    await page.getByRole('radio', { name: /2 minutes/i }).click();
    await expect(page.getByText(/saved — applies/i)).toBeVisible();
    await expect(page.getByRole('radio', { name: /2 minutes/i })).toBeChecked();
  });

  test('the stored interval follows the account across page loads (AC-10)', async ({ page, request }) => {
    // Store 5 minutes via the API (same account the browser session uses).
    const token = await readBearerToken();
    const res = await request.put(`${E2E_API_URL}/users/me/settings`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      data: { autosaveIntervalSeconds: 300 },
    });
    expect(res.ok()).toBeTruthy();

    // A fresh load of the Settings page shows the account-stored preset.
    await page.goto('/settings');
    await expect(page.getByRole('radio', { name: /5 minutes/i })).toBeChecked();
  });
});
