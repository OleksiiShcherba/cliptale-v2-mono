# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: preview.spec.ts >> Preview panel — Remotion player and playback controls >> play button is visible and shows "Play" label initially
- Location: e2e/preview.spec.ts:28:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('toolbar', { name: 'Playback controls' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('toolbar', { name: 'Playback controls' })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - heading "Sign in" [level=1] [ref=e5]
  - paragraph [ref=e6]: Welcome back to ClipTale
  - generic [ref=e7]:
    - generic [ref=e8]: Email
    - textbox "Email" [ref=e9]:
      - /placeholder: you@example.com
    - generic [ref=e10]: Password
    - textbox "Password" [ref=e11]:
      - /placeholder: ••••••••
    - button "Sign in" [ref=e12] [cursor=pointer]
  - generic [ref=e14]: or continue with
  - generic [ref=e15]:
    - link "Google" [ref=e16] [cursor=pointer]:
      - /url: http://localhost:3001/auth/google
    - link "GitHub" [ref=e17] [cursor=pointer]:
      - /url: http://localhost:3001/auth/github
  - generic [ref=e18]:
    - link "Forgot password?" [ref=e19] [cursor=pointer]:
      - /url: /forgot-password
    - text: ·
    - link "Create account" [ref=e20] [cursor=pointer]:
      - /url: /register
```

# Test source

```ts
  1  | // QA: cross-browser — intentionally Chromium-only for initial suite.
  2  | // Requires the deploy-config globalSetup to pre-authenticate via storageState.
  3  | 
  4  | import { test, expect } from '@playwright/test';
  5  | 
  6  | import { readE2eProjectId } from './helpers/e2e-context';
  7  | 
  8  | const editorUrl = () => `/editor?projectId=${readE2eProjectId()}`;
  9  | 
  10 | test.describe('Preview panel — Remotion player and playback controls', () => {
  11 |   // Remotion player initialization involves video codec setup which can be slow.
  12 |   test.setTimeout(60_000);
  13 | 
  14 |   test.beforeEach(async ({ page }) => {
  15 |     await page.goto(editorUrl());
  16 |     // Project hydration + Remotion player mount can take several seconds
  17 |     // on a cold page, so allow a generous wait before assertions begin.
  18 |     await expect(
  19 |       page.getByRole('toolbar', { name: 'Playback controls' }),
> 20 |     ).toBeVisible({ timeout: 15_000 });
     |       ^ Error: expect(locator).toBeVisible() failed
  21 |   });
  22 | 
  23 |   test('Remotion player container is present in the main area', async ({ page }) => {
  24 |     const main = page.getByRole('main');
  25 |     await expect(main).toBeVisible();
  26 |   });
  27 | 
  28 |   test('play button is visible and shows "Play" label initially', async ({ page }) => {
  29 |     const playButton = page.getByRole('button', { name: 'Play' });
  30 |     await expect(playButton).toBeVisible();
  31 |   });
  32 | 
  33 |   test('clicking play changes the button aria-label to "Pause"', async ({ page }) => {
  34 |     const playButton = page.getByRole('button', { name: 'Play' });
  35 |     await expect(playButton).toBeVisible();
  36 | 
  37 |     await playButton.click();
  38 | 
  39 |     await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  40 |     await expect(page.getByRole('button', { name: 'Play' })).not.toBeVisible();
  41 |   });
  42 | 
  43 |   test('timecode display is present and shows a valid time format', async ({ page }) => {
  44 |     const timecode = page.getByLabel('Timecode');
  45 |     await expect(timecode).toBeVisible();
  46 | 
  47 |     const text = await timecode.textContent();
  48 |     expect(text).toBeTruthy();
  49 | 
  50 |     // "HH:MM:SS:FF / HH:MM:SS:FF" (current / total)
  51 |     const validTimecodePattern = /^\d{2}:\d{2}:\d{2}:\d{2}/;
  52 |     expect(text!.trim()).toMatch(validTimecodePattern);
  53 |   });
  54 | 
  55 |   test('playback position scrubber is present', async ({ page }) => {
  56 |     const scrubber = page.getByRole('slider', { name: 'Playback position' });
  57 |     await expect(scrubber).toBeVisible();
  58 |   });
  59 | 
  60 |   test('frame counter is present', async ({ page }) => {
  61 |     const frameCounter = page.getByLabel('Current frame');
  62 |     await expect(frameCounter).toBeVisible();
  63 |     const text = await frameCounter.textContent();
  64 |     expect(text).toMatch(/^\d+ \/ \d+$/);
  65 |   });
  66 | });
  67 | 
```