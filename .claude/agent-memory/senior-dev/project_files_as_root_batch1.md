---
name: Project: Files-as-root Batch 1 progress
description: Files-as-root foundation BATCH 1 (8 subtasks); ALL 8 subtasks COMPLETE (2026-04-18)
type: project
---

Task: Files-as-root foundation (BATCH 1 of 2) — feedback tasks #1–#3 + AI-job refactor.

**Why:** Introduce a `files` root table as single source of truth for every user-owned blob; migrate downstream tables; land two UX fixes (scroll + Create Storyboard draft).

**Build order:** 1 (FE, independent) → 2 → 3 → 4 (DB then runtime) → 5 → 6/7/8 (parallel).

**Subtask 8** — COMPLETE (2026-04-18)
- Modified: `apps/api/src/repositories/aiGenerationJob.repository.ts` — removed `projectId`/`project_id` and `resultAssetId`/`result_asset_id`; added `outputFileId`; `setOutputFile(jobId, fileId)` replaces `updateJobResult`.
- Modified: `apps/api/src/queues/jobs/enqueue-ai-generate.ts` — removed `projectId` from `AiGenerateJobPayload`.
- Modified: `apps/api/src/services/aiGeneration.service.ts` — `submitGeneration` is now user-scoped only (no `projectId` param); `GetJobStatusResult` has `outputFileId` not `resultAssetId`.
- Modified: `apps/api/src/services/aiGeneration.assetResolver.ts` — switched from `asset.repository.getAssetById` to `file.repository.findByIdForUser`; `parseStorageUri` from `file.service.ts`. Ownership gated at DB level.
- Modified: `apps/api/src/controllers/aiGeneration.controller.ts` — compat shim: Zod schema accepts optional `projectId` in body and strips it; controller no longer passes projectId to service.
- Updated: `aiGeneration.service.fixtures.ts`, all 4 existing test files, rewrote `ai-generation-endpoints.test.ts`.
- Created: `apps/api/src/services/aiGeneration.service.integration.test.ts` — 4 integration tests.
- 56 total tests: 46 unit + 4 service integration + 6 endpoint integration — all pass.

Key gotchas for Subtask 8:
- Dev Docker DB had migrations applied out of order (015 DROP+CREATE ran after 023/024/025 modified the table). Fresh Docker volumes (001→025 in sequence) are unaffected.
- `findByIdForUser` unifies existence + ownership in a single query — no separate ForbiddenError needed; cross-user lookups return null → NotFoundError. Avoids leaking file existence.
- The compat shim keeps `POST /projects/:id/ai/generate` alive. ACL still gates via aclMiddleware('editor') so the project ID in the route is still verified; it just isn't stored in the job row.
- `parseStorageUri` is imported from `file.service.ts` (re-exports it). Avoids reaching into `asset.service.ts` which is being phased out.
- `resultAssetId` is completely gone from service layer; tests assert `not.toHaveProperty('resultAssetId')` on status responses.

**Subtask 7** — COMPLETE + Fix round 2 (2026-04-18)
- Modified: `apps/api/src/repositories/caption.repository.ts` — `asset_id` → `file_id` throughout SQL and types; `getCaptionTrackByAssetId` → `getCaptionTrackByFileId`.
- Modified: `apps/api/src/services/caption.service.ts` — replaced `assetRepository.getAssetById` with `fileRepository.findById`; both `transcribeAsset` and `getCaptions` now use `fileId`. `enqueueTranscriptionJob` payload `assetId` field carries `fileId` value (Subtask 8 compat).
- Modified: `apps/api/src/services/caption.service.test.ts` — full rewrite to use `FileRow` fixture and `fileRepository.findById` mock; added null-mimeType fallback test.
- Rewrote: `apps/api/src/__tests__/integration/captions-endpoints.test.ts` — removed `project_assets_current` seeding; seeds into `files`; uses session-based auth (SHA-256 token in `sessions` table, `APP_DEV_AUTH_BYPASS=false`).
- Created: `apps/api/src/services/caption.service.integration.test.ts` — 5 integration tests (real MySQL).
- Modified: `apps/media-worker/src/jobs/transcribe.job.ts` — `getFileProjectId` queries `project_files WHERE file_id = ?`; `insertCaptionTrack` writes `file_id` column.
- Fix round 2: Split `transcribe.job.test.ts` (305 lines, over §9.7 cap) into:
  - `transcribe.job.fixtures.ts` (87 lines) — shared data fixtures, mock singletons, makeJob factory, resetMocks helper.
  - `transcribe.job.test.ts` (195 lines) — parseStorageUri (2) + processTranscribeJob happy-path (10) = 12 tests.
  - `transcribe.job.error.test.ts` (91 lines) — error-handling + cleanup = 5 tests.
  - Both test files declare their own `vi.mock` blocks (Vitest hoists them; cannot be in .fixtures.ts).
  - Total: 17 transcribe tests; full suite 136/136 pass.

Key gotchas for Subtask 7:
- `caption_tracks` has NO UNIQUE constraint on `file_id` — INSERT IGNORE only guards duplicate `caption_track_id` PK. One-track-per-file rule enforced by service ConflictError check before insert.
- Original `captions-endpoints.test.ts` was seeding into `project_assets_current` (dropped in 024) and using JWT bypass auth. Both needed to be completely rewritten.
- Auth system uses session tokens (SHA-256 hashed) NOT JWTs — other integration tests that set `APP_DEV_AUTH_BYPASS=true` were masking this; captions test now correctly uses `APP_DEV_AUTH_BYPASS=false` and seeds a real session row.
- Media-worker worker derives `project_id` from `project_files WHERE file_id = ?` — if a file isn't linked to any project, worker throws and BullMQ retries.

**Subtask 6** — COMPLETE (2026-04-18)
- Modified: `apps/api/src/repositories/clip.repository.ts` — `asset_id` → `file_id` everywhere in SQL; added `isFileLinkedToProject(projectId, fileId)` that queries `project_files` pivot.
- Modified: `apps/api/src/services/clip.service.ts` — `createClip` now checks `isFileLinkedToProject` before insert; throws `ValidationError` (400) if file not linked.
- Modified: `apps/api/src/controllers/clips.controller.ts` — wire-level `assetId` kept in Zod schema (Batch 1 compat); maps `body.assetId` → `fileId` when calling service.
- Modified: `apps/api/src/services/clip.service.test.ts` — updated to `fileId`, added `mockIsFileLinked`, new cases for unlinked-file error and null-fileId skip.
- Created: `apps/api/src/services/clip.service.integration.test.ts` — 4 integration tests (real MySQL): linked-file succeeds, unlinked-file fails, null-fileId succeeds, phantom-file fails.

Key gotcha: `isFileLinkedToProject` lives in `clip.repository.ts` (not `fileLinks.repository.ts`) because it is read-only and its only consumer is `clip.service`. Cross-repository imports would introduce coupling. The `project_files` write path still lives exclusively in `fileLinks.repository.ts`.

**Subtask 4** — COMPLETE (2026-04-18)
- Created: `apps/api/src/repositories/file.repository.ts` (258 lines) — all SQL for `files` table: createPending, finalize, findById, findByIdForUser, findReadyForUser (cursor-paginated), getReadyTotalsForUser, updateProbeMetadata, setFileError.
- Created: `apps/api/src/services/file.service.ts` (227 lines) — createUploadUrl (MIME allowlist, filename sanitize, presign PUT, insert pending row), finalizeFile (S3 HEAD verify, status transition, enqueue ingest; idempotent), listFiles (cursor pagination), streamUrl (ownership check + presign GET). Re-exports `parseStorageUri`.
- Created: `apps/api/src/controllers/file.controller.ts` (132 lines) — thin handlers; exports Zod schemas for route middleware.
- Created: `apps/api/src/routes/file.routes.ts` (33 lines) — 4 routes: POST /files/upload-url, GET /files, GET /files/:id/stream, POST /files/:id/finalize. Registered in `apps/api/src/index.ts`.
- Created: `apps/api/src/services/file.service.fixtures.ts` (79 lines) + `apps/api/src/services/file.service.test.ts` (306 lines) — 18 integration tests all pass.
- Modified: `packages/project-schema/src/types/job-payloads.ts` — added optional `fileId?: string` to `MediaIngestJobPayload`.
- Modified: `apps/media-worker/src/jobs/ingest.job.ts` — added `setFileReady`/`setFileError` helpers for `files` table; `processIngestJob` now checks `job.data.fileId` first; when present writes `duration_ms`, `width`, `height`, `bytes=null` to `files`; legacy `project_assets_current` path unchanged.

**Subtask 5** — COMPLETE (2026-04-18)
- Created: `apps/api/src/repositories/fileLinks.repository.ts` (115 lines) — SQL for `project_files` and `draft_files`: INSERT IGNORE for idempotent links, JOIN reads.
- Created: `apps/api/src/services/fileLinks.service.ts` (145 lines) — ownership checks (ForbiddenError 403 on mismatch, NotFoundError 404 on missing), link + read delegation.
- Created: `apps/api/src/services/fileLinks.response.service.ts` (103 lines) — maps FileRow → AssetApiResponse; thumbnailUri/waveformPeaks return null (not in files table yet).
- Modified: `apps/api/src/repositories/project.repository.ts` — added `ProjectRecord` type + `findProjectById` for ownership checks.
- Modified: `apps/api/src/controllers/assets.controller.ts` — `getProjectAssets` now reads via `project_files → files` (FE contract unchanged).
- Modified: `apps/api/src/controllers/projects.controller.ts` + `apps/api/src/routes/projects.routes.ts` — added `POST /projects/:projectId/files`.
- Modified: `apps/api/src/controllers/generationDrafts.controller.ts` + `apps/api/src/routes/generationDrafts.routes.ts` — added `POST /generation-drafts/:draftId/files` and `GET /generation-drafts/:id/assets`.
- Created: `apps/api/src/services/fileLinks.service.test.ts` (279 lines) — integration tests, real MySQL.
- Created: `apps/api/src/__tests__/integration/file-links-endpoints.test.ts` (235 lines) — HTTP integration tests, project side.
- Created: `apps/api/src/__tests__/integration/file-links-endpoints.draft.test.ts` (252 lines) — HTTP integration tests, draft side.
- Created: `apps/api/src/__tests__/integration/file-links-endpoints.fixtures.ts` (124 lines) — shared seed/teardown.

Key gotchas for Subtask 5:
- `INSERT IGNORE` is the idempotency mechanism for the pivots; service returns `{ created: bool }` to distinguish first vs duplicate link. HTTP controller always returns 204 regardless.
- `findProjectById` added to project.repository.ts — the service imports from the repository directly (not from project.service.ts) to avoid circular dependencies.
- Route ordering: `/:draftId/files` (POST) and `/:id/assets` (GET) registered AFTER `/:id/enhance/:jobId`. No ambiguity since `/files` and `/assets` are extra segments. Express path matching is segment-based, not prefix-based.
- The `fileLinks.response.service.ts` accepts `baseUrl` for API parity with `asset.response.service.ts` but does not use it (no per-file thumbnail proxy endpoint yet). The parameter is voided explicitly.
- `project.service.test.ts` was not broken — it only tests `createProject`/`listForUser` which were not changed.

Key gotchas:
- `bytes` is NOT populated by the ingest worker — FFprobe doesn't return S3 object size. Left as null after ingest; the presign request's `fileSizeBytes` is not stored in `files` in this iteration.
- `assetId` is kept as required in `MediaIngestJobPayload` (breaking it would cascade). `fileId` is optional and checked first; `assetId` is reused as the BullMQ jobId when submitting file ingest jobs (deduplication still works).
- Route ordering matters: `/files/upload-url` and `/files` must be registered BEFORE `/files/:id` to avoid Express matching "upload-url" as an id param.
- `parseStorageUri` is duplicated between `asset.service.ts` and `file.service.ts` — both export it. TODO: consolidate to `apps/api/src/lib/storage-uri.ts` in a future cleanup.

**Subtask 1** — COMPLETE (2026-04-18)
- Modified: `apps/web-editor/src/features/home/components/HomePage.tsx` — outer div `minHeight:'100vh'` → `height:'100vh'`; added `minHeight:0` to `<main>`. Fixes scroll containment (feedback #1).
- Modified: `apps/web-editor/src/features/home/components/StoryboardPanel.tsx` — `handleCreate` now async; calls `createDraft({ schemaVersion:1, blocks:[] })` from `@/features/generate-wizard/api` then navigates to `/generate?draftId=${draft.id}`. Falls back to `/generate` on error. Added `isCreating` state + disabled button during POST (feedback #2).
- No new tests (subtask scope: manual smoke only).

**Subtask 3** — COMPLETE (2026-04-18)
- Created: `apps/api/src/db/migrations/023_downstream_file_id_columns.sql` — adds nullable `file_id` to `project_clips_current`, `caption_tracks`; adds `output_file_id` to `ai_generation_jobs`. All idempotent via INFORMATION_SCHEMA + PREPARE/EXECUTE.
- Created: `apps/api/src/db/migrations/024_backfill_file_ids.sql` — high-risk one-way migration: copies `project_assets_current` → `files` (reusing `asset_id` as `file_id`), copies to `project_files` (INSERT IGNORE for FK violations), updates downstream `file_id` from `asset_id`, makes `caption_tracks.file_id` NOT NULL, drops FK `fk_ai_generation_jobs_asset`, drops `asset_id` columns from downstream tables, drops `result_asset_id` from ai_generation_jobs, drops `project_assets_current`. Steps 1-5 gated by PAC existence check to handle re-run after table is gone.
- Created: `apps/api/src/db/migrations/025_drop_ai_job_project_id.sql` — drops FK, index, and column `project_id` from `ai_generation_jobs`.
- Applied to dev container; double-run confirmed no-op for all three migrations.

Key gotcha: COLUMN_DEFAULT IS NOT NULL check is unreliable for idempotency — use COUNT where IS_NULLABLE = 'YES' instead. COLUMN_DEFAULT can be NULL even for a nullable column (no default set), causing the guard to fail.
Seed data note: `project_assets_current` seed rows had `project_id = 'proj-001'` (non-existent in `projects`), so `project_files` has 0 rows after backfill (INSERT IGNORE skips FK violations). Expected behavior.

**Subtask 2** — COMPLETE (2026-04-18)
- Created: `apps/api/src/db/migrations/021_files.sql` — `files` root table (62 lines). Columns: file_id PK, user_id FK→users CASCADE, kind ENUM(5), storage_uri, mime_type, bytes, width, height, duration_ms, display_name, status ENUM(4) DEFAULT 'pending', error_message, timestamps. Indexes: `idx_files_user_status(user_id,status)`, `idx_files_user_created(user_id,created_at DESC)`. Idempotent via `CREATE TABLE IF NOT EXISTS`.
- Created: `apps/api/src/db/migrations/022_file_pivots.sql` — `project_files` + `draft_files` pivot tables (49 lines). Both: composite PK, created_at. FKs: container side ON DELETE CASCADE, file side ON DELETE RESTRICT. Idempotent via `CREATE TABLE IF NOT EXISTS`.
- Applied to dev container; double-run confirmed no-op.

Key notes:
- CSS scroll fix: `height: 100vh` on flex container + `minHeight: 0` on flex child is the canonical pattern. `minHeight: 100vh` prevents bounding because the container can always grow taller than viewport.
- `createDraft` already exists in `generate-wizard/api.ts` — no new endpoint needed.
- Wizard's `useGenerationDraft` already handles `?draftId=` hydration — confirmed in subtask 7 of Home Hub EPIC.
- Empty PromptDoc: `{ schemaVersion: 1, blocks: [] }` — matches `promptDocSchema` in `packages/project-schema`.
- For brand-new tables, `CREATE TABLE IF NOT EXISTS` is the correct idempotency mechanism. `INFORMATION_SCHEMA + PREPARE/EXECUTE` is only needed for `ALTER TABLE ADD COLUMN` on existing tables.
- FK RESTRICT on file side: file rows survive draft/project deletion; must explicitly unlink before dropping a file. This is by design (files are user-owned, not container-owned).
- `generation_drafts` PK is named `id` (not `draft_id`) — `fk_draft_files_draft` references `generation_drafts(id)`.
