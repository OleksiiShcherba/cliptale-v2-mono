# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: asset-manager.spec.ts >> Asset manager — panel and upload dropzone >> clicking upload button opens the upload dropzone modal
- Location: e2e/asset-manager.spec.ts:56:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('complementary', { name: 'Asset browser' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('complementary', { name: 'Asset browser' })

```

# Test source

```ts
  1   | // QA: cross-browser — intentionally Chromium-only for initial suite
  2   | 
  3   | import { test, expect } from '@playwright/test';
  4   | 
  5   | test.describe('Asset manager — panel and upload dropzone', () => {
  6   |   test.beforeEach(async ({ page }) => {
  7   |     await page.goto('/');
  8   |     // Wait for the sidebar to confirm the asset manager is mounted
  9   |     await expect(
  10  |       page.getByRole('complementary', { name: 'Asset browser' }),
> 11  |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  12  |   });
  13  | 
  14  |   test('asset browser panel is present', async ({ page }) => {
  15  |     await expect(
  16  |       page.getByRole('complementary', { name: 'Asset browser' }),
  17  |     ).toBeVisible();
  18  |   });
  19  | 
  20  |   test('filter tabs are visible (All, Video, Audio, Image)', async ({ page }) => {
  21  |     const sidebar = page.getByRole('complementary', { name: 'Asset browser' });
  22  | 
  23  |     await expect(sidebar.getByRole('button', { name: 'All' })).toBeVisible();
  24  |     await expect(sidebar.getByRole('button', { name: 'Video' })).toBeVisible();
  25  |     await expect(sidebar.getByRole('button', { name: 'Audio' })).toBeVisible();
  26  |     await expect(sidebar.getByRole('button', { name: 'Image' })).toBeVisible();
  27  |   });
  28  | 
  29  |   test('search bar is visible', async ({ page }) => {
  30  |     const searchInput = page.getByRole('searchbox', { name: 'Search assets' });
  31  |     await expect(searchInput).toBeVisible();
  32  |   });
  33  | 
  34  |   test('empty-state message is shown when no assets are loaded', async ({ page }) => {
  35  |     // Without a live API the query will either fail or return an empty list.
  36  |     // Either way, the empty state text or error message should appear.
  37  |     // We allow both "no assets" text and "could not load" error text.
  38  |     const sidebar = page.getByRole('complementary', { name: 'Asset browser' });
  39  | 
  40  |     // Wait for the asset list to settle (either empty state or error state).
  41  |     // The API call is async so we use waitFor to allow up to 5 s.
  42  |     await expect(async () => {
  43  |       const emptyText = sidebar.getByText('No assets yet — upload to get started');
  44  |       const errorText = sidebar.getByRole('alert');
  45  |       const hasEmpty = (await emptyText.count()) > 0;
  46  |       const hasError = (await errorText.count()) > 0;
  47  |       expect(hasEmpty || hasError).toBe(true);
  48  |     }).toPass({ timeout: 5_000 });
  49  |   });
  50  | 
  51  |   test('upload button is present', async ({ page }) => {
  52  |     const uploadButton = page.getByRole('button', { name: /upload assets/i });
  53  |     await expect(uploadButton).toBeVisible();
  54  |   });
  55  | 
  56  |   test('clicking upload button opens the upload dropzone modal', async ({ page }) => {
  57  |     const uploadButton = page.getByRole('button', { name: /upload assets/i });
  58  |     await uploadButton.click();
  59  | 
  60  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  61  |     await expect(dialog).toBeVisible();
  62  |   });
  63  | 
  64  |   test('upload modal contains the drop zone area', async ({ page }) => {
  65  |     await page.getByRole('button', { name: /upload assets/i }).click();
  66  | 
  67  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  68  |     await expect(dialog).toBeVisible();
  69  | 
  70  |     // The drop zone contains the "Drop files here or browse" hint text
  71  |     await expect(dialog.getByText('Drop files here or browse')).toBeVisible();
  72  |   });
  73  | 
  74  |   test('upload modal contains the Browse Files button', async ({ page }) => {
  75  |     await page.getByRole('button', { name: /upload assets/i }).click();
  76  | 
  77  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  78  |     await expect(dialog.getByRole('button', { name: 'Browse Files' })).toBeVisible();
  79  |   });
  80  | 
  81  |   test('upload modal can be closed via the close button', async ({ page }) => {
  82  |     await page.getByRole('button', { name: /upload assets/i }).click();
  83  | 
  84  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  85  |     await expect(dialog).toBeVisible();
  86  | 
  87  |     await dialog.getByRole('button', { name: 'Close upload modal' }).click();
  88  |     await expect(dialog).not.toBeVisible();
  89  |   });
  90  | 
  91  |   test('upload modal can be closed via the Cancel button', async ({ page }) => {
  92  |     await page.getByRole('button', { name: /upload assets/i }).click();
  93  | 
  94  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  95  |     await expect(dialog).toBeVisible();
  96  | 
  97  |     await dialog.getByRole('button', { name: 'Cancel' }).click();
  98  |     await expect(dialog).not.toBeVisible();
  99  |   });
  100 | 
  101 |   // TODO: actual file upload flow is not tested here because it requires a running API
  102 |   // server (POST /projects/:id/assets/upload-url) and object storage (S3/R2) to issue
  103 |   // presigned upload URLs. Mocking those services at the E2E layer would defeat the
  104 |   // purpose of integration testing. Once Docker Compose is wired end-to-end in CI,
  105 |   // a separate test file (e2e/asset-upload-flow.spec.ts) should cover:
  106 |   //   1. Dragging a fixture file onto the dropzone
  107 |   //   2. Verifying the per-file progress bar appears (UploadProgressList)
  108 |   //   3. Verifying the asset card appears in the list after upload completes
  109 | });
  110 | 
```