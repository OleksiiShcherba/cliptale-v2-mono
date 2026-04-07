---
name: Known React shorthand/non-shorthand border mixing issue
description: React emits console error-level warnings when switching between style objects that mix border shorthand and non-shorthand properties on the same element
type: project
---

React emits error-level console warnings when the same DOM element's style switches between a shorthand border property (`border: 'none'`) and non-shorthand border properties (`borderRight`, `borderBottom`, etc.) across rerenders.

This has occurred in two places in ClipTale:
1. `TrackList.styles.ts` — emptyState/emptyStateDropActive (fixed 2026-04-06)
2. `MobileInspectorTabs.tsx` — tab/tabActive styles (UNFIXED as of 2026-04-07, caused COMMENTED on playwright-reviewer check)

The fix pattern: use explicit per-side border properties (`borderTop`, `borderRight`, `borderBottom`, `borderLeft`) consistently in BOTH the base and active style objects — never mix with the `border` shorthand.

**Why:** React prohibits switching between shorthand and non-shorthand during rerenders and logs it as a console error.
**How to apply:** When reviewing or testing components with conditional style objects, look for `border:` (shorthand) in one object and `borderTop/Right/Bottom/Left` in another applied to the same element — this will always produce the warning.
