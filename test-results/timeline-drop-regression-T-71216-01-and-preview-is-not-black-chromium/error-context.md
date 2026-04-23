# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timeline-drop-regression.spec.ts >> Timeline-drop regression — POST /clips 201 + Remotion preview >> video asset — Add to Timeline returns 201 and preview is not black
- Location: e2e/timeline-drop-regression.spec.ts:86:7

# Error details

```
Error: POST /clips should return 201

expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 400
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner "Editor top bar" [ref=e4]:
    - generic [ref=e5]:
      - button "Go to home" [ref=e6] [cursor=pointer]:
        - img [ref=e7]
        - text: Home
      - generic [ref=e9]: ClipTale Editor
    - generic [ref=e10]:
      - generic [ref=e11]:
        - button "Undo" [ref=e12] [cursor=pointer]:
          - img [ref=e13]
        - button "Redo" [disabled] [ref=e16]:
          - img [ref=e17]
      - button "Save project" [ref=e20] [cursor=pointer]: Save
      - 'generic "Save status: Saved 0s ago" [ref=e21]':
        - generic [ref=e22]: ✓
        - text: Saved 0s ago
      - button "Toggle project settings" [ref=e23] [cursor=pointer]: Settings
      - button "Toggle version history" [ref=e24] [cursor=pointer]: History
      - button "View renders queue" [ref=e26] [cursor=pointer]: Renders
      - button "Export video" [ref=e27] [cursor=pointer]: Export
      - button "Sign out" [ref=e28] [cursor=pointer]
  - generic [ref=e29]:
    - complementary "Left sidebar" [ref=e30]:
      - tablist "Left sidebar tabs" [ref=e31]:
        - tab "Assets" [selected] [ref=e32] [cursor=pointer]
        - tab "AI Generate" [ref=e33] [cursor=pointer]
      - generic [ref=e34]:
        - generic [ref=e35]:
          - generic [ref=e36]:
            - button "All" [ref=e37] [cursor=pointer]
            - button "Video" [pressed] [ref=e38] [cursor=pointer]
            - button "Audio" [ref=e39] [cursor=pointer]
            - button "Image" [ref=e40] [cursor=pointer]
          - searchbox "Search assets" [ref=e42]
          - generic [ref=e43]:
            - 'button "Asset: Video_2, status: ready" [pressed] [ref=e44]':
              - generic [ref=e45]:
                - img [ref=e48]
                - generic [ref=e50]:
                  - generic [ref=e51]: Video_2
                  - generic [ref=e52]:
                    - generic [ref=e53]: Video
                    - 'generic "Status: ready" [ref=e54]': ready
              - button "Transcribe" [ref=e55] [cursor=pointer]
            - 'button "Asset: video_1, status: ready" [ref=e56]':
              - generic [ref=e57]:
                - img [ref=e60]
                - generic [ref=e62]:
                  - generic [ref=e63]: video_1
                  - generic [ref=e64]:
                    - generic [ref=e65]: Video
                    - 'generic "Status: ready" [ref=e66]': ready
              - button "Transcribe" [ref=e67] [cursor=pointer]
          - button "Show only this project" [pressed] [ref=e69] [cursor=pointer]
          - button "+ Upload Assets" [ref=e71] [cursor=pointer]
        - generic [ref=e72]:
          - generic [ref=e73]:
            - generic [ref=e74]: Asset Details
            - button "Close asset details" [ref=e75] [cursor=pointer]: ✕
          - generic [ref=e76]:
            - generic [ref=e77]: No preview
            - 'generic "Status: ready" [ref=e78]': ready
          - generic [ref=e80]:
            - generic [ref=e81]: Video_2
            - button "Rename asset" [ref=e82] [cursor=pointer]: ✏️
          - generic [ref=e83]:
            - generic [ref=e84]: Video
            - generic [ref=e85]: —
            - generic [ref=e86]: 0:03
            - generic [ref=e87]: 3440×1440
          - button "Transcribe" [ref=e88] [cursor=pointer]
          - button "Preview asset Video_2" [ref=e90] [cursor=pointer]: Preview
          - button "Add Video_2 to timeline" [active] [ref=e92] [cursor=pointer]:
            - text: Add to Timeline
            - generic [ref=e93]: ▾
          - button "Replace file" [ref=e94] [cursor=pointer]: Replace File
          - button "Delete asset Video_2" [ref=e95] [cursor=pointer]: Delete Asset
    - main [ref=e97]:
      - toolbar "Playback controls" [ref=e107]:
        - generic [ref=e108]:
          - button "Rewind to start" [ref=e109] [cursor=pointer]:
            - img [ref=e110]
          - button "Step back one frame" [ref=e112] [cursor=pointer]:
            - img [ref=e113]
          - button "Play" [ref=e115] [cursor=pointer]:
            - img [ref=e116]
          - button "Step forward one frame" [ref=e118] [cursor=pointer]:
            - img [ref=e119]
        - slider "Playback position" [ref=e122] [cursor=pointer]: "0"
        - generic [ref=e123]:
          - generic "Volume controls" [ref=e124]:
            - button "Mute" [ref=e125] [cursor=pointer]:
              - img [ref=e126]
            - slider "Volume" [ref=e128] [cursor=pointer]: "1"
            - generic [ref=e129]: 100%
          - generic "Current frame" [ref=e131]: 0 / 150
          - generic "Timecode" [ref=e133]:
            - text: 00:00:00:00
            - generic "Total duration" [ref=e134]: / 00:00:05:00
  - separator "Drag to resize timeline" [ref=e135]
  - generic "Timeline" [ref=e136]:
    - toolbar "Timeline toolbar" [ref=e137]:
      - button "Zoom out timeline" [ref=e138] [cursor=pointer]: −
      - generic [ref=e139]: 4.0 px/f
      - button "Zoom in timeline" [ref=e140] [cursor=pointer]: +
      - generic [ref=e141]: 1 track
      - button "Add track" [ref=e143] [cursor=pointer]: + Track
    - slider "Timeline ruler — click to seek, scroll to zoom" [ref=e147] [cursor=pointer]
    - list "Timeline tracks" [ref=e149]:
      - 'row "Track row: Video_2" [ref=e152]':
        - 'generic "Track: Video_2" [ref=e153]':
          - button "Drag to reorder track" [ref=e154]:
            - img [ref=e155]
          - 'button "Rename track: Video_2" [ref=e163] [cursor=pointer]': Video_2
          - generic "Track controls" [ref=e164]:
            - button "Mute track" [ref=e165] [cursor=pointer]: M
            - button "Lock track" [ref=e166] [cursor=pointer]: L
            - button "Delete track" [ref=e167] [cursor=pointer]: ×
        - 'generic "Clip lane for track: Video_2" [ref=e168]':
          - 'button "Clip: video, starts at frame 0" [ref=e169]':
            - generic [ref=e170]: video
    - generic [ref=e173]:
      - scrollbar
```

# Test source

```ts
  14  |  * - A reusable empty project is created by globalSetup and its id is
  15  |  *   read via `readE2eProjectId()` so every test lands on the same editor
  16  |  *   URL — no repeated project creation, no accumulating state.
  17  |  *
  18  |  * NOTE: Tests that manipulate ready assets skip themselves when the
  19  |  * seeded user has no ready asset of the required type.
  20  |  */
  21  | 
  22  | import * as path from 'path';
  23  | import { test, expect, Page, Response } from '@playwright/test';
  24  | 
  25  | import { readE2eProjectId } from './helpers/e2e-context';
  26  | 
  27  | const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/test_screenshots');
  28  | 
  29  | const editorUrl = (): string => `/editor?projectId=${readE2eProjectId()}`;
  30  | 
  31  | function screenshotPath(name: string): string {
  32  |   return path.join(SCREENSHOTS_DIR, name);
  33  | }
  34  | 
  35  | /** Navigate to the editor and wait for the shell to be ready. */
  36  | async function openEditor(page: Page): Promise<void> {
  37  |   await page.goto(editorUrl());
  38  |   await page.waitForLoadState('networkidle', { timeout: 20_000 });
  39  |   await expect(
  40  |     page.getByRole('complementary', { name: 'Left sidebar' }),
  41  |   ).toBeVisible({ timeout: 30_000 });
  42  | }
  43  | 
  44  | /**
  45  |  * Collects network responses for POST /clips while the callback runs.
  46  |  * Returns the first matching response, or null if none was captured.
  47  |  */
  48  | async function captureClipsPost(
  49  |   page: Page,
  50  |   action: () => Promise<void>,
  51  | ): Promise<Response | null> {
  52  |   let captured: Response | null = null;
  53  | 
  54  |   const handler = (response: Response) => {
  55  |     if (response.url().includes('/clips') && response.request().method() === 'POST') {
  56  |       captured = response;
  57  |     }
  58  |   };
  59  |   page.on('response', handler);
  60  |   await action();
  61  |   await page.waitForTimeout(3000);
  62  |   page.off('response', handler);
  63  | 
  64  |   return captured;
  65  | }
  66  | 
  67  | /** Select the first ready asset of a given content type. Returns true if found. */
  68  | async function selectFirstReadyAsset(page: Page, filterTabName: string): Promise<boolean> {
  69  |   const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });
  70  |   const filterTab = sidebar.getByRole('button', { name: filterTabName, exact: true });
  71  |   if (!(await filterTab.isVisible().catch(() => false))) return false;
  72  |   await filterTab.click();
  73  |   await page.waitForTimeout(800);
  74  | 
  75  |   const firstCard = sidebar.getByRole('button', { name: /^Asset: .*status: ready/i }).first();
  76  |   const isVisible = await firstCard.isVisible({ timeout: 5_000 }).catch(() => false);
  77  |   if (!isVisible) return false;
  78  |   await firstCard.click();
  79  |   await page.waitForTimeout(500);
  80  |   return true;
  81  | }
  82  | 
  83  | test.describe('Timeline-drop regression — POST /clips 201 + Remotion preview', () => {
  84  |   test.setTimeout(120_000);
  85  | 
  86  |   test('video asset — Add to Timeline returns 201 and preview is not black', async ({ page }) => {
  87  |     const consoleErrors: string[] = [];
  88  |     page.on('console', (msg) => {
  89  |       if (msg.type() === 'error') consoleErrors.push(msg.text());
  90  |     });
  91  | 
  92  |     await openEditor(page);
  93  | 
  94  |     const found = await selectFirstReadyAsset(page, 'Video');
  95  |     if (!found) {
  96  |       test.skip(true, 'No ready video assets found. Upload a video asset first.');
  97  |       return;
  98  |     }
  99  | 
  100 |     await page.screenshot({ path: screenshotPath('timeline-drop-video.png'), fullPage: false });
  101 | 
  102 |     const addButton = page.getByRole('button', { name: /Add .* to timeline/i }).first();
  103 |     const isAddVisible = await addButton.isVisible().catch(() => false);
  104 |     if (!isAddVisible) {
  105 |       test.skip(true, 'Add to Timeline button not visible — video asset may not be ready.');
  106 |       return;
  107 |     }
  108 | 
  109 |     const response = await captureClipsPost(page, async () => {
  110 |       await addButton.click();
  111 |     });
  112 | 
  113 |     if (response) {
> 114 |       expect(response.status(), 'POST /clips should return 201').toBe(201);
      |                                                                  ^ Error: POST /clips should return 201
  115 |       expect(
  116 |         response.url(),
  117 |         'POST /clips URL must not contain the fixture project id',
  118 |       ).not.toContain('00000000-0000-0000-0000-000000000001');
  119 |     }
  120 | 
  121 |     const clipErrors = consoleErrors.filter((e) => e.includes('Failed to create clip'));
  122 |     expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);
  123 | 
  124 |     await page.waitForTimeout(2000);
  125 |     await page.screenshot({ path: screenshotPath('timeline-drop-video.png'), fullPage: false });
  126 |   });
  127 | 
  128 |   test('image asset — Add to Timeline returns 201', async ({ page }) => {
  129 |     const consoleErrors: string[] = [];
  130 |     page.on('console', (msg) => {
  131 |       if (msg.type() === 'error') consoleErrors.push(msg.text());
  132 |     });
  133 | 
  134 |     await openEditor(page);
  135 | 
  136 |     const found = await selectFirstReadyAsset(page, 'Image');
  137 |     if (!found) {
  138 |       test.skip(true, 'No ready image assets found. Upload an image asset first.');
  139 |       return;
  140 |     }
  141 | 
  142 |     await page.screenshot({ path: screenshotPath('timeline-drop-image.png'), fullPage: false });
  143 | 
  144 |     const addButton = page.getByRole('button', { name: /Add .* to timeline/i }).first();
  145 |     const isAddVisible = await addButton.isVisible().catch(() => false);
  146 |     if (!isAddVisible) {
  147 |       test.skip(true, 'Add to Timeline button not visible — image asset may not be ready.');
  148 |       return;
  149 |     }
  150 | 
  151 |     const response = await captureClipsPost(page, async () => {
  152 |       await addButton.click();
  153 |     });
  154 | 
  155 |     if (response) {
  156 |       expect(response.status(), 'POST /clips should return 201').toBe(201);
  157 |       expect(response.url()).not.toContain('00000000-0000-0000-0000-000000000001');
  158 |     }
  159 | 
  160 |     const clipErrors = consoleErrors.filter((e) => e.includes('Failed to create clip'));
  161 |     expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);
  162 | 
  163 |     await page.waitForTimeout(1000);
  164 |     await page.screenshot({ path: screenshotPath('timeline-drop-image.png'), fullPage: false });
  165 |   });
  166 | 
  167 |   test('audio asset — Add to Timeline returns 201', async ({ page }) => {
  168 |     const consoleErrors: string[] = [];
  169 |     page.on('console', (msg) => {
  170 |       if (msg.type() === 'error') consoleErrors.push(msg.text());
  171 |     });
  172 | 
  173 |     await openEditor(page);
  174 | 
  175 |     const found = await selectFirstReadyAsset(page, 'Audio');
  176 |     if (!found) {
  177 |       test.skip(true, 'No ready audio assets found. Upload an audio asset first.');
  178 |       return;
  179 |     }
  180 | 
  181 |     await page.screenshot({ path: screenshotPath('timeline-drop-audio.png'), fullPage: false });
  182 | 
  183 |     const addButton = page.getByRole('button', { name: /Add .* to timeline/i }).first();
  184 |     const isAddVisible = await addButton.isVisible().catch(() => false);
  185 |     if (!isAddVisible) {
  186 |       test.skip(true, 'Add to Timeline button not visible — audio asset may not be ready.');
  187 |       return;
  188 |     }
  189 | 
  190 |     const response = await captureClipsPost(page, async () => {
  191 |       await addButton.click();
  192 |     });
  193 | 
  194 |     if (response) {
  195 |       expect(response.status(), 'POST /clips should return 201').toBe(201);
  196 |       expect(response.url()).not.toContain('00000000-0000-0000-0000-000000000001');
  197 |     }
  198 | 
  199 |     const clipErrors = consoleErrors.filter((e) => e.includes('Failed to create clip'));
  200 |     expect(clipErrors, 'No "Failed to create clip" console errors expected').toHaveLength(0);
  201 | 
  202 |     await page.waitForTimeout(1000);
  203 |     await page.screenshot({ path: screenshotPath('timeline-drop-audio.png'), fullPage: false });
  204 |   });
  205 | });
  206 | 
  207 | // Capture the image/audio filter views even if no ready assets are present.
  208 | test.describe('Timeline-drop regression — screenshot helpers', () => {
  209 |   test.setTimeout(60_000);
  210 | 
  211 |   test('capture image filter view screenshot', async ({ page }) => {
  212 |     await openEditor(page);
  213 |     const sidebar = page.getByRole('complementary', { name: 'Left sidebar' });
  214 |     const imageTab = sidebar.getByRole('button', { name: 'Image', exact: true }).first();
```