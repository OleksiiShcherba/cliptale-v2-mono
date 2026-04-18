---
name: Project: Files-as-root Batch 2 progress
description: Files-as-root BATCH 2 (7 subtasks); Subtasks 1-5 COMPLETE (2026-04-18), 2 remaining (6-7)
type: project
---

Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression.

**Why:** Port editor's upload + AI generation flows to the storyboard (wizard) page by extracting shared hooks/components and adding a draft-scoped AI generation endpoint.

**Subtask 1** — COMPLETE (2026-04-18)

Created `shared/file-upload/` package:
- `types.ts` — `UploadTarget` (project | draft discriminated union), `UploadEntry` (uses `fileId` not `assetId`)
- `api.ts` — `requestUploadUrl` (POST /files/upload-url, body: `{ filename, mimeType, fileSizeBytes }`), `finalizeFile` (POST /files/:id/finalize), `linkFileToProject` (POST /projects/:id/files), `linkFileToDraft` (POST /generation-drafts/:id/files)
- `useFileUpload.ts` — context-aware hook; `{ target: UploadTarget, onUploadComplete? }` → request URL → XHR PUT → finalize → link
- `useFileUpload.test.ts` — 13 cases (project target, draft target, XHR progress, errors, API call correctness)

Key changes to `features/asset-manager/`:
- `hooks/useAssetUpload.ts` — converted to backward-compat shim (wraps `useFileUpload({ target: { kind: 'project', projectId } })`)
- `hooks/useAssetUpload.test.ts` — rewritten to mock `@/shared/file-upload/api`
- `api.ts` — removed `requestUploadUrl` and `finalizeAsset` (now in shared)
- `types.ts` — removed inline `UploadEntry` definition; re-exports from `@/shared/file-upload/types`
- `components/UploadProgressList.tsx` — imports `UploadEntry` from shared; key = `entry.fileId` (was `entry.assetId`)
- `components/UploadDropzone.tsx` — imports `UploadEntry` from shared

Key gotchas:
- Batch 1 API uses `mimeType` not `contentType` and returns `fileId` not `assetId`. The shared `api.ts` aligns with this (not the old `asset-manager/api.ts` shape).
- `AssetBrowserPanel.test.tsx` and `ReplaceAssetDialog.test.tsx` mock `useAssetUpload` at module level — no changes needed for component tests.
- `onUploadComplete` callback now receives `fileId` (was `assetId`). `ReplaceAssetDialog` passes it to `replaceAsset(asset.id, fileId)` — semantically correct since Batch 1 unifies file identity under `fileId`.
- `UploadUrlRequest` and `UploadUrlResponse` types remain in `asset-manager/types.ts` (unused but harmless — do not remove without confirming no external references).

**Subtask 2** — COMPLETE (2026-04-18)

`MediaGalleryPanel.tsx` extended with upload affordance (299 lines — at §9.7 cap):
- Imports `useFileUpload` from `@/shared/file-upload/useFileUpload` with `target: { kind: 'draft', draftId }`
- Imports `UploadDropzone` from `@/shared/file-upload/UploadDropzone` (promoted from asset-manager in Subtask 1's broader scope)
- Upload button hidden when `draftId` is `undefined`; hook still initialised with empty string `draftId` to avoid conditional hook call
- `onUploadComplete` calls `queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] })` — partial key matches all `['generate-wizard', 'assets', type]` variants
- `UploadProgressList` inside `UploadDropzone` shows per-file XHR progress bars + error status text
- `MediaGalleryPanel.test.tsx` covers 14 cases; tests 11–14 are the upload affordance cases

Key gotcha:
- `useAssets` query key is `['generate-wizard', 'assets', type]`. The panel only calls invalidateQueries with the two-element prefix `['generate-wizard', 'assets']` — this correctly invalidates all type variants (`'all'`, `'video'`, `'image'`, `'audio'`).

**Subtask 3** — COMPLETE (2026-04-18)

Pure import-path migration of all 47 files from `features/ai-generation/` → `shared/ai-generation/` (mirrored directory structure).

Key facts:
- External call sites updated: `App.tsx`, `App.panels.tsx`, `App.leftSidebar.test.tsx`
- `features/ai-generation/` deleted
- 4 test files that pre-existed over 300 lines were split per §9.7 during this move:
  - `SchemaFieldInput.test.tsx` → primary + `SchemaFieldInput.complex.test.tsx`; shared static fixtures in `SchemaFieldInput.fixtures.ts`
  - `VoicePickerRows.test.tsx` → primary (UserVoiceRow) + `VoicePickerRows.library.test.tsx` (LibraryVoiceRow + buildCategoryLabel)
  - `VoicePickerModal.audio.test.tsx` → primary (core playback) + `VoicePickerModal.audio.cleanup.test.tsx` (cleanup + backdrop)
  - `aiGenerationPanel.utils.test.ts` → primary (4 utils) + `aiGenerationPanel.utils.split.test.ts` (splitPromptFromOptions)
- Vitest `vi.hoisted()` cannot be exported from fixtures — each split test file must declare its own `vi.hoisted()` call; only static data (no Vitest constructs) goes in `.fixtures.ts`.
- All 177 test files, 1991 tests pass after the move + splits.

**Subtask 4** — COMPLETE (2026-04-18)

`AiGenerationContext` discriminated union added to `types.ts`: `{ kind: 'project' | 'draft'; id: string }`.

Key changes:
- `api.ts` — `submitGeneration(context, request)` picks route by context; `getContextAssets(context)` + `AssetSummary` type added; §14 violation resolved (no more cross-feature import from `features/asset-manager/api`)
- `hooks/useAiGeneration.ts` — `submit(context, request)` signature
- `components/AiGenerationPanel.tsx` — `context: AiGenerationContext` prop; query invalidation key `['assets', context.kind, context.id]`
- `components/AssetPickerField.tsx` — `context: AiGenerationContext` prop; uses `getContextAssets` from shared api
- `components/SchemaFieldInput.tsx` + `GenerationOptionsForm.tsx` — `context` prop forwarded down the chain
- `App.tsx` + `App.panels.tsx` call sites — pass `{ kind: 'project', id: projectId }`
- All tests updated; 211 tests pass; new draft-context tests in `useAiGeneration.test.ts`, `api.test.ts`, `AiGenerationPanel.form.test.tsx`, `AssetPickerField.test.tsx`

Key gotcha:
- `AssetSummary` type is exported from `api.ts` (not `types.ts`) — tests import it from `@/shared/ai-generation/api`
- AssetPickerField query key is `['assets', context.kind, context.id]` — matches the panel's invalidateQueries call

**Subtask 5** — COMPLETE (2026-04-18)

`POST /generation-drafts/:draftId/ai/generate` endpoint added.

Key design decisions:
- Added `draft_id CHAR(36) NULL` to `ai_generation_jobs` via migration `026_ai_jobs_draft_id.sql`
- `aiGenerationJob.repository.setOutputFile` now does a SELECT for `draft_id` first, then after the UPDATE also INSERT IGNOREs into `draft_files` when `draft_id` is set — this is the completion hook; no worker changes needed
- `setDraftId(jobId, draftId)` added to repository — called by the service right after `submitGeneration`
- `submitDraftAiGeneration` in `generationDraft.service.ts` delegates to `aiGeneration.service.submitGeneration` (reuse) then calls `setDraftId`
- `INSERT IGNORE INTO draft_files` handles deleted-draft edge case silently (FK fires, ignored = 0 rows, no error)

Key gotchas:
- Media worker (`ai-generate.job.ts`) STILL uses old `project_assets_current` path + `result_asset_id` — Batch 1 Subtask 8 was applied to the API side only (the repository has `setOutputFile`, the integration tests simulate the worker calling it, but the actual worker binary has not been updated). The completion hook works only when `setOutputFile` is called — the integration tests demonstrate this path.
- `AiGenerationJob` type gained `draftId: string | null` field — existing unit tests with mocked return values are unaffected since `vi.fn().mockResolvedValue()` doesn't type-check the return value shape.

**How to apply:** Next subtask is 6 (FE — Add AI tab to wizard MediaGalleryPanel). Depends on Subtasks 4 and 5 being complete (both are). The `AiGenerationPanel` now accepts `context: AiGenerationContext`, so the wizard just passes `{ kind: 'draft', id: draftId }`.
