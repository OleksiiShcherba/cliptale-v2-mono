---
name: Asset fetch loop + generate fix task progress
description: general_tasks.md issues 1-3 on branch feat/editor-asset-fetch-and-generate-fix; ALL 6 SUBTASKS COMPLETE (2026-04-21)
type: project
---

Task: Editor asset-fetch loop, general→project link, /generate error (general_tasks.md issues 1–3)
Branch: `feat/editor-asset-fetch-and-generate-fix` (from origin/master, 2026-04-21)

**Why:** Three high-impact usability bugs: (1) repeated GET /assets/:id bursts → 429; (2) "Add to Timeline" from scope=all doesn't link to project_files; (3) /generate?draftId=<id> page broken.

**Subtask 1 — DONE (2026-04-21):**
Diagnosis written to `docs/generate-error-diagnosis.md`. Root cause confirmed: surface (b) `GET /generation-drafts/:id/assets`. BE returns bare `AssetApiResponse[]`; FE expects `AssetListResponse` envelope `{ items, nextCursor, totals }`. `data?.items` = undefined → gallery always empty. No server 500; the pre-existing Known Issue "500 on fresh-draft" was a mischaracterization — it's a 200 with shape mismatch causing FE `<GalleryError />`. Fix: (A) wrap BE response in envelope in `fileLinks.response.service.ts:getDraftFilesResponse`; (B) align FE field names (contentType→type, filename/displayName→label, thumbnailUri→thumbnailUrl) or unify on `AssetApiResponse`.

**Subtask 2 — DONE (2026-04-21):**
`GET /projects/:id/assets` now returns `{ items, nextCursor, totals: { count, bytesUsed } }` envelope. Keyset pagination on `(pf.created_at, pf.file_id)` for `scope=project`; on `(files.created_at, files.file_id)` DESC for `scope=all`. Cursor encoded as `ISO|fileId` base64 (same pattern as `asset.list.service`). Schemas extracted to `assets.controller.schemas.ts`. OpenAPI updated with `AssetListResponse`, `AssetApiResponseItem`, `ProjectAssetsTotals` schemas. 17 new integration tests + 9 new unit tests, all green.

**Key non-obvious fact (subtask 2):** existing tests in `file-links-endpoints.test.ts` and `assets-scope-param.test.ts` checked `Array.isArray(res.body)` — those had to be updated to `Array.isArray(res.body.items)` to match the new envelope.

**Subtask 3 — DONE (2026-04-21):**
FE rewired to consume paginated envelope. Key changes:
- `AssetListResponse` type added to `asset-manager/types.ts`.
- `getAssets()` returns `AssetListResponse`; `fetchNextAssetsPage()` added for future infinite-scroll.
- `AssetBrowserPanel.tsx` reads `data?.items ?? []` from query result.
- New `useProjectAssets.ts` hook: shared consumer of `['assets', projectId, 'project']` cache key.
- `useRemotionPlayer.ts` rewired: reads project-list cache via `queryClient.getQueryData(...)`, builds `Map<fileId, Asset>`, only calls `useQueries` for missing (orphan) fileIds. When AssetBrowserPanel is mounted and cache is warm → zero `GET /assets/:id` calls.
- `main.tsx` QueryClient defaults: `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1`.
- 2163 tests pass (verified in Docker web-editor container).

**Key non-obvious fact (subtask 3):** `useQueryClient().getQueryData(...)` is a synchronous read — not a subscription. When cache is populated by AssetBrowserPanel, `useRemotionPlayer` reads it without triggering re-renders. The `cachedItems` reference is stable (same array) until cache invalidation, so `useMemo` for `cachedByFileId` only recomputes when truly needed.

**Subtask 4 — DONE (2026-04-21):**
`useAddAssetToTimeline.ts` updated: imports `linkFileToProject` from `@/features/timeline/api.js` (NOT the duplicate in `shared/file-upload/api.ts`). Both `addAssetToNewTrack` and `addAssetToExistingTrack` fire-and-forget `linkFileToProject(projectId, asset.id).then(() => queryClient.invalidateQueries({ queryKey: ['assets', projectId] })).catch(() => undefined)` after `createClip`. 7 new tests added (22 total, all pass). Duplicate `linkFileToProject` in `shared/file-upload/api.ts` noted but left for future cleanup.

**Subtask 5 — DONE (2026-04-21):**
`packages/api-contracts` is contract-as-source (no codegen). Created `packages/api-contracts/src/asset-list.schemas.ts` with Zod schemas (`AssetStatusSchema`, `AssetApiResponseItemSchema`, `ProjectAssetsTotalsSchema`, `AssetListResponseSchema`) and inferred TypeScript types (`AssetApiResponseItem`, `ProjectAssetsTotals`, `AssetListResponse`). Exported from `index.ts`. Package built (`tsc` — zero errors). Created `apps/api/src/__tests__/integration/projects-assets-pagination.contract.test.ts` (split file per §9.7 — existing test is 402 lines): 3 contract-guard tests (scope=project, scope=all, per-item fields) that Zod-validate the wire response. All 3 pass.

**Key non-obvious fact (subtask 5):** The monorepo's `node_modules/@ai-video-editor/api-contracts` is symlinked to `packages/api-contracts` — rebuilding `dist/` is immediately visible to integration tests in `apps/api`. Tests must be run from the `apps/api` directory (not monorepo root) to get the `@/` alias resolved correctly by the vitest config.

**Subtask 6 — DONE (2026-04-21):**
BE: `getDraftFilesResponse` returns `ProjectAssetsPage` envelope (`{ items, nextCursor: null, totals: { count, bytesUsed } }`). Controller `getDraftAssets` adds ownership check via `generationDraftService.getById(userId, draftId)` (was missing — security fix). FE: `listDraftAssets` maps wire `AssetApiResponse` shape to `AssetSummary` via `wireItemToAssetSummary` (contentType→type, displayName??filename→label, thumbnailUri→thumbnailUrl). OpenAPI updated with `GET /generation-drafts/{id}/assets`. 5 new integration tests + 6 new unit tests, all green.

**Key non-obvious fact (subtask 6):** The 403 ownership check was entirely absent from the draft-assets endpoint — any authenticated editor could read any user's draft assets. The fix adds `generationDraftService.getById(userId, draftId)` which reuses the same ownership-checking service call used by `getDraft`, `updateDraft`, `deleteDraft`. The missing check was caught by writing the "unauthorized" integration test first.

**ALL SUBTASKS COMPLETE.** Branch `feat/editor-asset-fetch-and-generate-fix` ready for review.

## Guardian follow-up batch (2026-04-21) — 13 test regressions

**Subtask FU-1 — DONE (2026-04-21):**
`useAddAssetToTimeline.placement.test.ts`: added `vi.hoisted` + `vi.mock('@tanstack/react-query')` block matching sibling files. Removed duplicated `makeProject`/`makeAsset`/`TEST_PROJECT_ID` (now imported from `.fixtures.ts`). Added `linkFileToProject` to timeline/api mock. All 30 tests pass (15+8+7). File: 136 lines.

**Subtask FU-2 — DONE (2026-04-21):** `assets-scope-param.test.ts` draft-half migrated to envelope assertions (`res.body.items`). All 12 tests pass; 36 regression tests also green.
**Subtask FU-3 — DONE (2026-04-21):** `generation-draft-ai-generate.test.ts:212` fix already applied by qa-reviewer commit `667ab82`. Verified: `assetsRes.body.items` present at line 212, no other bare-array reads of `/generation-drafts/:id/assets` in file. 8/8 tests pass. Log entry appended; subtask removed from active_task.md.

**ALL GUARDIAN FOLLOW-UP SUBTASKS COMPLETE.** Branch `feat/editor-asset-fetch-and-generate-fix` fully green.
