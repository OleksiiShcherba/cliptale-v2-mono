---
name: QA Review - Delete Asset Button & Mobile Collapse Fixes
description: Critical findings from review of commits 7d2ebfb and 158f479
type: project
---

## Delete Asset Button (commit 7d2ebfb) — CRITICAL IMPLEMENTATION BUG

**Status:** Tests written but code is incomplete — blocking bug.

**Issue:** The `deleteAsset` API function was never exported from `apps/web-editor/src/features/asset-manager/api.ts`, but the hook and tests reference it.

- **Commit modified:** `useDeleteAsset.ts`, `DeleteAssetDialog.tsx`, two test files — but NOT `api.ts`
- **Test coverage:** Excellent (13 hook tests + 24 component tests covering happy path, error handling, call order, loading states, accessibility)
- **Query key match:** Verified — `['assets', projectId]` used consistently across `useDeleteAsset`, `AssetBrowserPanel`, and other callers
- **Backend:** `DELETE /assets/:id` returns 204 on success, validates ownership, checks clip references (409 if in use)
- **Backend tests:** `assets-delete-endpoint.test.ts` (5 integration tests) + `asset.service.delete.test.ts` (4 unit tests) — all covering 204/404/409/idempotency
- **Missing implementation:** Export `async function deleteAsset(fileId: string): Promise<void>` in `api.ts` that calls `apiClient.delete('/assets/:id')`

**Impact:** The implementation will fail at runtime when `useDeleteAsset` tries to import the missing function. All tests mock it, so they pass despite the bug.

**Why:** Commit 7d2ebfb is incomplete — a small export function was overlooked.

---

## Mobile Asset Panel Collapse (commit 158f479) — COVERAGE COMPLETE

**Status:** CSS-only fix, existing tests suffice.

- **Scope:** `App.styles.ts` only (layout restructure: `minHeight: 100vh + overflow-y: auto` on mobile shell)
- **Existing test coverage:** `App.mobile.test.tsx` has 17 tests asserting:
  - Mobile components render at `windowWidth < 768`
  - Desktop components hidden on mobile
  - Inspector content panel NOT inside main Preview landmark (prevents overlap)
  - Preview panel IS inside main landmark
  - Tab switching updates aria-label
- **No regression risk:** Layout change is isolated; tests mock all child components and assert landmark hierarchy

---

## QA Verdict

✅ **Mobile collapse fix:** PASS — CSS change covered by existing assertions on layout hierarchy  
❌ **Delete Asset button:** FAIL — Incomplete implementation; missing `deleteAsset` export in `api.ts`

**Recommendation:** Do not merge commit 7d2ebfb until the `deleteAsset` function is added to `api.ts`.
