---
name: Subtask 1 Store Reset Verdict (2026-04-21)
description: Project-store/history-store reset + useProjectInit integration verified as hook-only change
type: project
updated: 2026-04-21
---

## Verdict: APPROVED

**What:** Add `resetProjectStore(projectId)` + `resetHistoryStore()` + call from `useProjectInit` before hydration.

**Why:** Hook-only, store-only, backward-compatible change with no UI/route modifications. Fixes the bug where switching projects A→B would leak A's tracks/clips due to accumulated patches in module-singleton stores.

**Verification method:** Unit tests (23 total) instead of Playwright E2E, per hook-only testing pattern in memory.

**Test coverage:**
- `project-store.reset.test.ts` (12 tests) — reset clears tracks/clips/currentVersionId; preserves fps/width/height/schemaVersion; notifies listeners; full A→B sequence with hasPendingPatches check
- `useProjectInit.project-switch.test.ts` (7 tests) — resets fire before fetch resolves; correct call order; setProjectSilent + setCurrentVersionId still called post-reset; reset repeats per mount
- `useAutosave.reset.test.ts` (4 tests) — hasPendingPatches cleared mid-debounce prevents spurious save; normal path still works; beforeunload flush works when patches exist

**Implementation verified:**
- ✅ `resetProjectStore(projectId: string)` implemented in `apps/web-editor/src/store/project-store.ts` (lines 135–152)
- ✅ Constants extracted: `DEFAULT_SCHEMA_VERSION`, `DEFAULT_FPS`, `DEFAULT_WIDTH`, `DEFAULT_HEIGHT` (lines 12–15)
- ✅ `resetHistoryStore()` promoted to public in `apps/web-editor/src/store/history-store.ts` (backward compat with `_resetForTesting`)
- ✅ Both resets called in `useProjectInit.ts` at hydration start before `fetchLatestVersion` (lines 117–118)
- ✅ Backward compatible: existing `setProjectSilent` + `setCurrentVersionId` calls unchanged

**Code-reviewer:** Approved 2026-04-21
**Design-reviewer:** Approved 2026-04-21
**QA-reviewer:** Pending (state-layer only, no UI test surface)
**Playwright-reviewer:** APPROVED (hook-only pattern; unit tests sufficient; no E2E environment available in shell)
