# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: preview.spec.ts >> Preview panel — Remotion player and playback controls >> playback position scrubber is present
- Location: e2e/preview.spec.ts:54:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('toolbar', { name: 'Playback controls' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('toolbar', { name: 'Playback controls' })

```

# Test source

```ts
  1  | // QA: cross-browser — intentionally Chromium-only for initial suite
  2  | 
  3  | import { test, expect } from '@playwright/test';
  4  | 
  5  | test.describe('Preview panel — Remotion player and playback controls', () => {
  6  |   // Remotion player initialization involves video codec setup which can be slow.
  7  |   // A longer per-test timeout prevents flaky failures on first render.
  8  |   test.setTimeout(60_000);
  9  | 
  10 |   test.beforeEach(async ({ page }) => {
  11 |     await page.goto('/');
  12 |     // Wait for the playback controls toolbar to confirm the preview section is mounted
  13 |     await expect(
  14 |       page.getByRole('toolbar', { name: 'Playback controls' }),
> 15 |     ).toBeVisible();
     |       ^ Error: expect(locator).toBeVisible() failed
  16 |   });
  17 | 
  18 |   test('Remotion player container is present in the main area', async ({ page }) => {
  19 |     // The Remotion <Player> renders inside the main region
  20 |     const main = page.getByRole('main');
  21 |     await expect(main).toBeVisible();
  22 |   });
  23 | 
  24 |   test('play button is visible and shows "Play" label initially', async ({ page }) => {
  25 |     const playButton = page.getByRole('button', { name: 'Play' });
  26 |     await expect(playButton).toBeVisible();
  27 |   });
  28 | 
  29 |   test('clicking play changes the button aria-label to "Pause"', async ({ page }) => {
  30 |     const playButton = page.getByRole('button', { name: 'Play' });
  31 |     await expect(playButton).toBeVisible();
  32 | 
  33 |     await playButton.click();
  34 | 
  35 |     // After clicking play the button should switch to the pause state
  36 |     await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  37 |     // The original "Play" button should no longer be present
  38 |     await expect(page.getByRole('button', { name: 'Play' })).not.toBeVisible();
  39 |   });
  40 | 
  41 |   test('timecode display is present and shows a valid time format', async ({ page }) => {
  42 |     const timecode = page.getByLabel('Timecode');
  43 |     await expect(timecode).toBeVisible();
  44 | 
  45 |     const text = await timecode.textContent();
  46 |     expect(text).toBeTruthy();
  47 | 
  48 |     // The timecode element shows "HH:MM:SS:FF / HH:MM:SS:FF" (current / total).
  49 |     // Accept a string that starts with a valid SMPTE timecode (HH:MM:SS:FF).
  50 |     const validTimecodePattern = /^\d{2}:\d{2}:\d{2}:\d{2}/;
  51 |     expect(text!.trim()).toMatch(validTimecodePattern);
  52 |   });
  53 | 
  54 |   test('playback position scrubber is present', async ({ page }) => {
  55 |     const scrubber = page.getByRole('slider', { name: 'Playback position' });
  56 |     await expect(scrubber).toBeVisible();
  57 |   });
  58 | 
  59 |   test('frame counter is present', async ({ page }) => {
  60 |     const frameCounter = page.getByLabel('Current frame');
  61 |     await expect(frameCounter).toBeVisible();
  62 |     const text = await frameCounter.textContent();
  63 |     // Frame counter format: "0 / 300"
  64 |     expect(text).toMatch(/^\d+ \/ \d+$/);
  65 |   });
  66 | });
  67 | 
```