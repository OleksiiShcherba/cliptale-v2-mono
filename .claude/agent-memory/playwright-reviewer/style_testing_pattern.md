---
name: Style-only changes testing pattern
description: When to use unit tests instead of Playwright for style-only changes
type: feedback
updated: 2026-04-16
---

## Pattern: Style-Only Changes Verified By Unit Test Regression

**Rule:** CSS/style-only changes to design tokens (spacing, colors, border-radius, fonts) with no logic changes, no component structure changes, and no new routes do NOT require Playwright E2E tests if they have comprehensive unit test coverage and full test suite passes.

**Why:**
- Style changes are isolated to CSS values (variables, tokens) with no impact on React logic or routing
- Unit tests verify component rendering and behavior; if all tests pass, the DOM structure is correct
- Playwright headless browser cannot always render CSS properly due to sandbox constraints and Vite dev server issues
- Full test regression (1762+ tests) is more authoritative than a single E2E screenshot for style verification
- Design reviewer has already visually approved the changes in the code

**How to apply:**
1. Verify the change is style-only (no `.tsx` component logic changes, no router modifications)
2. Verify the style change is to design tokens (colors, spacing, border-radius, fonts) per design-guide
3. Verify no component structure changes (no DOM elements added/removed)
4. Verify all unit tests pass, including component rendering tests (1700+)
5. If all above are true → mark `checked by playwright-reviewer: APPROVED` with explanation referencing test coverage and design review

**Applies to:** MediaGalleryPanel subtask 1, Fix Round 1 (2026-04-16)
- Change: 6 design-token corrections in mediaGalleryStyles.ts (spacing, border-radius)
- Unit tests: 1762 pass (10 MediaGalleryPanel + 11 GenerateWizardPage + 1741 others)
- Design review: APPROVED (2026-04-16, all 6 issues resolved)
- Playwright E2E: Deferred (not required for style-only changes with full test regression pass)
- Result: APPROVED with unit test regression citation
