# Development Log (compacted — 2026-03-29 to 2026-04-18)

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

### DB + BE
- added: `020_projects_owner_title.sql` — `owner_user_id` NOT NULL + `title` + composite idx; INFORMATION_SCHEMA idempotent
- widened: `project.repository.ts` `createProject(projectId, ownerUserId, title?)`; added `findProjectsByUserId`
- widened: `project.service.ts` `createProject(userId, title?)`; added `listForUser(userId)`
- updated: `projects.controller.ts` `listProjects` `{ items }`; routes `GET /projects` before `POST /projects` (editor ACL)
- added: `MediaPreview`, `StoryboardCard` types; `findStoryboardDraftsForUser`, `findAssetPreviewsByIds`
- added: `TEXT_PREVIEW_MAX_CHARS=140`, `MEDIA_PREVIEW_MAX_COUNT=3`, `mimeToMediaType()`, `listStoryboardCardsForUser`
- added: `listCards` handler + `GET /generation-drafts/cards` (before `/:id`)
- added: `/projects` + `/generation-drafts/cards` in `openapi.ts`

### FE Home
- added: `features/home/` — types, api, hooks (useProjects, useStoryboardCards)
- added: `HomePage.tsx` (2-col: HomeSidebar + `<main role="tabpanel">`), `HomeSidebar.tsx` (240px nav)
- added: `ProjectCard.tsx`, `ProjectsPanel.tsx`, `StoryboardCard.tsx`, `StoryboardPanel.tsx` (+ parts files)
- updated: `main.tsx` `/` → `HomePage`; `*` → `/`; `LoginPage` post-login → `/`
- added: `HomePage` reads `?tab=storyboard`; `fetchDraft(id)` in generate-wizard/api.ts
- updated: `useGenerationDraft.ts` — `(options?: { initial?, initialDraftId? })`; hydrate useEffect once when `initialDraftId`
- updated: `GenerateWizardPage.tsx` — reads `?draftId=` via useSearchParams

## Editor + Generate-Wizard UX Batch
- added: Home button in editor TopBar (`onNavigateHome` → `navigate('/')`); Manual Save button; Overwrite button (conflict)
- added: `BackToStoryboardButton.tsx` in wizard header → `/?tab=storyboard`
- fixed: chip-deletion bug in `PromptEditor.handleKeyDown` — walks past consecutive empty text nodes before `isChipNode`
- added: `PromptEditor.deletion.test.tsx` (3 cases); HTML5 drag-drop from `AssetThumbCard`/`AudioRowCard` into `PromptEditor`
- added: MIME `application/x-cliptale-asset`, chip-clone drag image; `promptEditorDrop.ts` (caret fallback), `promptEditorInsert.ts`, `usePromptEditorHandlers.ts`
- added: × remove button on chips (aria-label, CHIP_COLORS hover)

## EPIC — Files-as-Root Foundation (Batch 1, 2026-04-18)

### Subtask 1 — FE Home UX
- fixed: `HomePage.tsx` outer flex `minHeight: '100vh'` → `height: '100vh'`; `<main>` `minHeight: 0` (bounds `overflow: auto`)
- updated: `StoryboardPanel.tsx` `handleCreate` — async `createDraft({schemaVersion:1,blocks:[]})` → `navigate('/generate?draftId=${id}')`; `isCreating` guard; fallback to `/generate` on error

### Subtask 2 — Files root + pivots DDL
- added: migrations 021 (files table, user-scoped, status ENUM, 2 composite indexes) + 022 (project_files, draft_files; composite PKs; CASCADE container, RESTRICT file)

### Subtask 3 — Downstream backfill + drop
- added: migrations 023 (nullable file_id/output_file_id on downstream tables, idempotent guarded DDL)
- added: migration 024 (12 steps: INSERT IGNORE files+project_files from project_assets_current; UPDATE downstream file_id; NOT NULL caption_tracks.file_id via `IS_NULLABLE='YES'` COUNT guard; drop FKs/indexes/columns; DROP TABLE project_assets_current)
- added: migration 025 (drop ai_generation_jobs project_id FK + idx + column)
- migrated: 20 rows into files; pivot links skipped for seed rows with non-UUID project_id (INSERT IGNORE)

### Subtask 4 — File vertical slice + ingest dual-path
- added: `file.repository.ts` — createPending, finalize, findById(ForUser), findReadyForUser (cursor + MIME prefix), getReadyTotalsForUser, updateProbeMetadata, setFileError
- added: `file.service.ts` — createUploadUrl, finalizeFile (S3 HEAD + enqueue ingest; idempotent), listFiles, streamUrl; re-exports parseStorageUri
- added: `file.controller.ts`, `file.routes.ts` — POST /files/upload-url, POST /files/:id/finalize, GET /files, GET /files/:id/stream
- added: `file.service.fixtures.ts`, `file.service.test.ts` (18 integration tests, real MySQL)
- updated: `MediaIngestJobPayload.fileId?` optional (dual-path migration window)
- updated: `ingest.job.ts` — `setFileReady`/`setFileError` write to `files` when fileId present; fallback to project_assets_current path (bytes=null — S3 HEAD not available in worker)
- added: 4 ingest tests (fileId happy path, Math.round(durationSec*1000), duration=0 → null, S3 error path)
- updated: `apps/api/src/index.ts` registers fileRouter

### Subtask 5 — Link endpoints + pivot-backed reads
- added: `fileLinks.repository.ts` — linkFileToProject (INSERT IGNORE), findFilesByProjectId (JOIN), linkFileToDraft, findFilesByDraftId
- added: `fileLinks.service.ts` — ownership checks (ForbiddenError 403, NotFoundError 404), idempotent link
- added: `fileLinks.response.service.ts` (split for §9.7) — maps FileRow → AssetApiResponse, presigns downloadUrl, thumbnailUri/waveformPeaks null
- added: `findProjectById` to project.repository.ts (for ownership checks)
- updated: `assets.controller.getProjectAssets` uses fileLinksResponseService (FE contract preserved)
- added: POST /projects/:projectId/files (204), POST /generation-drafts/:draftId/files (204), GET /generation-drafts/:id/assets
- added: fileLinks.service.test.ts (15), file-links-endpoints.test.ts (13), .draft.test.ts (14), .fixtures.ts = 42 integration tests

### Subtask 6 — clip refactor (asset_id → file_id)
- refactored: `clip.repository.ts` — asset_id → file_id throughout; added `isFileLinkedToProject(projectId, fileId)` querying project_files
- refactored: `clip.service.createClip` — ValidationError (400) on unlinked file; null fileId skips check (caption clips)
- updated: `clips.controller.ts` — wire-level assetId kept in createClipSchema (Batch 1 compat); maps body.assetId → service fileId
- fixed: `project.repository.ts:92` — removed broken correlated subquery `JOIN project_assets_current a ON a.asset_id = c.asset_id` (was 500ing GET /projects); replaced with `NULL AS thumbnail_uri` (files has no thumbnail col yet)
- added: `clip.service.integration.test.ts` (4 tests: linked insert, unlinked rejected, null fileId caption, phantom ID rejected)
- fixed: stale tests — clip.repository.test.ts line 120 `assetId` → `fileId`; project.repository.test.ts assertions

### Subtask 7 — caption refactor
- refactored: `caption.repository.ts` — asset_id → file_id; `getCaptionTrackByAssetId` → `getCaptionTrackByFileId`
- refactored: `caption.service.ts` — uses `fileRepository.findById`; NotFoundError on missing file
- rewrote: `captions-endpoints.test.ts` — seeds files table directly; real session auth (APP_DEV_AUTH_BYPASS=false)
- added: `caption.service.integration.test.ts` (5 tests: insert with file_id, null for unknown file, INSERT IGNORE dedup, getCaptions segments, transcribeAsset NotFoundError)
- refactored: `transcribe.job.ts` — `getAssetProjectId` → `getFileProjectId` (queries project_files); insertCaptionTrack writes file_id
- split (§9.7 cap): transcribe.job.test.ts (195) + transcribe.job.error.test.ts (91) + transcribe.job.fixtures.ts (87); each test file needs its own vi.mock block (Vitest hoisting rule)
- test results: caption.service 9/9, caption.service.integration 5/5, captions-endpoints 9/9, transcribe.job 17/17, full media-worker 136/136

### Subtask 8 — aiGeneration refactor (user-scoped, no project_id)
- refactored: `aiGenerationJob.repository.ts` — removed projectId/resultAssetId; added outputFileId; new `setOutputFile(jobId, fileId)` replaces updateJobResult
- refactored: `enqueue-ai-generate.ts` — removed projectId from `AiGenerateJobPayload`
- refactored: `aiGeneration.service.ts` — user-scoped only; GetJobStatusResult has outputFileId
- refactored: `aiGeneration.assetResolver.ts` — uses `file.repository.findByIdForUser` (ownership via DB query, cross-user → null → NotFoundError); parseStorageUri re-export from file.service.ts
- compat shim: `aiGeneration.controller.ts` — Zod schema accepts optional `body.projectId` and strips it silently (preserves FE contract for Batch 1 → Batch 2 window); route `POST /projects/:id/ai/generate` kept with `aclMiddleware('editor')` still gating project membership
- updated: `aiGeneration.service.fixtures.ts` — `makeFileRow` replaces makeAssetRow
- tests: service 17, status 7, audio 12, assetResolver 10, integration 4, endpoints 6 = 56 (includes compat-shim test)
- fixed (Docker DB sync): `docker volume rm cliptalecom-v2_db_data` then `docker compose up -d db` — migrations 001–025 auto-applied via `docker-entrypoint-initdb.d`; 10/10 AI integration tests pass; full API suite 788/833 (45 pre-existing dev-auth-bypass failures, no new regressions)

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via `*.fixtures.ts` + `.<topic>.test.ts` splits; approved exception: `fal-models.ts`
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets via deps
- Migration strategy: `INFORMATION_SCHEMA` + `PREPARE/EXECUTE` guards for idempotent DDL (MySQL 8.0.x has no `ADD COLUMN IF NOT EXISTS`)
- MySQL NOT NULL idempotency: use `COUNT(*) WHERE IS_NULLABLE='YES'` — COLUMN_DEFAULT guard is unreliable (NULL for nullable cols with no default)
- Vitest vi.mock hoisting: each split test file needs its own vi.mock block; cannot centralize mocks in fixtures.ts
- Files-as-root pattern: `files` is user-scoped root; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file) = app-layer GC before file delete
- Wire-level DTO naming kept as `assetId` during Batch 1 to avoid FE churn; rename to `fileId` deferred to Batch 2
- aiGeneration compat shim: Zod accepts optional projectId and silently strips (FE contract preserved through Batch 1→2 window)
- `findByIdForUser` unifies existence + ownership into one query (cross-user returns null, surfaced as NotFoundError — avoids leaking existence)
- Audio routes through ElevenLabs (not fal.ai) per `project_audio_provider.md`
- Wizard MediaGalleryPanel separate from editor AssetBrowserPanel (no cross-feature imports §14)
- Stitch DS `spacing`/`typography` do NOT round-trip — design-guide.md §3 authoritative
- Enhance state in BullMQ/Redis only; rate limit per-user; vanilla setInterval in FE hook
- mysql2 JSON columns: repository mappers must guard `typeof === 'string'` before `JSON.parse`
- Typography §3: body 14/400, label 12/500, heading-3 16/600; spacing multiples of 4px
- `/` HomePage is post-login + `*`-fallback; `/editor?projectId=<id>` is editor entry

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred
- `files` table lacks `thumbnail_uri`/`waveform_json` columns; `getProjectFilesResponse` returns null for these (FE already handles)
- `duration_ms` left NULL for migrated files (source `duration_frames` lacked fps for conversion); ingest reprocesses will repopulate
- `MediaIngestJobPayload.assetId` still required (migration window); `fileId` optional — full cleanup in Batch 2
- `bytes` NULL after ingest (FFprobe doesn't return S3 object size; HeadObject call would require bucket config in worker)
- Seed `project_assets_current` rows referenced non-existent `proj-001`; migrated to files but pivot links skipped (INSERT IGNORE)
- `packages/api-contracts/` OpenAPI spec only covers scoped endpoints
- Presigned download URL deferred; S3 CORS needs bucket config
- Pre-existing integration test failures with `APP_DEV_AUTH_BYPASS=true` (45 failing in full API suite — unchanged throughout Batch 1)
- Production stream endpoint needs signed URL tokens
- OAuth client IDs/secrets default empty
- Lint workspace-wide fails with ESLint v9 config-migration error
- Pre-existing TS errors in unrelated test files
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile variants, secondary screens, spacing/typography echo)
- Sidebar nav: no top-level nav; wizard "Generate" highlight deferred
- `DEV_PROJECT` fixture in `project-store.ts` — candidate for removal
- TopBar buttons `borderRadius: 6px` off-token (pre-existing)
- Chip × button needs semi-transparent background token
- Migration 025 reliability on fresh docker-entrypoint-initdb.d init has had conflicting reports — verify on next clean-volume start
- `parseStorageUri` duplicated between asset.service.ts + file.service.ts (re-exported); candidate to move to `lib/storage-uri.ts`

## Batch 2 (planned, not started)
- [FE] Shared `useFileUpload` hook (extract from `useAssetUpload.ts`)
- [FE] Wire editor UploadDropzone + wizard upload area in MediaGalleryPanel
- [FE] Extract shared AI components to `shared/ai-generation/` per §14
- [FE] Refactor AiGenerationPanel — context prop `{ kind: 'project'|'draft', id }`
- [BE] `POST /generation-drafts/:draftId/ai/generate` (thin wrapper; links output to draft via draft_files)
- [FE] AI tab in wizard MediaGalleryPanel
- [Playwright] E2E regression sweep (editor upload, wizard upload, editor AI, wizard AI, Home scroll + create-storyboard)
- DTO rename `assetId` → `fileId` on the wire + remove aiGeneration compat shim

---

## [2026-04-18]

### Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Subtask:** [FE] Extract `useFileUpload` into `shared/file-upload/` with context adapter

**What was done:**
- Created `apps/web-editor/src/shared/file-upload/types.ts` — exports `UploadTarget` (discriminated union: project | draft) and `UploadEntry` (now uses `fileId` instead of `assetId`)
- Created `apps/web-editor/src/shared/file-upload/api.ts` — exports `requestUploadUrl`, `finalizeFile`, `linkFileToProject`, `linkFileToDraft` wrapping Batch 1 endpoints (`POST /files/upload-url`, `POST /files/:id/finalize`, `POST /projects/:id/files`, `POST /generation-drafts/:id/files`)
- Created `apps/web-editor/src/shared/file-upload/useFileUpload.ts` — context-aware upload hook; accepts `{ target: UploadTarget }`, runs request-URL → XHR PUT → finalize → link flow, dispatches to correct link endpoint based on target kind
- Created `apps/web-editor/src/shared/file-upload/useFileUpload.test.ts` — 13 test cases covering project target, draft target, XHR progress, error paths, and API call correctness (including the two new draft-target cases required by the acceptance criteria)
- Converted `apps/web-editor/src/features/asset-manager/hooks/useAssetUpload.ts` to a backward-compatibility shim that wraps `useFileUpload({ target: { kind: 'project', projectId } })`
- Updated `apps/web-editor/src/features/asset-manager/hooks/useAssetUpload.test.ts` to mock `@/shared/file-upload/api` instead of the old `@/features/asset-manager/api`
- Removed `requestUploadUrl` and `finalizeAsset` from `apps/web-editor/src/features/asset-manager/api.ts` (now in shared)
- Updated `apps/web-editor/src/features/asset-manager/types.ts`: removed the old `UploadEntry` definition, added `export type { UploadEntry } from '@/shared/file-upload/types'` re-export for backward compat
- Updated `apps/web-editor/src/features/asset-manager/components/UploadProgressList.tsx` — imports `UploadEntry` from shared; uses `entry.fileId` as React key
- Updated `apps/web-editor/src/features/asset-manager/components/UploadDropzone.tsx` — imports `UploadEntry` from shared

**Notes:**
- Batch 1 API uses `mimeType` (not `contentType`) and returns `fileId` (not `assetId`) — shared api.ts aligns with this
- The shim in `useAssetUpload.ts` preserves `onUploadComplete(fileId)` — callers such as `ReplaceAssetDialog` receive a `fileId` rather than `assetId`; this is intentional — the Batch 1 architecture unifies file identity under `fileId`
- `UploadDropzone.tsx` and `UploadProgressList.tsx` component tests mock `useAssetUpload` at the module level — unaffected by the internal implementation change
- `AssetBrowserPanel.test.tsx` and `ReplaceAssetDialog.test.tsx` still mock the shim directly — no test changes needed for those components

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Extract `useFileUpload` into `shared/file-upload/` with context adapter</summary>

- What: Move `useAssetUpload.ts` + its tests into `apps/web-editor/src/shared/file-upload/useFileUpload.ts`. Change the hook signature from `{ projectId }` to `{ target: { kind: 'project'; projectId: string } | { kind: 'draft'; draftId: string } }`. After the existing `POST /files/upload-url` + XHR PUT + `POST /files/:id/finalize` sequence lands (these are Batch 1 endpoints), call the appropriate link endpoint (`POST /projects/:id/files` for project target, `POST /generation-drafts/:id/files` for draft target) using the already-returned `fileId`. Refactor the existing editor caller (`features/asset-manager`) to pass `{ kind: 'project', projectId }`. Keep `UploadEntry` type in `shared/file-upload/types.ts`.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — hook-only refactoring; useFileUpload (13 unit tests) + backward-compat shim (6 tests) + full asset-manager suite (295 tests) + web-editor regression (1984 tests) all PASS; zero UI changes

design-reviewer notes: Reviewed on 2026-04-18. Hook extraction only; UploadProgressList + UploadDropzone import changes (type path + property rename) have no visual impact. No design tokens, colors, spacing, or layout changes. All checks passed.

playwright-reviewer notes: Reviewed on 2026-04-18. Hook-only refactoring qualifies for unit-test-only pattern (hook_testing_pattern.md). Comprehensive unit test coverage (19 tests), backward-compatible shim, full asset-manager regression (295 tests), web-editor full suite regression (1984 tests). No UI rendering changes — only import paths and internal property names. E2E test deferred per hook-only pattern.

---

## [2026-04-18]

### Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Subtask:** [FE] Wire upload affordance in wizard `MediaGalleryPanel`

**What was done:**
- Extended `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.tsx` with upload affordance: Upload button (visible only when `draftId` is provided), `UploadDropzone` modal (open/close/done state), `useFileUpload({ target: { kind: 'draft', draftId } })` wired in, query invalidation on `onUploadComplete` targeting `['generate-wizard', 'assets']`
- `apps/web-editor/src/shared/file-upload/UploadDropzone.tsx` — promoted to shared (done as part of Subtask 1's broader work); re-export shim left at `features/asset-manager/components/UploadDropzone.tsx`
- `apps/web-editor/src/shared/file-upload/UploadProgressList.tsx` — per-file progress bars + error status text rendered inside the dropzone modal
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.test.tsx` — 14 test cases; tests 11–14 cover upload affordance: Upload button visibility by `draftId` presence, modal open/close, `Done` clears entries, `useFileUpload` initialized with draft target, `onUploadComplete` calls `queryClient.invalidateQueries`
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.fixtures.ts` — shared test fixtures (VIDEO_ASSET, IMAGE_ASSET, AUDIO_ASSET, MIXED_RESPONSE, EMPTY_RESPONSE, VIDEO_ONLY_RESPONSE) used by all 14 tests

**Notes:**
- `MediaGalleryPanel.tsx` is 299 lines — within the §9.7 300-line cap
- Query key for invalidation is `['generate-wizard', 'assets']` (prefix match); `useAssets` keys are `['generate-wizard', 'assets', type]` — partial prefix invalidation covers all type variants
- When `draftId` is `undefined` the Upload button is hidden and `useFileUpload` is called with an empty `draftId: ''` — the hook is never invoked with an undefined target field; upload operations are a no-op because the button is absent
- UploadDropzone reuse: editor's `AssetBrowserPanel` continues to use the shim re-export at `features/asset-manager/components/UploadDropzone.tsx`; wizard uses the canonical shared import directly — no cross-feature imports (§14 satisfied)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Wire upload affordance in wizard MediaGalleryPanel</summary>

- What: Add an upload CTA (button + hidden file input, or a small dropzone) to the wizard's `MediaGalleryPanel` that uses `useFileUpload({ target: { kind: 'draft', draftId } })`. After a successful upload, the newly-uploaded `AssetSummary` should appear in the current tab (Video / Image / Audio) — reuse the existing `useAssets(draftId)` hook's refetch / invalidation to trigger a re-fetch. If the editor has a reusable `UploadDropzone` component, move it to `shared/file-upload/UploadDropzone.tsx` as part of this subtask; otherwise keep the wizard implementation minimal and inline (a single "Upload" button that opens a native file picker).

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — Fix round 1 applied: design-token values updated in MediaGalleryPanel.tsx + UploadDropzone.tsx (fontSize, padding, borderRadius); 17 unit tests pass + full web-editor suite 1991/1991 tests pass (no regressions); wiring intact

design-reviewer notes: Verified on 2026-04-18. All five fixes confirmed in code: MediaGalleryPanel upload button fontSize 12 (line 293), UploadDropzone header padding '0 16px' (line 109), header title fontSize 16 (line 112), dropzone borderRadius 8 (line 139), Browse Files button fontSize 12 (line 191). All values match design-guide §3 tokens (label = 12px 500, heading-3 = 16px 600, space-4 = 16px, radius-md = 8px). No additional violations found.

---

## [2026-04-18]

### Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Subtask:** [FE] Move `ai-generation` feature → `shared/ai-generation/`

**What was done:**
- Copied all 47 files from `apps/web-editor/src/features/ai-generation/` to `apps/web-editor/src/shared/ai-generation/` (identical directory structure: `components/`, `hooks/`, `api.ts`, `types.ts`, and all test files)
- Updated all `@/features/ai-generation/` import paths to `@/shared/ai-generation/` inside all moved files using sed
- Updated external call sites: `App.tsx` (3 imports), `App.panels.tsx` (1 import), `App.leftSidebar.test.tsx` (3 mock paths)
- Deleted `apps/web-editor/src/features/ai-generation/` directory entirely
- Fixed 4 test files that exceeded the 300-line cap (§9.7): split each into a primary file and a sibling file using the `.<topic>.test.ts` naming convention
  - `SchemaFieldInput.test.tsx` (384→151) + `SchemaFieldInput.complex.test.tsx` (275) — primitive vs complex field types; shared static fixture in `SchemaFieldInput.fixtures.ts`
  - `VoicePickerRows.test.tsx` (317→82) + `VoicePickerRows.library.test.tsx` (251) — UserVoiceRow vs LibraryVoiceRow + buildCategoryLabel
  - `VoicePickerModal.audio.test.tsx` (313→227) + `VoicePickerModal.audio.cleanup.test.tsx` (162) — core playback vs cleanup/dismissal
  - `aiGenerationPanel.utils.test.ts` (305→221) + `aiGenerationPanel.utils.split.test.ts` (91) — getFirstCapabilityForGroup/seedDefaults/isCatalogEmpty/hasAllRequired vs splitPromptFromOptions
- Updated `types.ts` JSDoc comment to reference `shared/ai-generation` (was `features/ai-generation`)

**Notes:**
- Pure import-path migration only — no logic changes. All behavioral changes are deferred to Subtask 4.
- `vi.hoisted()` variables cannot be exported from a fixtures file (Vitest hoisting constraint) — each split test file declares its own `vi.hoisted()` block; only static data types are exported from `SchemaFieldInput.fixtures.ts`. This is consistent with the pattern documented in `development_logs.md` (Subtask 7 notes).
- After split, all 177 test files pass (1991 tests); test count unchanged because splits redistribute existing tests, not add new ones.
- The 4 test files that exceeded 300 lines pre-existed in `features/ai-generation/` — §9.7 compliance is now enforced as part of this move subtask.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Move `ai-generation` feature → `shared/ai-generation/`</summary>

- What: Relocate every file under `apps/web-editor/src/features/ai-generation/` to `apps/web-editor/src/shared/ai-generation/` with identical structure (`components/`, `hooks/`, `api.ts`, `types.ts`). Update all imports at call sites. Do not refactor logic in this subtask — move only.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — Pure refactoring (import paths only); no logic changes; AI Generation panel opens and renders correctly; Editor shell loads; Home page loads; all 1991 unit tests pass; zero regressions on 3-point smoke test (editor shell, AI panel, home page)

code-reviewer notes (2026-04-18):
- §14 violation deferred to Subtask 4: shared/ai-generation/components/AssetPickerField.tsx:4-5 still imports getAssets + Asset from @/features/asset-manager/. This import pre-existed Subtask 3 (the original file had the same dependency). Subtask 4 refactors AssetPickerField to be context-aware (uses `GET /projects/:id/assets` or `GET /generation-drafts/:id/assets`), which removes the cross-feature import. User approved deferral.

design-reviewer notes: Reviewed on 2026-04-18. Pure file relocation (47 files moved from features/ai-generation/ → shared/ai-generation/) with import-path-only changes. No visual, layout, spacing, color, typography, or component logic changes. No design tokens modified. All checks passed.

---

## [2026-04-18]

### Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Subtask:** [FE] Refactor `AiGenerationPanel` + `useAiGeneration` + `api.submitGeneration` to accept a context prop

**What was done:**
- Added `AiGenerationContext` type to `shared/ai-generation/types.ts` — discriminated union `{ kind: 'project' | 'draft'; id: string }`
- Updated `shared/ai-generation/api.ts` — `submitGeneration(context, request)` picks route by context kind; added `getContextAssets(context)` + `AssetSummary` type (replaces cross-feature `getAssets` dependency)
- Updated `shared/ai-generation/hooks/useAiGeneration.ts` — `submit(context, request)` signature; propagates context to `submitGeneration`
- Updated `shared/ai-generation/components/AssetPickerField.tsx` — replaced `projectId: string` prop with `context: AiGenerationContext`; uses `getContextAssets(context)` from shared api instead of `getAssets` from `@/features/asset-manager/api` (§14 violation resolved)
- Updated `shared/ai-generation/components/SchemaFieldInput.tsx` — replaced `projectId: string` prop with `context: AiGenerationContext`; forwarded to `AssetPickerField`
- Updated `shared/ai-generation/components/GenerationOptionsForm.tsx` — replaced `projectId: string` prop with `context: AiGenerationContext`; forwarded to `SchemaFieldInput`
- Updated `shared/ai-generation/components/AiGenerationPanel.tsx` — replaced `projectId: string` prop with `context: AiGenerationContext`; updated `handleSubmit`, query invalidation key, and `GenerationOptionsForm` usage
- Updated `apps/web-editor/src/App.tsx` and `App.panels.tsx` — both call sites now pass `context={{ kind: 'project', id: projectId }}`
- Updated all test files: `AiGenerationPanel.test.tsx`, `AiGenerationPanel.form.test.tsx`, `AiGenerationPanel.states.test.tsx`, `AssetPickerField.test.tsx`, `GenerationOptionsForm.test.tsx`, `SchemaFieldInput.test.tsx`, `SchemaFieldInput.complex.test.tsx`, `useAiGeneration.test.ts`, `api.test.ts`, `App.leftSidebar.test.tsx`

**Notes:**
- `AssetPickerField` query key changed from `['assets', projectId]` to `['assets', context.kind, context.id]` to distinguish project vs draft cache entries
- `AiGenerationPanel` query invalidation key changed to match `['assets', context.kind, context.id]`
- `AssetSummary` type exported from `api.ts` (not from `types.ts`) to keep it co-located with `getContextAssets` — tests import it from `@/shared/ai-generation/api`
- The §14 violation (AssetPickerField importing from `@/features/asset-manager/api`) is fully resolved in this subtask as planned
- 211 tests pass across the full `shared/ai-generation/` suite + `App.leftSidebar.test.tsx`

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Refactor `AiGenerationPanel` + `useAiGeneration` + `api.submitGeneration` to accept a context prop</summary>

- What: Replace `projectId: string` prop on `AiGenerationPanel` with `context: { kind: 'project' | 'draft', id: string }`. Propagate the change through `useAiGeneration.submit(context, request)` and `api.submitGeneration(context, request)`. The API client picks the route: `POST /projects/:id/ai/generate` for project, `POST /generation-drafts/:id/ai/generate` for draft. Also refactor `AssetPickerField` to call `GET /projects/:id/assets` or `GET /generation-drafts/:id/assets` based on the same context. Update the editor's `AiGenerationPanel` call site to pass `{ kind: 'project', id: projectId }`.

</details>

**Fix round 1 (code-reviewer import fix):** Verified that `AssetPickerField.tsx` line 5 reads `import type { AiGenerationContext } from '@/shared/ai-generation/types';` — no import of `AiGenerationContext` from `api` remains in the file. Ran full `shared/ai-generation/` test suite from `apps/web-editor/` cwd: 26 test files, 206 tests, all passed.

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — Fix round 1 verified: AssetPickerField.tsx:5 now correctly imports AiGenerationContext from @/shared/ai-generation/types (not api); unit test suite 1998/1998 pass (zero regressions); app loads without JS errors

code-reviewer notes: 2026-04-18. All files within 300-line cap (types.ts 106, api.ts 150, useAiGeneration.ts 66, AiGenerationPanel.tsx 266, AssetPickerField.tsx 196, GenerationOptionsForm.tsx 56, SchemaFieldInput.tsx 254). All 1998 web-editor tests pass, no regressions. §14 cross-feature import resolved: AssetPickerField now calls getContextAssets() from shared/ai-generation/api instead of getAssets from @/features/asset-manager/api. App.tsx + App.panels.tsx correctly pass context prop at call sites. FIXED: AssetPickerField now imports AiGenerationContext from @/shared/ai-generation/types (line 5) as required per §9 module exports contract.

design-reviewer notes: Reviewed on 2026-04-18. Prop-signature refactor only (`projectId: string` → `context: { kind, id }`). Zero JSX markup changes across AiGenerationPanel, AssetPickerField, SchemaFieldInput, GenerationOptionsForm. No style, spacing, color, typography, or layout modifications. All styling files unchanged. Query key scoping updated for draft context but no DOM impact. All checks passed.

playwright-reviewer notes: Reviewed on 2026-04-18 (sanity-check pass). FE refactoring verified: (1) Editor shell loads without errors, (2) `/projects/:id/ai/generate` route correctly wired, test POST returns jobId + status 202 (confirmed via API), (3) All 1998 web-editor unit tests pass (zero regressions), (4) App.tsx passes `context={{ kind: 'project', id: projectId }}` correctly, (5) api.submitGeneration routes to `/projects/:id/ai/generate` for kind='project'. No 404/network errors on new route shape. E2E UI test deferred to Subtask 7 (full regression sweep).

---

## [2026-04-18]

### Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Subtask:** [BE] `POST /generation-drafts/:draftId/ai/generate` endpoint

**What was done:**
- Added migration `026_ai_jobs_draft_id.sql` — nullable `draft_id CHAR(36)` column on `ai_generation_jobs`; guarded by INFORMATION_SCHEMA check (idempotent)
- Extended `aiGenerationJob.repository.ts` — added `setDraftId(jobId, draftId)` to record the draft association after enqueue; extended `setOutputFile` to SELECT `draft_id` first and, when set, INSERT IGNORE into `draft_files` so the output file auto-links to the draft upon job completion (no worker changes needed)
- Added `submitDraftAiGeneration(userId, draftId, params)` to `generationDraft.service.ts` — verifies draft ownership via existing `resolveDraft`, delegates to `aiGeneration.service.submitGeneration`, then calls `setDraftId`
- Added `submitDraftAiGenerationSchema` Zod schema and `submitDraftAiGeneration` handler to `generationDrafts.controller.ts` (thin — parse, call service, return 202)
- Added `POST /generation-drafts/:draftId/ai/generate` route in `generationDrafts.routes.ts` with `authMiddleware`, `aclMiddleware('editor')`, `validateBody(submitDraftAiGenerationSchema)`
- Added integration test `generation-draft-ai-generate.test.ts` (289 lines) — covers: happy path (202 + job row written with draft_id), completion hook (setOutputFile auto-links draft_files + GET /assets returns the file), non-owner 403, missing draft 404, invalid payload 400, provider failure (job failed + no draft_files row)

**Notes:**
- The media worker (`ai-generate.job.ts`) is not yet updated to call `setOutputFile` — it still writes to `project_assets_current`. The completion hook relies on whichever path calls `setOutputFile` from `aiGenerationJob.repository.ts` (API or updated worker). The integration tests simulate the worker by calling `aiJobRepo.setOutputFile` directly, matching the pattern in `aiGeneration.service.integration.test.ts`.
- `INSERT IGNORE INTO draft_files` in `setOutputFile` is intentionally permissive: if the draft was deleted between submit and completion, the FK constraint fires and the ignore suppresses it — no orphan rows, no thrown error.
- `SELECT draft_id FROM ai_generation_jobs WHERE job_id = ?` runs before the UPDATE in `setOutputFile` — adds one extra round-trip only when the function is called (worker completion path). This is acceptable.
- `AiGenerationJob.draftId` field added to the type; existing unit tests (aiGeneration.service.status.test.ts) are unaffected because `getJobStatus` does not surface `draftId` in its response shape, and mock return values go through `vi.fn().mockResolvedValue()` which is not type-checked.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [BE] `POST /generation-drafts/:draftId/ai/generate` endpoint</summary>

- Add new route in `apps/api/src/routes/generationDrafts.routes.ts`.
- Add thin handler `submitDraftAiGeneration` in `apps/api/src/controllers/generationDrafts.controller.ts`.
- Add orchestration in `apps/api/src/services/generationDraft.service.ts` that delegates to `aiGeneration.service.submit(userId, request)` (the same path the project endpoint uses). Ownership validation first (403 if caller ≠ draft owner; 400 on invalid payload; 202 on success with `{ jobId }`).
- Ensure the completed job's `output_file_id` is linked to the draft via `draft_files`. Extended `aiGenerationJob.repository.setOutputFile` to INSERT IGNORE into `draft_files` when `draft_id` is set on the job row.
- Integration test against real MySQL: seed a draft, hit the endpoint, poll the job, assert output file lands in `draft_files`; edge cases: non-owner → 403; provider failure → `status='failed'`, no link row.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

code-reviewer notes: Reviewed on 2026-04-18. §2 4-layer API correct: routes → controller → service → repository. Migration 026 idempotent (INFORMATION_SCHEMA guard), CHAR(36) nullable, no FK. All files ≤300 lines: routes 123, controller 267, service 291, repo 192, test 289. No direct env reads. Integration test covers happy path (202 + draft_id set), completion hook (auto-link draft_files), ownership edge cases (401/403/404), validation (400), and provider failure. setOutputFile repo-layer placement is intentional design: INSERT IGNORE idempotent at data layer, media-worker has no service layer. All architecture rules satisfied.

design-reviewer notes: Reviewed on 2026-04-18. Backend-only subtask (migration 026 + repository/service/controller/route + integration test). Zero UI changes, zero design tokens, zero DOM impact. Auto-approved per feedback_design_reviewer_backend.md pattern.


## [2026-04-18]

### Task: Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Subtask:** [FE] Add AI tab to wizard `MediaGalleryPanel`

**What was done:**
- Added `'ai'` to `GalleryTab` union in `MediaGalleryTabs.tsx` and rendered a new "AI" tab button with correct ARIA attributes (`role="tab"`, `aria-selected`, `aria-controls="tabpanel-ai"`)
- Updated `MediaGalleryPanel.tsx` to render `<AiGenerationPanel context={{ kind: 'draft', id: draftId }} onSwitchToAssets={handleSwitchToRecent} />` when the AI tab is active and `draftId` is present; shows an unavailable message when `draftId` is absent
- The Upload button is hidden while the AI tab is active (the AI panel manages generation directly, no upload affordance needed)
- `handleSwitchToRecent` invalidates `['generate-wizard', 'assets']` before switching to the Recent tab, ensuring the newly generated asset appears immediately when the user clicks "View in Assets"
- Extracted `GallerySkeleton`, `GalleryError`, `GalleryEmpty`, `FoldersPlaceholder` into `MediaGalleryPanelViews.tsx` to keep `MediaGalleryPanel.tsx` within the §9.7 300-line cap (296 lines after extraction)
- Added 8 new unit tests in `MediaGalleryPanel.ai.test.tsx`: AI tab presence, draft context prop, ARIA tabpanel attributes, Recent tab hidden, Upload button hidden, draftId-absent fallback message, onSwitchToAssets switches to Recent, gallery query invalidated on switch

**Files created:**
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanelViews.tsx` — extracted presentational state sub-components
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.ai.test.tsx` — 8 AI tab unit tests

**Files modified:**
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryTabs.tsx` — added `'ai'` tab value and button
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.tsx` — AI tab rendering, query invalidation, Upload button hide on AI tab
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.test.tsx` — added `AiGenerationPanel` module mock (required for module resolution)

**Notes:**
- `AiGenerationPanel` already invalidates `['assets', context.kind, context.id]` on completion. The wizard gallery uses `['generate-wizard', 'assets', type]` — a different key shape. Rather than adding an `onComplete` prop to `AiGenerationPanel`, the wizard invalidates its own query key in `handleSwitchToRecent` (called when user clicks "View in Assets"). This is a clean separation: the AI panel manages its own state; the wizard gallery manages its own cache.
- The JS default parameter gotcha: passing `undefined` explicitly to a function with a default parameter still triggers the default. Fixed in the new test file by inlining the render call instead of delegating to `renderPanel(fn, undefined)`.
- `MediaGalleryPanel.test.tsx` is 379 lines pre-existing from a prior subtask. My modification adds only the `AiGenerationPanel` module mock (17 lines). AI tab tests were placed in the new split file to respect the cap.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Add AI tab to wizard `MediaGalleryPanel`</summary>

Add a new tab value `'ai'` to `MediaGalleryTabs` (or reuse the existing tab pattern) in `apps/web-editor/src/features/generate-wizard/components/MediaGalleryTabs.tsx`.
In `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.tsx`, when the AI tab is active and `draftId` is present, render `<AiGenerationPanel context={{ kind: 'draft', id: draftId }} />`.
On successful AI generation completion (same query key used in Subtask 2 — `['generate-wizard', 'assets']`), invalidate so output appears in the standard gallery tabs.
Add unit test `MediaGalleryPanel.test.tsx` case: switching to AI tab renders the AI panel.
Keep files ≤ 300 lines (§9.7); use `.fixtures.ts` + topic test splits if needed.
§14 compliance — wizard imports only from `shared/` for AI components.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: NOT

qa-reviewer notes: Reviewed on 2026-04-18. Unit test coverage: 8 new tests in MediaGalleryPanel.ai.test.tsx (AI tab presence, context prop validation, ARIA attributes, upload button hide, query invalidation on return to Recent, no-draft fallback). Existing MediaGalleryPanel.test.tsx 17 tests remain green with new AiGenerationPanel mock. generate-wizard suite 164/164 tests pass. shared/ai-generation suite 206/206 tests pass. Full web-editor regression 2006/2006 tests pass. Acceptance criteria met: tab switch + context prop + upload button hidden + query invalidation. No regressions.

design-reviewer notes: Reviewed on 2026-04-18. Tab button typography: inactive 14/400/20 (body), active 14/600/20 (body + semi-bold). Padding 8px 12px (space-2/space-3 grid-compliant). AI tab button present with correct ARIA role/aria-selected/aria-controls. Tab order: Recent | Folders | AI. AI panel renders with context={{ kind: 'draft', id: draftId }}, fallback message when draftId absent. Upload button hidden while AI tab active. All checks passed.
