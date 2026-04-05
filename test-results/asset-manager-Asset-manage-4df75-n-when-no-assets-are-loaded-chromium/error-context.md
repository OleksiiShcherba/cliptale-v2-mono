# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: asset-manager.spec.ts >> Asset manager — panel and upload dropzone >> empty-state message is shown when no assets are loaded
- Location: e2e/asset-manager.spec.ts:34:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner "Editor top bar" [ref=e4]:
    - generic [ref=e5]: ClipTale Editor
    - generic [ref=e6]:
      - 'generic "Save status: Not yet saved" [ref=e7]':
        - generic [ref=e8]: ●
        - text: Not yet saved
      - button "Toggle version history" [ref=e9] [cursor=pointer]: History
      - button "Export video" [disabled] [ref=e10]: Export
  - generic [ref=e11]:
    - complementary "Asset browser" [ref=e12]:
      - generic [ref=e14]:
        - generic [ref=e15]:
          - button "All" [pressed] [ref=e16] [cursor=pointer]
          - button "Video" [ref=e17] [cursor=pointer]
          - button "Audio" [ref=e18] [cursor=pointer]
          - button "Image" [ref=e19] [cursor=pointer]
        - searchbox "Search assets" [ref=e21]
        - 'button "Asset: Oleksii_00002.mp4, status: ready" [ref=e23] [cursor=pointer]':
          - generic [ref=e26]:
            - generic [ref=e27]: Oleksii_00002.mp4
            - generic [ref=e28]:
              - generic [ref=e29]: Video
              - 'generic "Status: ready" [ref=e30]': ready
          - button "Add Captions to Timeline" [ref=e31]
        - button "+ Upload Assets" [ref=e33] [cursor=pointer]
    - main [ref=e35]:
      - toolbar "Playback controls" [ref=e43]:
        - generic [ref=e44]:
          - button "Rewind to start" [ref=e45] [cursor=pointer]:
            - img [ref=e46]
          - button "Step back one frame" [ref=e48] [cursor=pointer]:
            - img [ref=e49]
          - button "Play" [ref=e51] [cursor=pointer]:
            - img [ref=e52]
          - button "Step forward one frame" [ref=e54] [cursor=pointer]:
            - img [ref=e55]
        - slider "Playback position" [ref=e58] [cursor=pointer]: "0"
        - generic [ref=e59]:
          - generic "Current frame" [ref=e60]: 0 / 300
          - generic "Timecode" [ref=e62]: 00:00:00:00
  - generic "Timeline" [ref=e63]:
    - toolbar "Timeline toolbar" [ref=e64]:
      - button "Zoom out timeline" [ref=e65] [cursor=pointer]: −
      - generic [ref=e66]: 4.0 px/f
      - button "Zoom in timeline" [ref=e67] [cursor=pointer]: +
      - generic [ref=e68]: 0 tracks
    - slider "Timeline ruler — click to seek, scroll to zoom" [ref=e72] [cursor=pointer]
    - list "Track list" [ref=e74]:
      - generic [ref=e75]: No tracks — add a track to get started
    - scrollbar [ref=e79]
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
  11  |     ).toBeVisible();
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
  40  |     const emptyText = sidebar.getByText('No assets yet — upload to get started');
  41  |     const errorText = sidebar.getByRole('alert');
  42  | 
  43  |     // At least one of the two states must be present
  44  |     const hasEmpty = (await emptyText.count()) > 0;
  45  |     const hasError = (await errorText.count()) > 0;
> 46  |     expect(hasEmpty || hasError).toBe(true);
      |                                  ^ Error: expect(received).toBe(expected) // Object.is equality
  47  |   });
  48  | 
  49  |   test('upload button is present', async ({ page }) => {
  50  |     const uploadButton = page.getByRole('button', { name: /upload assets/i });
  51  |     await expect(uploadButton).toBeVisible();
  52  |   });
  53  | 
  54  |   test('clicking upload button opens the upload dropzone modal', async ({ page }) => {
  55  |     const uploadButton = page.getByRole('button', { name: /upload assets/i });
  56  |     await uploadButton.click();
  57  | 
  58  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  59  |     await expect(dialog).toBeVisible();
  60  |   });
  61  | 
  62  |   test('upload modal contains the drop zone area', async ({ page }) => {
  63  |     await page.getByRole('button', { name: /upload assets/i }).click();
  64  | 
  65  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  66  |     await expect(dialog).toBeVisible();
  67  | 
  68  |     // The drop zone contains the "Drop files here or browse" hint text
  69  |     await expect(dialog.getByText('Drop files here or browse')).toBeVisible();
  70  |   });
  71  | 
  72  |   test('upload modal contains the Browse Files button', async ({ page }) => {
  73  |     await page.getByRole('button', { name: /upload assets/i }).click();
  74  | 
  75  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  76  |     await expect(dialog.getByRole('button', { name: 'Browse Files' })).toBeVisible();
  77  |   });
  78  | 
  79  |   test('upload modal can be closed via the close button', async ({ page }) => {
  80  |     await page.getByRole('button', { name: /upload assets/i }).click();
  81  | 
  82  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  83  |     await expect(dialog).toBeVisible();
  84  | 
  85  |     await dialog.getByRole('button', { name: 'Close upload modal' }).click();
  86  |     await expect(dialog).not.toBeVisible();
  87  |   });
  88  | 
  89  |   test('upload modal can be closed via the Cancel button', async ({ page }) => {
  90  |     await page.getByRole('button', { name: /upload assets/i }).click();
  91  | 
  92  |     const dialog = page.getByRole('dialog', { name: 'Upload Assets' });
  93  |     await expect(dialog).toBeVisible();
  94  | 
  95  |     await dialog.getByRole('button', { name: 'Cancel' }).click();
  96  |     await expect(dialog).not.toBeVisible();
  97  |   });
  98  | 
  99  |   // TODO: actual file upload flow is not tested here because it requires a running API
  100 |   // server (POST /projects/:id/assets/upload-url) and object storage (S3/R2) to issue
  101 |   // presigned upload URLs. Mocking those services at the E2E layer would defeat the
  102 |   // purpose of integration testing. Once Docker Compose is wired end-to-end in CI,
  103 |   // a separate test file (e2e/asset-upload-flow.spec.ts) should cover:
  104 |   //   1. Dragging a fixture file onto the dropzone
  105 |   //   2. Verifying the per-file progress bar appears (UploadProgressList)
  106 |   //   3. Verifying the asset card appears in the list after upload completes
  107 | });
  108 | 
```