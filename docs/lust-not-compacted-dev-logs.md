# Development Log (compacted — 2026-03-29 to 2026-04-19)

## Monorepo Scaffold (Epic 1)
- added: root config (`package.json`, `turbo.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` — MySQL 8 + Redis 7)
- added: `apps/api/` (Express + helmet/cors/rate-limit, BullMQ stubs), `apps/web-editor/` (React 18 + Vite), `apps/media-worker/`, `apps/render-worker/`
- added: `packages/project-schema/` (Zod: ProjectDoc, Track, Clip union, imageClipSchema), `packages/remotion-comps/` (VideoComposition + layers)
- fixed: `APP_` env prefix; Zod startup validation; `workspace:*` → `file:` paths

## DB Migrations
- added: 001–020 — projects, assets, captions, versions, render_jobs, project_clips, seed, image clip ENUM, users/sessions/password_resets/email_verifications, ai_provider_configs (later dropped), ai_generation_jobs
- added: 013_drop_ai_provider_configs; 014_ai_jobs_fal_reshape; 015_ai_jobs_audio_capabilities (ENUM widened to 8); 016_user_voices; 017_asset_display_name; 018_add_caption_clip_type; 019_generation_drafts; 020_projects_owner_title
- added: 021_files (root table, user-scoped, status ENUM, idx_files_user_status/created), 022_file_pivots (project_files + draft_files, composite PKs, CASCADE container / RESTRICT file)
- added: 023_downstream_file_id_columns (file_id on project_clips_current + caption_tracks, output_file_id on ai_generation_jobs)
- added: 024_backfill_file_ids (one-way: project_assets_current → files + project_files; update downstream file_id; NOT NULL caption_tracks.file_id; drop asset_id cols + project_assets_current table)
- added: 025_drop_ai_job_project_id (drop FK + idx + project_id column)
- added: 026_ai_jobs_draft_id (nullable `draft_id CHAR(36)`; INFORMATION_SCHEMA guard; no FK)
- added: 027_drop_project_assets_current (formal idempotent drop after migration 024 partial failures on drifted DBs)

## Infrastructure (Redis + BullMQ + S3)
- updated: Redis healthcheck, error handlers, graceful shutdown, worker concurrency
- fixed: `@/` alias + `tsc-alias` in api tsconfig
- added: S3 stream endpoint `GET /assets/:id/stream` with Range header forwarding

## Asset Upload Pipeline (Epic 1)
- added: `errors.ts`, `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: asset CRUD endpoints; `enqueue-ingest.ts` (idempotency, 3 retries, exp backoff)
- added: `ingest.job.ts` — S3 → FFprobe → thumbnail → waveform → S3 → DB ready; audio-only `fps=30`

## Asset Browser + Upload UI (Epic 1)
- added: `features/asset-manager/` — types, api, hooks (useAssetUpload, useAssetPolling), components (AssetCard, AssetDetailPanel, UploadDropzone, UploadProgressList, AssetBrowserPanel)
- added: `getAssetPreviewUrl()`, `matchesTab()`, `TypeIcon`, `hideFilterTabs` prop

## VideoComposition + Storybook (Epic 2)
- updated: `VideoComposition.tsx` — z-order sort, muted filtering, trim frames, image branch
- added: Storybook config + stories; extracted `VideoComposition.utils.ts`

## Stores (Epic 2)
- added: `project-store.ts` (useSyncExternalStore, Immer patches, computeProjectDuration), `ephemeral-store.ts`, `history-store.ts` (undo/redo, drainPatches)
- added: `computeProjectDuration()` in `packages/editor-core`

## Preview + Playback (Epic 2)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `PlaybackControls.tsx`, `formatTimecode.ts`, `VolumeControl.tsx`, `usePrefetchAssets.ts`
- fixed: rAF tick; `waitUntilDone()` is function not Promise (Remotion v4); playhead freezing

## App Shell (Epic 2)
- added: `App.tsx` (two-column desktop + mobile layout), `App.panels.tsx`, `App.styles.ts`, `MobileInspectorTabs.tsx`, `MobileBottomBar.tsx`, `useWindowWidth.ts`

## Captions / Transcription (Epic 3)
- added: caption CRUD + `POST /assets/:id/transcribe` (202); `transcribe.job.ts` (S3 → Whisper → DB)
- added: FE `TranscribeButton.tsx`, `useAddCaptionsToTimeline.ts`, `CaptionEditorPanel.tsx`

## Version History & Rollback (Epic 4)
- added: version CRUD + restore; `useAutosave.ts` (debounce 2s, drainPatches, beforeunload flush)
- added: `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`
- added: `GET /projects/:id/versions/latest`; `fetchLatestVersion`, `save()`/`resolveConflictByOverwrite()`, `performSave(force)`; Save + Overwrite buttons

## Background Render Pipeline (Epic 5)
- added: render CRUD + per-user 2-concurrent limit; `render.job.ts` (fetch doc → Remotion render → S3)
- added: FE `useExportRender.ts`, `RenderProgressBar.tsx`, `ExportModal.tsx`; render-worker Docker (node:20-slim + Chromium)
- added: `RendersQueueModal.tsx`, `useListRenders.ts` (polls 5s), renders badge in TopBar
- fixed: `REMOTION_ENTRY_POINT`; render black screen (presigned S3 URLs); download URLs
- created: `packages/remotion-comps/src/remotion-entry.tsx` — `registerRoot()` for `bundle()`

## Timeline Editor (Epic 6)
- added: BE — `clip.repository.ts`, `clip.service.ts`, `clips.controller.ts`, `clips.routes.ts`; PATCH + POST clip endpoints with cross-track moves
- added: FE — TimelineRuler, TrackHeader, ClipBlock, WaveformSvg, ClipLane, ClipContextMenu, TrackList, TimelinePanel, ScrollbarStrip
- added: hooks — useSnapping, useClipDrag, useClipTrim, useClipDeleteShortcut, useScrollbarThumbDrag, useTrackReorder, useTimelineWheel
- added: `clipTrimMath.ts`, `clipContextMenuActions.ts`, `AddTrackMenu.tsx`, `useAddEmptyTrack.ts`, `useTimelineResize.ts`, `TimelineResizeHandle.tsx`
- fixed: float frames → `Math.round()`; split edge case; passive wheel; context menu portal; clip scroll sync; playhead needle rAF bridge; ruler click seek
- removed: cross-track drag
- updated: TRACK_HEADER_WIDTH 64→160; TRACK_ROW_HEIGHT 48→36

## Clip Persistence + Asset Drop
- updated: `useAddAssetToTimeline.ts` — calls `createClip()` after `setProject()`
- added: `useDropAssetToTimeline.ts` — auto-creates track on empty timeline drop

## Inspector Panels
- added: `ImageClipEditorPanel`, `VideoClipEditorPanel`, `AudioClipEditorPanel` + hooks
- updated: `App.panels.tsx` — inspector branches in RightSidebar/MobileTabContent

## Additional Features
- fixed: CSS reset (white border); mobile preview height
- added: `DeleteTrackDialog.tsx`, Scroll-to-Beginning button, `useReplaceAsset.ts`/`ReplaceAssetDialog.tsx`, `useDeleteAsset.ts`/`DeleteAssetDialog.tsx`
- added: `AddToTimelineDropdown.tsx`/`useTracksForAsset.ts`, `ProjectSettingsModal.tsx` (FPS + resolution presets)
- added: `POST /projects`; `useProjectInit.ts` (reads `?projectId=` or creates new; hydrates via `fetchLatestVersion`)
- fixed: `useCurrentVersionId()` reactivity via `useSyncExternalStore`

## Authentication & Authorization (Epic 8)
- added: `user.repository.ts`, `session.repository.ts`, `auth.service.ts` (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12)
- added: auth routes — register, login, logout, me; rate limiting (5 reg/IP/hr, 5 login/email/15min)
- added: `email.service.ts` (stub), password-reset (1hr TTL), email-verify (24hr TTL), single-use
- rewrote: `auth.middleware.ts` — session-based via `authService.validateSession()`; `APP_DEV_AUTH_BYPASS` env
- updated: `acl.middleware.ts`, `express.d.ts`, all controllers (`req.user.id` → `req.user.userId`)
- added FE: `features/auth/` — LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; React Router; auth styles
- added: `AuthProvider.tsx`, `ProtectedRoute.tsx`, `useAuth.ts`; Bearer token injection + 401 interceptor
- added: `oauth.service.ts` (Google + GitHub code exchange, account linking); OAuth routes + FE buttons
- added: query-param `?token=` fallback for media auth; `buildAuthenticatedUrl()` in `api-client.ts`

## AI Platform — Epic 9 (fal.ai + ElevenLabs)
- removed: BYOK layer (aiProvider.*, lib/encryption.ts, `APP_AI_ENCRYPTION_KEY`, FE `features/ai-providers/`)
- added: `APP_FAL_KEY`, `apps/media-worker/src/lib/fal-client.ts`
- added: `packages/api-contracts/src/fal-models.ts` (1093 lines, §9.7 exception) — 9 fal models
- added: `apps/api/src/services/falOptions.validator.ts`; `aiGeneration.assetResolver.ts`
- rewrote: `aiGeneration.service.ts`, `aiGenerationJob.repository.ts`, `ai-generate.job.ts`
- added: `ai-generate.output.ts` (capability-keyed parser); `GET /ai/models`; removed 8 legacy provider adapters
- added: `packages/api-contracts/src/elevenlabs-models.ts`, `elevenlabs-client.ts`; `AiProvider = 'fal'|'elevenlabs'`; unified `AI_MODELS` (13)
- added: `APP_ELEVENLABS_API_KEY`, `ai-generate-audio.handler.ts`, `voice.repository.ts`, `listUserVoices`, `GET /ai/voices`

## AI Generation — FE Schema-Driven Panel
- rewrote: `features/ai-generation/types.ts`, `api.ts`
- created: `CapabilityTabs.tsx`, `ModelCard.tsx`, `AssetPickerField.tsx`, `SchemaFieldInput.tsx` (8-type dispatcher)
- rewrote: `GenerationOptionsForm.tsx`, `AiGenerationPanel.tsx`
- added: `aiGenerationPanel.utils.ts` + 28 unit tests; styles split (tokens/field/panel)

## Asset Rename
- added: migration 017 `displayName` column; repo type + `updateAssetDisplayName`
- added: `renameAsset` service; `PATCH /assets/:id` with Zod validation
- added: FE `Asset.displayName`, `updateAsset()`, `InlineRenameField.tsx`; `AssetCard`/`AssetDetailPanel` render `displayName ?? filename`

## Progressive Reveal Captions
- added: `CaptionWord` + `CaptionSegment.words?` to project-schema (additive)
- updated: `transcribe.job.ts` to extract Whisper word timestamps
- added: `captionClipSchema` (discriminated union); `ClipInsert.type` includes `'caption'`
- added: `CaptionLayer.tsx` — per-word color via `useCurrentFrame()`, `premountFor={fps}`, `clipStartFrame` prop for second-clip highlighting
- updated: `useAddCaptionsToTimeline.ts` — branches on words (CaptionClip vs TextOverlayClip fallback)
- added: `CaptionEditor` dual-hex color inputs; 5 regression tests; schema JSDoc (absolute-frame contract)

## AssetPreviewModal Fix
- fixed: `AssetPreviewModal.tsx` — replaced presigned `downloadUrl` with `${apiBaseUrl}/assets/${id}/stream` + `buildAuthenticatedUrl`

## EPIC 10 STAGE 1 — Design Tooling (Figma → Stitch)
- installed: `davideast/stitch-mcp`; removed `figma-remote-mcp`
- created: Stitch project `1905176480942766690` + DS `assets/17601109738921479972` v1 "ClipTale Dark"
- generated: 4 DESKTOP screens (Landing/Dashboard/Editor/Asset Browser); transient dup Landing (OQ-S1)
- rewrote: `docs/design-guide.md` — §1 Stitch, §3 tokens + DS ID, §6 screen IDs, §7 tool patterns, §10 OQ-S1..S4

## Video Generation Wizard (Phase 0 + Step 1)
- added: migration `019_generation_drafts.sql` (JSON prompt_doc, status ENUM, composite idx)
- added: `packages/project-schema/src/schemas/promptDoc.schema.ts` — `promptDocSchema` (discriminatedUnion)
- added: `generationDraft.repository.ts`, `generationDraft.service.ts`, controllers + routes (5 routes, auth + editor ACL)
- added: 5 OpenAPI paths + `GenerationDraft`/`UpsertGenerationDraftBody` schemas
- added: repo `findReadyForUser` + `getReadyTotalsForUser`; `asset.list.service.ts` split; `GET /assets` route + Zod
- added: `features/generate-wizard/` (components/, hooks/, api.ts, types.ts)
- added: `WizardStepper.tsx`, `GenerateWizardPage.tsx`, `/generate` route (protected)
- added: `PromptEditor.tsx` + `promptEditorDOM.ts` — contenteditable chip controller; forwardRef imperative handle
- chip colors: video=#0EA5E9, image=#F59E0B, audio=#10B981
- added: `useAssets.ts` (React Query); `MediaGalleryPanel.tsx` (580px); `AssetThumbCard.tsx`, `AudioRowCard.tsx`
- added: `mediaGalleryStyles.ts` + state styles; `AssetPickerModal.tsx` (520×580, type-filtered, focus trap)
- added: `PromptToolbar.tsx`; `put` on apiClient; `useGenerationDraft.ts` (debounced 800ms, POST-then-PUT, `flush()`)
- added: `WizardFooter.tsx` + `CancelConfirmDialog.tsx`; `GenerateRoadMapPlaceholder.tsx` + `/generate/road-map`

## Wizard Phase 2 (AI Enhance + Pro Tip)
- added: `EnhancePromptJobPayload`; `QUEUE_AI_ENHANCE` + `aiEnhanceQueue`
- added: `enqueue-enhance-prompt.ts` (UUID jobId, 3 retries)
- rewrote: `enhancePrompt.job.ts` — serialize → `gpt-4o-mini` → validate sentinels → splice → `promptDocSchema`
- added: `enhancePrompt.helpers.ts`; `enhance.rate-limiter.ts` (10/hr per userId)
- added: `POST /generation-drafts/:id/enhance` (202), `GET .../enhance/:jobId`; `startEnhance`, `getEnhanceStatus`
- added: `EnhanceStatus`; `useEnhancePrompt.ts` (1000ms poll, 60s cap)
- added: `EnhancePreviewModal.tsx` + `renderPromptDocText.ts`
- fixed: `mapRowToDraft` — `typeof === 'string'` guard for mysql2 JSON columns
- added: `useDismissableFlag.ts` + `ProTipCard.tsx`

## EPIC — Home: Projects & Storyboard Hub
- added: `020_projects_owner_title.sql` (owner_user_id + title + composite idx); `findProjectsByUserId`, `listForUser`
- added: `MediaPreview`, `StoryboardCard` types; `findStoryboardDraftsForUser`, `findAssetPreviewsByIds`; `listStoryboardCardsForUser`
- added: `GET /generation-drafts/cards`; `/projects` + `/generation-drafts/cards` in openapi.ts
- added FE: `features/home/` (HomePage, HomeSidebar, ProjectCard/Panel, StoryboardCard/Panel)
- updated: `/` → `HomePage`; `*` → `/`; LoginPage post-login → `/`; wizard reads `?draftId=` via useSearchParams

## Editor + Generate-Wizard UX Batch
- added: Home button + Manual Save + Overwrite buttons in editor TopBar; `BackToStoryboardButton.tsx` → `/?tab=storyboard`
- fixed: PromptEditor chip-deletion (walk past consecutive empty text nodes); 3 regression tests
- added: HTML5 drag-drop (MIME `application/x-cliptale-asset`) from AssetThumbCard/AudioRowCard into PromptEditor; × remove button on chips

## EPIC — Files-as-Root Foundation (Batch 1, 2026-04-18)
- FE Home bounds: HomePage outer `height: '100vh'`; `<main>` `minHeight: 0`; StoryboardPanel async create → wizard navigate
- DDL: migrations 021 (files table) + 022 (project_files/draft_files pivots, CASCADE container / RESTRICT file)
- DDL: 023 downstream file_id columns; 024 backfill + drop asset_id/project_assets_current; 025 drop ai_jobs project_id FK
- added: `file.repository.ts` (createPending, finalize, findById/ForUser, findReadyForUser, updateProbeMetadata, setFileError)
- added: `file.service.ts`, `file.controller.ts`, `file.routes.ts`; 18 file.service + 4 ingest integration tests
- updated: `ingest.job.ts` — dual-path: write to `files` when fileId, fallback to project_assets_current
- added: `fileLinks.repository.ts` + `fileLinks.service.ts` + `fileLinks.response.service.ts` (ownership checks, idempotent link, FileRow→AssetApiResponse)
- added: POST /projects/:projectId/files, POST /generation-drafts/:draftId/files, GET /generation-drafts/:id/assets; 42 integration tests
- refactored: `clip.repository.ts` / `clip.service.ts` / `clips.controller.ts` — asset_id → file_id (wire compat kept); `isFileLinkedToProject`
- fixed: `project.repository.ts` broken `JOIN project_assets_current` subquery (was 500ing GET /projects)
- refactored: `caption.repository.ts` + `caption.service.ts` + `transcribe.job.ts` — file_id; `getCaptionTrackByFileId`
- refactored: `aiGenerationJob.repository.ts` (removed projectId/resultAssetId; added outputFileId + `setOutputFile`); `enqueue-ai-generate.ts`; `aiGeneration.service.ts` user-scoped; `aiGeneration.assetResolver.ts` uses `findByIdForUser`
- Batch 1 compat shim: `aiGeneration.controller.ts` Zod optional `projectId` stripped (removed in Batch 2-cleanup)
- total new tests: 56 (service 17, status 7, audio 12, assetResolver 10, integration 4, endpoints 6)

## EPIC — Files-as-Root Foundation (Batch 2, 2026-04-18) — FE upload + AI port to wizard
- added: `shared/file-upload/` — types (UploadTarget project|draft), api, `useFileUpload.ts` (request-URL → XHR → finalize → link); 13 tests
- converted: `features/asset-manager/hooks/useAssetUpload.ts` to shim wrapping `useFileUpload({ target: { kind: 'project', projectId } })`
- promoted: `UploadDropzone.tsx` + `UploadProgressList.tsx` to `shared/file-upload/` (asset-manager shim re-exports)
- extended: wizard `MediaGalleryPanel` — Upload btn (draftId-gated) + UploadDropzone modal + `useFileUpload({ kind: 'draft' })`; 14 tests + fixtures
- moved: 47 files `features/ai-generation/` → `shared/ai-generation/`; updated App.tsx/App.panels.tsx/App.leftSidebar.test.tsx imports
- added: `AiGenerationContext` type (`{ kind: 'project'|'draft', id }`); `submitGeneration(context, request)`; `getContextAssets(context)`; query keys scoped to `[...kind, id]`
- added: migration 026 (nullable `draft_id`); `aiGenerationJob.repository.setDraftId`; setOutputFile INSERT IGNOREs `draft_files` pivot (repo-layer completion hook)
- added: `POST /generation-drafts/:draftId/ai/generate` route + submitDraftAiGeneration service; 8 integration tests
- added: 'ai' tab in `MediaGalleryTabs`; MediaGalleryPanel renders `<AiGenerationPanel context={...}>`; 8 AI tab tests
- E2E regression (Playwright): 5/5 core workflows PASS (Home Hub, Editor upload, Wizard upload, Editor AI, Wizard AI)

## EPIC — Guardian Batch-2 Feedback Cleanup (Files-as-Root, 2026-04-19)
Closes guardian feedback items 5–11 on 2026-04-19 review — migration-runner trust, schema recovery, test-debt cleanup, wire rename.

### Subtask 1 — In-process migration runner
- added: `apps/api/src/db/migrations/000_schema_migrations.sql` — bookkeeping table (filename PK, sha256 checksum, applied_at)
- added: `apps/api/src/db/migrate.ts` — `runPendingMigrations()`, `computeChecksum()`, `sortedMigrationFiles()`, `MigrationChecksumMismatchError`, `MIGRATIONS_DIR`; numeric-prefix order; checksum drift detection; per-migration dedicated mysql2 connection with `multipleStatements: true`; production gate (`NODE_ENV=production && !APP_MIGRATE_ON_BOOT`)
- updated: `apps/api/src/index.ts` — awaits `runPendingMigrations()` before `app.listen()`; `process.exit(1)` on fatal error
- updated: `docker-compose.yml` — removed `/docker-entrypoint-initdb.d:ro` mount (runner replaces it)
- added: `migrate.unit.test.ts` (260 lines, 14 tests) + `migrate.production.test.ts` (111 lines, 2 tests) — each declares its own `vi.hoisted()` block
- added: `migrate.integration.test.ts` (3 tests against live Docker DB)
- invariant: MySQL 8.0 DDL non-transactional → INSERT into `schema_migrations` AFTER DDL succeeds; migration files must be idempotent

### Subtask 2 — Live DB recovery + schema final-state guard
- added: migration `027_drop_project_assets_current.sql` (idempotent)
- added: `schema-final-state.integration.test.ts` (161 lines, 7 tests) — asserts 8-value `capability` ENUM, `draft_id`+`output_file_id` nullable, `project_id`/`result_asset_id` absent, `project_assets_current` absent
- recovery: diagnosed live DB in pre-migration state despite `schema_migrations` seeded (test beforeAll had DELETE+re-seed poisoning); chose Path B — `docker volume rm cliptalecom-v2_db_data` + compose up → clean boot via initdb + runner → verified correct target schema
- hardened test isolation:
  - `vitest.config.ts` — added `pool: 'forks'` + `poolOptions.forks.singleFork: true` (serialize integration files)
  - `migrate.integration.test.ts` — schema-broken detection guard in beforeAll: if ENUM missing `text_to_speech`, apply repair SQL (015/023/024/025/026/027) + UPSERT checksums
  - `migration-014.test.ts` — stub `project_assets_current` in beforeAll (for migration 010 FK); afterAll applies repair SQL + UPSERTs schema_migrations rather than calling runPendingMigrations (avoids non-idempotent 017 re-run)
  - `migration-001.test.ts` — outer afterAll `DROP TABLE IF EXISTS project_assets_current` (clean up stub)
  - `schema-final-state.integration.test.ts` — self-healing beforeAll (INFORMATION_SCHEMA-guarded DDL)
- updated: `.claude/agent-memory/regression-direction-guardian/project_migration_reliability.md` — removed `docker volume rm` workaround; points at `apps/api/src/db/migrate.ts`
- suite: 828 pass / 27 fail (all pre-existing Class-A DEV_AUTH_BYPASS); schema-final-state 7/7; Class-B AI-generate all pass

### Subtask 3 — Stale `asset_id` test debt
- updated: `migration-002.test.ts` — columns/INSERTs `asset_id` → `file_id`; composite-index test asserts legacy index absent (dropped by 024 step 8); 8/8 pass
- updated: `projects-list-endpoint.test.ts` — beforeAll seed refactored to `files` + `project_files` pivot; clip INSERT uses `file_id`; FK-aware cleanup; thumbnail assertion → `toBeNull()` (files table has no `thumbnail_uri` yet); 13/13 pass
- updated: `assets-delete-endpoint.test.ts` — clip INSERT → `file_id`; beforeAll completes
- acceptance: `grep "Unknown column 'asset_id'"` full suite = 0

### Subtask 4 — Delete DEV_AUTH_BYPASS-incompatible auth-contract tests
- removed: 25 `.toBe(401)` tests across 10 integration files — versions-list-restore (4), versions-persist (2), versions-latest (2), assets-endpoints (4), assets-finalize (2), assets-list (2), assets-stream (2), renders (3), clip-patch (2), assets-delete (2)
- rationale: `APP_DEV_AUTH_BYPASS=true` is dev/CI default → 401 assertions unreachable; user decision option (a) delete
- acceptance: 0 Class-A failures remaining; suite 822 pass / 6 pre-existing non-Class-A

### Subtask 5 — Working-tree hygiene + `.gitignore`
- deleted: 17 `docs/test_screenshots/wizard-ai-*.png` files; `git rm` for 2 `playwright-screenshots/*.png` + `playwright-review-temp.js`
- extended: `.gitignore` — appended `# Transient QA artefacts` block covering `docs/test_screenshots/`, `playwright-screenshots/`, `playwright-review-temp.js`
- verified: `git check-ignore docs/test_screenshots/foo.png` matches; smoke test of new file under ignored dir confirmed excluded

### Subtask 6 — Wire rename `assetId` → `fileId` (remove compat shim)
- renamed: `packages/api-contracts/src/openapi.ts` `MediaPreview.assetId` → `fileId` (rebuilt dist)
- renamed: `packages/project-schema/src/schemas/clip.schema.ts` (video/audio/image), `promptDoc.schema.ts` (`mediaRefBlockSchema`), `types/job-payloads.ts` (`TranscriptionJobPayload.assetId` → `fileId`; `MediaIngestJobPayload` dual-key: `fileId?` primary, `assetId?` legacy for AI worker); rebuilt dist
- updated: `apps/api/src/controllers/clips.controller.ts` body field; `aiGeneration.controller.ts` — removed `projectId` compat shim, added `.strict()` to `submitGenerationSchema`
- updated: ~70 FE files in `apps/web-editor/src` via targeted edits + bulk sed; fixed duplicate-key bug in `apps/api/src/services/file.service.ts` from bulk sed
- updated: `apps/media-worker/src/jobs/transcribe.job.ts` reads `fileId` directly; `ai-generate.job.ts` + `ai-generate-audio.handler.ts` pass `{ fileId, assetId, ... }` to ingest queue (legacy write path preserved)
- rewrote: `ai-generation-endpoints.test.ts` compat shim test → asserts 400 on unknown fields
- verified: `grep 'assetId' packages/api-contracts apps/api/src apps/web-editor/src` = 0
- tests: project-schema 100/100, web-editor 2006/2006, media-worker 136/136, apps/api 834 pass / 6 pre-existing
- note: `npm run build` required for both `project-schema` and `api-contracts` after schema source edits (workers import from dist)

### Subtask 7 — `general_idea.md` evolution appendix
- appended: `## Evolution since 2026-03-29` section with sub-sections: Storyboard drafts (migrations 019/022), Files-as-Root (021-026), features/ vs shared/ rule (consumed by ≥2 → shared), In-process migration runner (`apps/api/src/db/migrate.ts`)
- invariant: no earlier sections edited — guardian uses them as historical anchor

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via `*.fixtures.ts` + `.<topic>.test.ts` splits; approved exception: `fal-models.ts`
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets via deps
- Migration strategy: in-process runner (`apps/api/src/db/migrate.ts`) with `schema_migrations` (sha256 checksum) is the only sanctioned mutation path; `docker-entrypoint-initdb.d` deprecated
- MySQL 8.0 DDL non-transactional; INSERT into `schema_migrations` AFTER DDL succeeds; migration files must be idempotent (`INFORMATION_SCHEMA` + `PREPARE/EXECUTE` guards; `COUNT(*) WHERE IS_NULLABLE='YES'` for NOT NULL idempotency)
- Vitest integration suite: `pool: 'forks'` + `singleFork: true` to serialize across files; each split test file declares its own `vi.hoisted()` block (cannot be shared via fixtures)
- Files-as-root pattern: `files` user-scoped root; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file) = app-layer GC before file delete
- Wire DTO naming: `fileId` across the wire (contracts + BE + FE); `assetId` compat shim removed; `submitGenerationSchema` uses `.strict()`
- `findByIdForUser` unifies existence + ownership in one query (cross-user → null → NotFoundError — avoids leaking existence)
- Audio routes through ElevenLabs (not fal.ai)
- Wizard MediaGalleryPanel separate from editor AssetBrowserPanel (no cross-feature imports §14)
- Stitch DS `spacing`/`typography` do NOT round-trip — design-guide.md §3 authoritative
- Enhance state in BullMQ/Redis only; rate limit per-user; vanilla setInterval in FE hook
- mysql2 JSON columns: repository mappers must guard `typeof === 'string'` before `JSON.parse`
- Typography §3: body 14/400, label 12/500, heading-3 16/600; spacing multiples of 4px; radius-md 8px
- `/` HomePage is post-login + `*`-fallback; `/editor?projectId=<id>` is editor entry
- Shared hooks keyed by `AiGenerationContext` discriminated union live in `shared/ai-generation/` + `shared/file-upload/`; `features/generate-wizard/` may import only from `shared/`
- AI-generate completion hook at repository layer (INSERT IGNORE into `draft_files` pivot when `draft_id` set on job row) — avoids worker-side callback plumbing
- Production migration safety: runner refuses to run if `NODE_ENV === 'production' && !APP_MIGRATE_ON_BOOT` (temporary guard; multi-replica race risk)

---

## [2026-04-19]

### Task: Backend Repository Migration to Files-as-Root (asset.repository + generationDraft.repository + blocked test seeds)
**Subtask:** Subtask 1 — Migrate `asset.repository.ts` to read/write `files` + `project_files`

**What was done:**
- Rewrote all 8 SQL statements in `apps/api/src/repositories/asset.repository.ts` to target `files` + `project_files` (no more `project_assets_current` references in SQL)
- Preserved the public `Asset` type (same keys and types) and all exported function signatures — zero changes required in any service consumer
- `insertPendingAsset` now INSERTs into `files` (with `kind` derived from the MIME type prefix) then `INSERT IGNORE INTO project_files` for the pivot
- `getAssetById` and `getAssetsByProjectId` LEFT/INNER JOIN `project_files` to derive `projectId`; a file with no pivot row returns `projectId: ''`
- `isAssetReferencedByClip` now queries `project_clips_current.file_id` (not the dropped `asset_id` column)
- `deleteAssetById` removes the `project_files` pivot before deleting the `files` row (FK-safe order)
- `updateAssetStatus` and `updateAssetDisplayName` target `files` via `file_id`
- `findReadyForUser` reads `files` directly (user-scoped, no project join) with `mime_type LIKE ?` replacing the old `content_type LIKE ?`
- `getReadyTotalsForUser` reads `files` directly with `SUM(bytes)` replacing `SUM(file_size_bytes)`
- Documented inline: `thumbnailUri → null`, `waveformJson → null`, `fps → null`, `filename → display_name ?? file_id`, `fileSizeBytes → bytes coerced to 0 if null`, `durationFrames → duration_ms / 1000 * 30`
- Updated `apps/api/src/repositories/asset.repository.test.ts`: new row shape (`file_id`, `project_id`, `mime_type`, `bytes`, `duration_ms`), 21 tests covering null/non-null display name, fallback filename, null project_id → empty string, null thumbnailUri/fps/waveformJson, bytes coercion
- Updated `apps/api/src/repositories/asset.repository.list.test.ts`: new row shape, `mime_type LIKE` assertion replacing old `content_type LIKE`, `file_id` ordering replacing `asset_id`, `FROM files` assertion, `SUM(bytes)` assertion; 21 tests
- Created `apps/api/src/__tests__/integration/asset-repository.integration.test.ts`: seeds `files + project_files`, calls each exported function, asserts DB side-effects; covers happy path, null-projectId (orphan file), deleteAssetById FK order, isAssetReferencedByClip with clip row, findReadyForUser MIME filter, getReadyTotalsForUser counts

**Notes:**
- `asset.repository.ts` is retained as a thin compatibility adapter — a follow-up task should collapse service-layer calls directly to `file.repository.ts` / `fileLinks.repository.ts` and delete this module
- `durationFrames` is a lossy 30fps approximation from `duration_ms`; the old repo used exact fps from the schema column which no longer exists on `files`
- The unit tests for `getReadyTotalsForUser` assert `SUM(bytes)` (renamed from `SUM(file_size_bytes)`) — the SQL query was updated accordingly

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Subtask 1 — Migrate `asset.repository.ts` to read/write `files` + `project_files`</summary>

- What: Rewrite every SQL statement in `asset.repository.ts` so it targets `files` (joined with `project_files` when `projectId` is required) and `project_clips_current.file_id` (for the reference check). Preserve the public `Asset` type and every exported function signature so callers (services) need zero changes.
- Acceptance criteria: 0 `project_assets_current` matches; 0 `asset_id` DB column references; `Asset` type structurally identical; `isAssetReferencedByClip` uses `file_id`; `getAssetById`/`getAssetsByProjectId` LEFT JOIN `project_files`; `findReadyForUser`/`getReadyTotalsForUser` read from `files` with `mime_type LIKE ?`.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-19. Subtask 1 is backend-only (repository SQL + unit/integration tests). No UI components, design tokens, or visual changes. Approved per APPROVED pattern for backend-only changes.
checked by playwright-reviewer: APPROVED — Backend repository migration verified by integration tests (asset-repository.integration.test.ts + asset.repository.test.ts + asset.repository.list.test.ts), not E2E. No UI/routes changed.


---

## [2026-04-19]

### Task: Backend Repository Migration to Files-as-Root (asset.repository + generationDraft.repository + blocked test seeds)
**Subtask:** Subtask 2 — Migrate `generationDraft.repository.ts:findAssetPreviewsByIds` to `files`

**What was done:**
- Rewrote `findAssetPreviewsByIds` in `apps/api/src/repositories/generationDraft.repository.ts` to SELECT `file_id, mime_type` from the `files` table instead of `asset_id, content_type, thumbnail_uri` from the dropped `project_assets_current` table.
- Updated the private `AssetPreviewRow` RowDataPacket type to match the new schema (`file_id`, `mime_type`; removed `thumbnail_uri`).
- `thumbnailUri` is returned as `null` with an inline TODO comment — the `files` table has no `thumbnail_uri` column; backfill is a later milestone.
- Updated JSDoc on `findAssetPreviewsByIds` and the `MediaPreview` type comment to remove stale `project_assets_current` references.
- Added 6 new unit tests in `generationDraft.repository.test.ts` covering: empty input (no DB call), mixed-existing+missing fileIds, `mime_type→contentType` mapping, `thumbnailUri` always null, all-missing fileIds, and SQL correctness assertion (FROM files, no project_assets_current, correct params).
- All 11 tests in the file pass (5 pre-existing + 6 new).

**Notes:**
- `findAssetPreviewsByIds` is ownership-agnostic by design — used downstream of the draft-ownership check, so the repo itself does not filter by user. No change needed.
- `grep "project_assets_current" apps/api/src/repositories/generationDraft.repository.ts` returns 0 matches.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Subtask 2 — Migrate `generationDraft.repository.ts:findAssetPreviewsByIds` to `files`</summary>

- What: Rewrite the single SQL statement in `findAssetPreviewsByIds` (lines 212-230) so it SELECTs from `files` instead of `project_assets_current`. Preserve the return shape `{ fileId, contentType, thumbnailUri }`; map `mime_type → contentType` and resolve `thumbnailUri` to `null` (no column on `files` yet — document inline).
- Acceptance criteria: 0 project_assets_current matches; empty array returns [] without query; call with fileIds returns one row per existing fileId; missing fileIds silently absent; thumbnailUri is null in all returned rows.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: APPROVED — Backend repository migration (generationDraft.repository.ts:findAssetPreviewsByIds) verified by unit tests (11/11 pass: empty input, MIME mapping, thumbnailUri null, SQL correctness). No UI/routes/endpoints changed. Database-layer-only changes require integration tests, not E2E.

design-reviewer notes: Reviewed on 2026-04-19. Subtask 2 is backend-only (repository SQL migration + unit tests in generationDraft.repository.ts). No UI components, design tokens, or visual changes. Approved per backend-only exemption pattern.


---

## [2026-04-19]

### Task: Backend Repository Migration to Files-as-Root (asset.repository + generationDraft.repository + blocked test seeds)
**Subtask:** Subtask 3 — Fix seed + cleanup in `assets-patch-endpoint.test.ts`

**What was done:**
- Replaced the two `INSERT INTO project_assets_current` inserts in `beforeAll` with the Files-as-Root pattern: `INSERT INTO files` followed by `INSERT INTO project_files` for each of the two test assets (OWNED_ASSET_ID owned by dev-user-001, OTHER_ASSET_ID owned by other-user-777).
- Added `INSERT INTO users` for `other-user-777` (files table has FK to users; dev-user-001 is the migration-011 seed and requires no insert).
- Added `INSERT INTO projects` for `TEST_PROJECT_ID` (project_files has FK to projects; idempotent via `ON DUPLICATE KEY UPDATE`).
- Rewrote `afterAll` to delete in correct FK order: `project_files` → `files` → `projects` → `users (other-user-777 only)`, then `conn.end()`.
- Updated the "persists displayName" assertion to query `SELECT display_name FROM files WHERE file_id = ?` instead of the dropped `project_assets_current`.
- Updated the "returns 200" assertion: removed `filename: 'original.mp4'` from `toMatchObject` (the `files` table has no separate filename column — `filename` maps to `display_name ?? file_id`, which equals the renamed value after PATCH, not the original seed value). Added inline comment explaining the mapping.
- Verified: `grep "project_assets_current" assets-patch-endpoint.test.ts` returns 0 matches.
- All 9 tests in the file pass locally against the Docker Compose stack.

**Notes:**
- The `files` table has a FK constraint `fk_files_user → users(user_id) ON DELETE CASCADE`, so `other-user-777` must be seeded before its `files` row can be inserted.
- The `project_files` FK `fk_project_files_project → projects(project_id) ON DELETE CASCADE` requires the project row to exist before the pivot insert.
- Files-as-Root has no separate `filename` column. The `Asset.filename` field in the response is derived as `display_name ?? file_id`. The 200 assertion was narrowed to only assert `id` and `displayName` — both of which are stable regardless of previous rename tests.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Subtask 3 — Fix seed + cleanup in `assets-patch-endpoint.test.ts`</summary>

- What: Rewrite beforeAll to seed `files + project_files` (pattern from `projects-list-endpoint.test.ts:155-170`). Rewrite afterAll to DELETE from `project_files` first, then `files` (FK order). Update the "persists displayName in DB" assertion to read from `files.display_name` (not `project_assets_current.display_name`).
- Where: `apps/api/src/__tests__/integration/assets-patch-endpoint.test.ts`.
- Acceptance criteria: `grep "project_assets_current" ...` returns 0 matches; beforeAll seeds files + project_files; afterAll cleans up in FK order; all 9 tests pass.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: APPROVED — Backend integration test-only (assets-patch-endpoint.test.ts: database seed migration + assertions). Verified via integration tests (9/9 pass), not E2E. No UI/routes changed.

design-reviewer notes: Reviewed on 2026-04-19. Subtask 3 is test-only (assets-patch-endpoint.test.ts: database integration tests). No UI components, design tokens, colors, typography, spacing, or visual changes. Approved per test-only exemption pattern — backend test fixtures require no design review.

QA notes: assets-patch-endpoint.test.ts seed migration (Files-as-Root pattern): beforeAll seeds files + project_files with two test assets (OWNED_ASSET_ID owned by dev-user-001, OTHER_ASSET_ID owned by other-user-777); afterAll cleanup follows FK order (project_files → files → projects → users); database assertions query files table for display_name; all 9 tests PASS ✓.

---

## [2026-04-19]

### Task: Backend Repository Migration to Files-as-Root (asset.repository + generationDraft.repository + blocked test seeds)
**Subtask:** Subtask 4 — Fix seed + cleanup + undefined-bind-param bug in `generation-drafts-cards-endpoint.test.ts`

**What was done:**
- Replaced the 5-asset seed loop that inserted into the dropped `project_assets_current` with the Files-as-Root pattern: `INSERT INTO files` (with `kind` derived via `mimeToKind()` helper from the MIME type) followed by `INSERT INTO project_files` pivot for each of the 5 test files.
- Added `mimeToKind()` helper that mirrors the ingest worker mapping (`video/*` → `'video'`, `audio/*` → `'audio'`, `image/*` → `'image'`, else `'other'`).
- Renamed `seededAssetIds` → `seededFileIds` throughout to match the Files-as-Root naming convention.
- Rewrote `afterAll` cleanup in correct FK order: `generation_drafts` → `project_files` → `files` → `projects` → `sessions` → `users`.
- Fixed the undefined-bind-param risk: all array-dependent `DELETE` queries are guarded with `if (seededFileIds.length)` checks and `if (DRAFT_A_MANY_REFS || DRAFT_B_ID)` for the draft IDs. Variables for draft IDs and `TEST_PROJECT_ID` are additionally guarded with existence checks before use in afterAll.
- Relaxed the `thumbnailUrl` assertion in the "correct shape" test from any non-null expectation to `expect(preview.thumbnailUrl).toBeNull()` with an inline comment: "thumbnailUrl is null until the ingest worker backfills it on the files table — Files-as-Root thumbnail backfill pending."
- Removed `project_assets_current` from the file comment block (zero references remain).
- All 12 tests pass locally via `APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/generation-drafts-cards-endpoint.test.ts`.

**Notes:**
- The "dangling ref silently skipped" behavior is preserved: `deletedFileId` is intentionally never inserted into `files`; `findAssetPreviewsByIds` (querying `files`) silently omits it.
- `thumbnailUrl` is always `null` in `mediaPreviews` — `files` has no `thumbnail_uri` column yet. Tests assert `null` accordingly with the backfill-pending comment pattern.
- The "at most 3 mediaPreviews" test confirms the 3-cap is enforced even with 5 valid files + 1 dangling ref (6 total refs).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Subtask 4 — Fix seed + cleanup + undefined-bind-param bug in `generation-drafts-cards-endpoint.test.ts`</summary>

- What: (a) Rewrite the 5-asset seed loop to insert into `files` + `project_files`. (b) Rewrite afterAll cleanup in correct FK order. (c) Fix the `undefined` bind-param error — guard array-dependent queries and module-level `let` variables before use in afterAll.
- Where: `apps/api/src/__tests__/integration/generation-drafts-cards-endpoint.test.ts`.
- Acceptance criteria: 0 `project_assets_current` matches; 5-file seed uses `files + project_files`; afterAll runs without undefined bind-param error; all 12 tests pass; `thumbnailUrl` assertions accept null.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — Backend integration test-only (generation-drafts-cards-endpoint.test.ts + generation-drafts-cards-shape.test.ts: database seed migration + assertions, 12/12 tests pass). Files-as-Root pattern verified via integration tests against live MySQL. No UI/routes/components changed; E2E not applicable.

design-reviewer notes: Reviewed on 2026-04-19. Subtask 4 is test-only (generation-drafts-cards-endpoint.test.ts: database seed migration + assertions). No UI components, design tokens, colors, typography, spacing, or visual changes. Approved per test-only exemption pattern — backend integration test fixtures require no design review.

<!-- QA NOTES (auto-generated):
  - Unit/integration tests: ✅ 12/12 PASS (generation-drafts-cards-endpoint.test.ts: Files-as-Root seed + cleanup pattern verified)
  - Regression gate: ✅ CLEAR (full API suite: 886 pass / 7 pre-existing failures; no new regressions from this subtask)
  - Coverage: Seed migration complete (5 files → files + project_files pivot, FK order cleanup, existence guards), auth chain exercised (401 + valid Bearer token), response shape verified (draftId, status, textPreview truncated to 140 chars, mediaPreviews capped at 3, thumbnailUrl null per Files-as-Root), dangling asset ref silently omitted per spec, ownership isolation verified (User B draft not returned to User A), route precedence verified (/cards not swallowed by /:id param route).
-->

**Fix round 2:** Split 423-line test file into two files to comply with architecture-rules.md §9 300-line cap (same pattern as Batch-2 Subtask 1 migrate.unit/production split). `generation-drafts-cards-endpoint.test.ts` (293 lines, 7 tests: auth×2 + empty-user + User-A presence + ownership isolation + route precedence + status field). `generation-drafts-cards-shape.test.ts` (268 lines, 5 tests: truncation + 3-cap + shape + dangling-ref + DB state). Both files carry independent `vi.mock()` + `vi.hoisted()` equivalents (env setup, mocks, beforeAll/afterAll) per Vitest constraint that hoisted blocks cannot be shared across files. Total: 12 tests preserved, all helpers (sha256, makePromptDoc, mimeToKind) duplicated in each file. TypeScript compilation clean (no errors).

QA Verification (2026-04-19): ✓ Both files pass independently in full suite (`npm run test`):
- generation-drafts-cards-endpoint.test.ts: 7/7 PASS (86ms)
- generation-drafts-cards-shape.test.ts: 5/5 PASS (68ms)
Regression gate: ✓ CLEAR (suite 886 pass / 7 pre-existing unrelated failures)

**Fix round 3:** Renamed both split test files to dot-infix convention per architecture-rules.md §9 (`generation-drafts-cards.endpoint.test.ts`, `generation-drafts-cards.shape.test.ts`). Extracted shared helpers (`sha256`, `makePromptDoc`, `mimeToKind`) to co-located `generation-drafts-cards.fixtures.ts` and replaced inline definitions in both test files with an import. `vi.mock()` + env-setup blocks remain duplicated per Vitest hoisting constraint (documented exception). Final line counts: endpoint 273L, shape 248L, fixtures 26L. TypeScript compilation clean. 12/12 tests pass against live Docker Compose stack (endpoint 7/7, shape 5/5).

---

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred
- `files` table lacks `thumbnail_uri`/`waveform_json`; `getProjectFilesResponse` returns null (FE handles); `projects-list-endpoint.test.ts` thumbnail assertion is `toBeNull()`
- `duration_ms` NULL for migrated files (source lacked fps); ingest reprocess repopulates
- `MediaIngestJobPayload.fileId?` + `assetId?` dual-key during migration window; legacy AI worker still writes via `project_assets_current` path
- `bytes` NULL after ingest (FFprobe doesn't return S3 object size; HeadObject needs worker bucket config)
- Seed `project_assets_current` rows with non-UUID project_id migrated to files; pivot links skipped (INSERT IGNORE)
- `packages/api-contracts/` OpenAPI spec only covers scoped endpoints
- Presigned download URL deferred; S3 CORS needs bucket config
- Integration tests carry beforeAll schema self-healing (`migrate`/`migration-014`/`schema-final-state`) — acceptable but distributed; candidate for consolidation into a centralized fixture layer
- Production stream endpoint needs signed URL tokens
- OAuth client IDs/secrets default empty
- Lint workspace-wide fails with ESLint v9 config-migration error
- Pre-existing TS errors in unrelated test files
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile variants, secondary screens, spacing/typography echo)
- Sidebar nav: no top-level nav; wizard "Generate" highlight deferred
- `DEV_PROJECT` fixture in `project-store.ts` — candidate for removal
- TopBar buttons `borderRadius: 6px` off-token (pre-existing)
- Chip × button needs semi-transparent background token
- `parseStorageUri` duplicated between `asset.service.ts` + `file.service.ts` — candidate to move to `lib/storage-uri.ts`
- Media-worker (`ai-generate.job.ts`) still writes to `project_assets_current`; must migrate to call `aiGenerationJob.repository.setOutputFile` so the draft-files completion hook fires from live worker
- Editor 404s on thumbnail/waveform + wizard 500 on fresh-draft `/generation-drafts/:id/assets` (empty) — cosmetic, pre-existing
- AI panel query-key rescoping: `AiGenerationPanel` invalidates `[assets, context.kind, context.id]`; wizard gallery uses `[generate-wizard, assets, type]` — unified invalidation could be revisited
- **Class A (7 tests, 7 files — pre-existing DEV_AUTH_BYPASS user-mismatch):** `renders-endpoint.test.ts` (GET /renders/:jobId uses `user-render-test` JWT but bypass injects `dev-user-001`), `versions-list-restore-endpoint.test.ts` (createdByUserId = `dev-user-001` not `user-test-001`). Root cause: `auth.middleware.ts` hard-codes `userId: 'dev-user-001'` when `APP_DEV_AUTH_BYPASS=true`.
- **Class C (5 tests, 5 files — stale seed/table debt, not in Batch-3 scope):** `assets-finalize-endpoint.test.ts`, `assets-list-endpoint.test.ts`, `assets-stream-endpoint.test.ts`, `assets-delete-endpoint.test.ts`, `assets-endpoints.test.ts` — beforeAll seeds still INSERT into dropped `project_assets_current` table; queued for a follow-up migration batch.
- `asset.repository.ts` retained as a thin compatibility adapter over `file.repository.ts` + `fileLinks.repository.ts` — candidate for collapse into direct service calls + file deletion (non-urgent; minimises blast radius for now)

---

## [2026-04-19]

### Task: Backend Repository Migration to Files-as-Root (asset.repository + generationDraft.repository + blocked test seeds)
**Subtask:** Subtask 5 — Full regression run + dev log reconciliation

**What was done:**
- Ran full `apps/api` vitest suite against live Docker Compose stack (`db` + `redis` healthy).
- Suite result: **886 pass | 7 fail | 4 skip** across 90 test files (82 pass, 7 fail, 1 skipped).
- Confirmed zero Class B failures (schema drift) — no `ER_NO_SUCH_TABLE` from repository source queries.
- Confirmed zero Class C failures for the three Batch-3-patched suites: `assets-patch-endpoint.test.ts` (9/9 pass), `generation-drafts-cards.endpoint.test.ts` (7/7 pass), `generation-drafts-cards.shape.test.ts` (5/5 pass). Total: 21/21 pass.
- Reconciled Subtask 6 count discrepancy: prior log claimed 834 pass; actual at report time was 822 (12-test delta = the then-blocked `generation-drafts-cards` suite). Current baseline is 886 (gains from Batch-3 Subtasks 1-4 + fix rounds).
- Ran verification grep; classified all remaining matches as comments/migration-test historical references (no live SQL queries in repository source files against `project_assets_current`).
- Updated Known Issues: removed the "6 pre-existing non-Class-A" catch-all and replaced with precise Class A + Class C breakdowns. Closed the "generation-drafts-cards bind param" issue (fixed in Subtask 4). Kept all still-open items.

**Remaining failures classified:**

Class A — DEV_AUTH_BYPASS user-mismatch (pre-existing, 2 files, 2 tests):
- `versions-list-restore-endpoint.test.ts`: test expects `createdByUserId = 'user-test-001'` but auth bypass injects `dev-user-001`
- `renders-endpoint.test.ts`: GET /renders/:jobId created with `user-render-test` sub, bypassed as `dev-user-001` → 404

Class C — stale `project_assets_current` seed debt (pre-existing, 5 files, 5 tests):
- `assets-finalize-endpoint.test.ts`: beforeAll INSERT → `ER_NO_SUCH_TABLE` → all 4 tests blocked
- `assets-list-endpoint.test.ts`: same beforeAll INSERT pattern → suite-level failure
- `assets-stream-endpoint.test.ts`: same pattern
- `assets-delete-endpoint.test.ts`: beforeAll silently drops seed; 3 tests return 404 instead of expected 2xx/409
- `assets-endpoints.test.ts`: same stale seed pattern

Class B — schema drift: **zero failures** (target achieved).

**Verification grep:**
Running `grep -r "project_assets_current" apps/api/src/ --include="*.ts"` returns matches only in:
- Comment/migration-note lines inside repository source files (no live SQL)
- Migration-history test files (`migration-001.test.ts`, `migration-017.test.ts`, `migration-014.test.ts`) — legitimately reference the dropped table
- `schema-final-state.integration.test.ts` — DROP TABLE IF EXISTS guard + existence assertion (correct: confirms table is absent)
- Stale seed legacy test files listed under Class C above

Zero matches in `apps/api/src/repositories/*.ts` as live SQL queries (only comment lines).

**Repository files changed in Batch-3 (summary for this log entry):**
- `apps/api/src/repositories/asset.repository.ts` — full rewrite to `files + project_files` (Subtask 1)
- `apps/api/src/repositories/generationDraft.repository.ts` — `findAssetPreviewsByIds` rewritten (Subtask 2)
- `apps/api/src/__tests__/integration/assets-patch-endpoint.test.ts` — seed migrated to Files-as-Root pattern (Subtask 3)
- `apps/api/src/__tests__/integration/generation-drafts-cards.endpoint.test.ts` — seed + assertions migrated (Subtask 4)
- `apps/api/src/__tests__/integration/generation-drafts-cards.shape.test.ts` — seed + assertions migrated (Subtask 4)
- `apps/api/src/__tests__/integration/generation-drafts-cards.fixtures.ts` — shared fixtures extracted (Subtask 4 fix round)
- `apps/api/src/__tests__/integration/asset-repository.integration.test.ts` — new integration test (Subtask 1)

**Notes:**
- The Subtask 6 count discrepancy (claimed 834, actual 822) is now fully reconciled: the 12-test delta was the `generation-drafts-cards` suite that was blocked at the time of the Batch-2 run and only fixed in Batch-3 Subtask 4. Current authoritative baseline is 886 pass.
- No code was changed in this subtask — report-only pass as designed.
- All 5 Class C failures are queued for a follow-up migration batch (same pattern as this batch's Subtasks 3-4 but for the remaining 5 test files).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Subtask 5 — Full regression run + dev log reconciliation</summary>

- What: Run the full apps/api test suite via Docker Compose (`db` + `redis` healthy). Categorize failures into the three-class taxonomy (Class A = DEV_AUTH_BYPASS user-mismatch pre-existing; Class B = schema drift (should now be zero); Class C = stale seed/table debt (should now be zero for the two patched suites)). Reconcile the dev-log's Subtask 6 count discrepancy flagged by the guardian (claimed 834 pass; actual 822 at the time of the report). Append a concise entry summarising the repository migration + updated pass/fail counts.
- Result: 886 pass / 7 fail / 4 skip. Zero Class B. Zero Class C for patched suites. 2 Class A + 5 Class C pre-existing failures documented.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: APPROVED — Docs-only reconciliation (development_logs.md entries + Known Issues section updated). No UI/routes/code changed. E2E testing not applicable.

design-reviewer notes: Reviewed on 2026-04-19. Subtask 5 is documentation + regression reconciliation only (backend test suite report). Zero UI/component/styling changes. No design review required per backend-only convention.

qa-reviewer notes: Verified 2026-04-19. Ran full `apps/api` vitest suite against live Docker Compose (`db` + `redis`). Confirmed: 886 pass | 7 fail | 4 skip (Test Files: 82 pass | 7 fail | 1 skip). Three Batch-3-patched suites all passing (21/21: assets-patch-endpoint 9/9, generation-drafts-cards.endpoint 7/7, generation-drafts-cards.shape 5/5). All 7 failures verified as pre-existing: 2 Class A (DEV_AUTH_BYPASS user-mismatch in versions-list-restore + renders endpoints) + 5 Class C (stale `project_assets_current` seed in assets-finalize, assets-list, assets-stream, assets-delete, assets-endpoints). Zero Class B (schema drift). Zero new regressions introduced by Batch 3.
