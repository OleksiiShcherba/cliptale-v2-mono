# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app-shell.spec.ts >> App shell — two-column layout smoke tests >> no uncaught JS errors on load
- Location: e2e/app-shell.spec.ts:20:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "Cannot access 'SURFACE_ELEVATED' before initialization",
+ ]
```

# Test source

```ts
  1  | // QA: cross-browser — intentionally Chromium-only for initial suite
  2  | 
  3  | import { test, expect } from '@playwright/test';
  4  | 
  5  | test.describe('App shell — two-column layout smoke tests', () => {
  6  |   test('asset browser sidebar is visible', async ({ page }) => {
  7  |     await page.goto('/');
  8  | 
  9  |     const sidebar = page.getByRole('complementary', { name: 'Asset browser' });
  10 |     await expect(sidebar).toBeVisible();
  11 |   });
  12 | 
  13 |   test('preview area (main content region) is visible', async ({ page }) => {
  14 |     await page.goto('/');
  15 | 
  16 |     const main = page.getByRole('main');
  17 |     await expect(main).toBeVisible();
  18 |   });
  19 | 
  20 |   test('no uncaught JS errors on load', async ({ page }) => {
  21 |     const jsErrors: string[] = [];
  22 |     page.on('pageerror', (err) => jsErrors.push(err.message));
  23 | 
  24 |     await page.goto('/');
  25 | 
  26 |     // Allow the page to fully initialize before asserting
  27 |     await page.waitForLoadState('networkidle');
  28 | 
> 29 |     expect(jsErrors).toEqual([]);
     |                      ^ Error: expect(received).toEqual(expected) // deep equality
  30 |   });
  31 | });
  32 | 
```