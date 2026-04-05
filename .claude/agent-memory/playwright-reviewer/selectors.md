---
name: Known Selectors and Flaky Patterns
description: Selectors that work and those that fail in ClipTale Playwright tests
type: feedback
updated: 2026-04-05
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

## Context menu

Not confirmed working in automated tests (right-click on VIDEO clip text not found).
The "VIDEO" text inside clip block: need to find parent clip container first.
Try coordinate-based right-click on clip block area (~x=400, y=726 when viewport is 1440x900).
