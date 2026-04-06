---
name: Known Selectors and Flaky Patterns
description: Selectors that work and those that fail in ClipTale Playwright tests
type: feedback
updated: 2026-04-06
---

## Working selectors

- `page.getByText('Oleksii_00002.mp4', { exact: true })` — clicks asset row to open detail panel
- `page.locator('text=Oleksii_00002.mp4').first()` — also works for the asset row
- `page.locator('button:has-text("Add to Timeline")').first()` — works for AssetDetailPanel purple button
- `page.locator('button:has-text("History")').first()` — opens version history panel
- `page.locator('button:has-text("Restore")').first()` — clicks first Restore in version list
- `page.locator('button:has-text("Export")').first()` — Export button in TopBar
- `page.locator('canvas').first()` — timeline ruler canvas element

## Broken / problematic selectors

- `page.getByRole('button', { name: 'Add to Timeline' })` — FAILS: button has no explicit accessible name
- `button:has-text("+")` — matches "+ Upload Assets" first, not zoom + button; causes click interception error
- `[class*="asset-card"]` — no class-based selector matches (inline styles used)
- `text=/saved|saving|autosave/i` mixed with other selectors — CSS parse error
- `text=/pattern/` in combined CSS selector strings — causes CSS parser error

## Upload dropzone side-effect

Clicking "+ Upload Assets" button or accidentally triggering the file input opens OS file picker dialog.
This dialog blocks the page and persists until dismissed. It contaminates subsequent screenshots.
**Workaround:** Only click the asset row text to select the asset. Never click "Upload Assets" in tests.

## Add to Timeline not working in some contexts

`getByRole('button', { name: 'Add to Timeline' })` fails silently.
Use `page.locator('button:has-text("Add to Timeline")').first()` instead.
The button appears in AssetDetailPanel only after clicking the asset card first.

## Seeded project ID required for asset tests

New project creation (`POST /projects`) on fresh load creates an empty project with no assets.
The seeded asset `Oleksii_00002.mp4` exists only under project `00000000-0000-0000-0000-000000000001`.
To test any asset-related workflow, always navigate to `/?projectId=00000000-0000-0000-0000-000000000001`.
Do NOT rely on the dynamic projectId from the URL — it will have no assets.

## HTML5 DnD lane selector

ClipLane element: no data-testid. Find by: `height=48, width>500, top>700, overflow=hidden` in a DOM scan.
Asset card selector for DnD: `[aria-label*="Oleksii_00002.mp4"]` — has draggable=true, cursor=grab.
MIME type for asset drop: `'application/cliptale-asset'` (JSON-stringified Asset object).
DROP_TARGET_OVERLAY color: `rgba(124, 58, 237, 0.15)` — appears in getComputedStyle after dragover.
Clip block: no data-testid. Find by: `top>700, height≈48, backgroundColor includes '124' (rgb(124,58,237))`.

## Context menu

Not confirmed working in automated tests (right-click on VIDEO clip text not found).
The "VIDEO" text inside clip block: need to find parent clip container first.
Try coordinate-based right-click on clip block area (~x=400, y=726 when viewport is 1440x900).
