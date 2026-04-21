---
name: 2026-04-21 batch (Issues 1-3) verification anchors
description: Paginated envelope batch — S4 broke useAddAssetToTimeline.placement.test.ts (8 failures); dev-log claim of full scope-param envelope migration is partially false (drafts half unmigrated); pre-existing Class C table-drop tests remain
type: project
---

Branch `feat/editor-asset-fetch-and-generate-fix` — 6 subtasks shipped against `general_tasks.md` Issues 1–3. Nothing committed; all changes live in the working tree.

**Invariants to grep in future reviews:**

- `useAddAssetToTimeline.ts` calls `useQueryClient()` at the top of the hook (S4). Any existing sibling test file that mounts the hook must wrap in a `QueryClientProvider`. The batch added two new split test files with the wrapper (`.linkfile.test.ts`, `.test.ts`) but did NOT migrate the pre-existing `.placement.test.ts` → 8 tests fail with "No QueryClient set, use QueryClientProvider to set one".
- Wire envelope `{ items, nextCursor, totals }` now returned by BOTH `GET /projects/:id/assets` (paginated, cursor encodes `(pf.created_at ASC, pf.file_id ASC)` for project scope / `(files.created_at DESC, files.file_id DESC)` for all scope) AND `GET /generation-drafts/:id/assets` (`nextCursor` always null — drafts unpaged).
- `assets-scope-param.test.ts` only half-migrated. The `/projects/:id/assets` describe blocks assert `res.body.items` (correct). The `/generation-drafts/:id/assets` describe blocks still assert `Array.isArray(res.body)` / `res.body.map` / `res.body.toEqual([])` (stale contract) → 4 failures.
- `generation-draft-ai-generate.test.ts` was NOT touched by this batch; line 212 still does `(assetsRes.body as Array<…>).map(…)` → 1 new failure caused by the S6 envelope contract change. Test debt from this batch, not pre-existing.
- **Pre-existing Class C test debt (NOT caused by this batch, already documented in Known Issues):** `assets-finalize-endpoint.test.ts` + `assets-list-endpoint.test.ts` both INSERT into dropped `project_assets_current` → `ER_NO_SUCH_TABLE`. Live DB has NO `project_assets_current` (verified via `SHOW TABLES`). Pre-existing Class A (DEV_AUTH_BYPASS user-mismatch): `versions-list-restore-endpoint.test.ts` (`expect(createdByUserId).toBe('user-test-001')` actual `'dev-user-001'`).
- Editor cache-first asset resolution: `useRemotionPlayer` reads `['assets', projectId, 'project']` cache via `queryClient.getQueryData()`; falls back to per-fileId `getAsset` via `useQueries` only for orphans not in the page-1 cache. `AssetBrowserPanel` + `useProjectAssets` share the same queryKey to ensure single fetch.
- QueryClient defaults in `apps/web-editor/src/main.tsx`: `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1` — stops 429 bursts (closes 1.2).
- S4 fire-and-forget: `useAddAssetToTimeline.ts` calls `linkFileToProject(projectId, asset.id).then(() => queryClient.invalidateQueries({ queryKey: ['assets', projectId] })).catch(() => undefined)` after `createClip()` on BOTH `addAssetToNewTrack` and `addAssetToExistingTrack` branches. Closes Issue 2.
- S6 security fix: `generationDrafts.controller.getDraftAssets` now calls `generationDraftService.getById(userId, draftId)` for ownership BEFORE loading assets. Previously any authenticated user could read any draft's assets — real cross-user data leak (not theoretical).
- `listDraftAssets` (`apps/web-editor/src/features/generate-wizard/api.ts`) adapts wire `AssetApiResponse`-shaped items to FE `AssetSummary` via `wireItemToAssetSummary` (MIME prefix → kind; `displayName ?? filename` → `label`; `thumbnailUri` → `thumbnailUrl`).
- `packages/api-contracts/src/asset-list.schemas.ts` (new, 65L) + rebuilt `dist/asset-list.schemas.*`. `AssetListResponseSchema.safeParse` used in the contract test.
- `cors.test.ts` remains SKIPPED in container-isolated runs (dev note: "full-repo CI will exercise it") — same status as prior batches.

**Test counts snapshot (2026-04-21):**
- apps/api: 1131/1151 pass; 6 failed (4 in assets-scope-param drafts half, 1 in generation-draft-ai-generate, 1 in versions-list-restore); 5 skipped; 2 todo; 2 suite-level FAILs (`assets-finalize-endpoint.test.ts` + `assets-list-endpoint.test.ts` = pre-existing).
- apps/web-editor: 2168/2176 pass; 8 failed (all in `useAddAssetToTimeline.placement.test.ts` — QueryClient missing).
- apps/media-worker: 143/143 pass.
- apps/render-worker: 26/26 pass.

**Why:** Future guardian runs need to triage the test failure clusters correctly — the batch INTRODUCED new test debt (8 FE + 5 BE) while simultaneously LEAVING pre-existing debt (4 BE) untouched. The dev log claim "envelope migration on `file-links-endpoints.test.ts`+`.draft.test.ts`+`assets-scope-param.test.ts`" is audited and only two of three are fully migrated.

**How to apply:** On the next batch review, grep for `Array.isArray(res.body)` in `*.test.ts` as a regression canary; verify `useQueryClient` calls in hooks have matching `QueryClientProvider` wrappers in EVERY sibling split test file; cross-check whether dev-log migration claims hold across all files named.
