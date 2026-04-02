---
name: Playwright — getByRole('generic') fragility
description: Using role="generic" in Playwright locators may not resolve reliably for implicit-role elements like <span> or <div> across headless modes
type: project
---

`getByRole('generic', { name: '...' })` targets the implicit ARIA role of `<div>` / `<span>` elements. Playwright's implementation may not reliably match this across all headless browser configurations. When reviewing E2E tests, flag `role: 'generic'` selectors as a warning — they should use `getByLabel('...')` or `page.locator('[aria-label="..."]')` for more reliable targeting of unlabelled container elements.

**Why:** Encountered in `e2e/preview.spec.ts` line 48 targeting `<span aria-label="Timecode">`. The spec works in Chromium but `role="generic"` is not a ARIA landmark role and may differ in accessibility tree representation.
**How to apply:** Flag any `getByRole('generic', ...)` call in E2E tests as a warning.
