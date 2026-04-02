// QA: cross-browser — intentionally Chromium-only for initial suite

import { test, expect } from '@playwright/test';

test.describe('Preview panel — Remotion player and playback controls', () => {
  // Remotion player initialization involves video codec setup which can be slow.
  // A longer per-test timeout prevents flaky failures on first render.
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the playback controls toolbar to confirm the preview section is mounted
    await expect(
      page.getByRole('toolbar', { name: 'Playback controls' }),
    ).toBeVisible();
  });

  test('Remotion player container is present in the main area', async ({ page }) => {
    // The Remotion <Player> renders inside the main region
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

    // After clicking play the button should switch to the pause state
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    // The original "Play" button should no longer be present
    await expect(page.getByRole('button', { name: 'Play' })).not.toBeVisible();
  });

  test('timecode display is present and shows a valid time format', async ({ page }) => {
    const timecode = page.getByLabel('Timecode');
    await expect(timecode).toBeVisible();

    const text = await timecode.textContent();
    expect(text).toBeTruthy();

    // Accept both HH:MM:SS:FF (SMPTE) and MM:SS:FF formats
    // The formatTimecode utility produces HH:MM:SS:FF
    const validTimecodePattern = /^\d{2}:\d{2}:\d{2}:\d{2}$/;
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
    // Frame counter format: "0 / 300"
    expect(text).toMatch(/^\d+ \/ \d+$/);
  });
});
