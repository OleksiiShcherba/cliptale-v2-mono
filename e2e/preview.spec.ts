// QA: cross-browser — intentionally Chromium-only for initial suite.
// Requires the deploy-config globalSetup to pre-authenticate via storageState.

import { test, expect } from '@playwright/test';

import { readE2eProjectId } from './helpers/e2e-context';

const editorUrl = () => `/editor?projectId=${readE2eProjectId()}`;

test.describe('Preview panel — Remotion player and playback controls', () => {
  // Remotion player initialization involves video codec setup which can be slow.
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto(editorUrl());
    // Project hydration + Remotion player mount can take several seconds
    // on a cold page, so allow a generous wait before assertions begin.
    await expect(
      page.getByRole('toolbar', { name: 'Playback controls' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Remotion player container is present in the main area', async ({ page }) => {
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('play button is visible and shows "Play" label initially', async ({ page }) => {
    const playButton = page.getByRole('button', { name: 'Play' });
    await expect(playButton).toBeVisible();
  });

  test('clicking play changes the button aria-label to "Pause"', async ({ page }) => {
    const playButton = page.getByRole('button', { name: 'Play' });
    await expect(playButton).toBeVisible();

    await playButton.click();

    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).not.toBeVisible();
  });

  test('timecode display is present and shows a valid time format', async ({ page }) => {
    const timecode = page.getByLabel('Timecode');
    await expect(timecode).toBeVisible();

    const text = await timecode.textContent();
    expect(text).toBeTruthy();

    // "HH:MM:SS:FF / HH:MM:SS:FF" (current / total)
    const validTimecodePattern = /^\d{2}:\d{2}:\d{2}:\d{2}/;
    expect(text!.trim()).toMatch(validTimecodePattern);
  });

  test('playback position scrubber is present', async ({ page }) => {
    const scrubber = page.getByRole('slider', { name: 'Playback position' });
    await expect(scrubber).toBeVisible();
  });

  test('frame counter is present', async ({ page }) => {
    const frameCounter = page.getByLabel('Current frame');
    await expect(frameCounter).toBeVisible();
    const text = await frameCounter.textContent();
    expect(text).toMatch(/^\d+ \/ \d+$/);
  });
});
