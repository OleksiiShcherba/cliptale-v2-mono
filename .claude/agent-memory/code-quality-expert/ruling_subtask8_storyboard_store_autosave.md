---
name: Subtask 8 — Storyboard store + autosave + undo/redo history
description: Initial violation flagged, fixed, and re-verified on 2026-04-22 — full compliance achieved
type: project
---

**Status: APPROVED (after fix round on 2026-04-22)**

**Original violation and fix:**
- Initial review flagged: hardcoded `#252535` at line 148 in storyboard-history-store.ts (should use `BORDER` token per §9)
- Fix applied: imported `BORDER` from `../components/nodeStyles` at line 29; replaced hardcoded hex with `BORDER` at line 149
- Re-review on 2026-04-22: import verified, no hardcoded hex remain

**Full compliance verified:**
- Hand-rolled `useSyncExternalStore` pattern correct (§7 state management)
- All HTTP via `apiClient` wrapper, no direct `fetch()` (§8 API layer)
- Event listener cleanup proper in autosave hook (useEffect cleanup returns unsubscribe + timer clear)
- No stale closures: `beforeunload` effect uses `[draftId]` dependency correctly
- File placement correct (store/, hooks/, api.ts co-located per §3)
- Absolute imports @/ + within-feature relative imports (established pattern per §9.7)
- All exports have JSDoc (§9.8)
- No commented-out code, dead code, or hardcoded values
- File lengths: store 133L, history-store 278L, autosave 237L, api 93L, Page 322L (exception logged)
- Test coverage: 24 unit tests (history 14 + autosave 10), full suite 102/102 pass
- BORDER token now correctly imported and used (no hex hardcoding)

**Why this matters:** Design tokens must be centralized constants per §9, not scattered hex values. The BORDER constant is the canonical color source across the storyboard feature.

