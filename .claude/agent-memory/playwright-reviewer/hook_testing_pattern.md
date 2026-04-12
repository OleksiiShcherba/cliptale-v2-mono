---
name: Hook-only changes testing pattern
description: When to use unit tests instead of Playwright for hook-only changes
type: feedback
updated: 2026-04-12
---

## Pattern: Hook-only Changes Require Verification But Not Always E2E

**Rule:** React hook changes with no UI components, no new browser routes, and backward-compatible fallback behavior do NOT require Playwright E2E tests if they have comprehensive unit test coverage.

**Why:** 
- Hooks are internal logic layers, not user-facing features
- Browser headless testing cannot always verify the rendering output (e.g., Remotion WebGL canvas rendering is opaque to headless Chromium)
- Unit tests verify the hook's logic (frame math, frame timestamps, color defaults, fallback branching)
- If the hook is backward compatible and all consumer tests pass, the integration is verified

**How to apply:**
1. Check if the change is hook-only (no `.tsx` component changes, no new routes in router)
2. Verify the hook has comprehensive unit tests (including edge cases like empty arrays, boundary conditions)
3. Verify the hook is backward compatible (e.g., falls back to old behavior for legacy data)
4. Verify the full web-editor test suite passes (regression check)
5. If all above are true → mark `checked by playwright-reviewer: APPROVED` with explanation referencing the test coverage

**Similar precedent:** Workflow 12 (Fix Element Preview) — Remotion composition rendering cannot be verified in headless tests; deferred to unit tests instead.

**Example:** C8 — useAddCaptionsToTimeline hook (2026-04-12)
- Hook-only: modifies only the hook, no component changes
- Unit tests: 21 total (8 new + 13 existing)
- Backward compatible: falls back to TextOverlayClip when words absent
- Web-editor regression: 1688 tests pass
- Result: APPROVED with unit test citation
