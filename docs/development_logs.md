# Development Log (compacted — 2026-03-29 to 2026-04-20)

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
- added: 025_drop_ai_job_project_id; 026_ai_jobs_draft_id (nullable `draft_id CHAR(36)`); 027_drop_project_assets_current (idempotent drop)
- added: 028_user_project_ui_state (composite PK user_id/project_id + JSON state_json + FK CASCADE)
- added: 029_soft_delete_columns (`deleted_at DATETIME(3) NULL` on files/projects/generation_drafts/project_files/draft_files + indexes on files/projects; idempotent INFORMATION_SCHEMA guards)
- added: 030_files_thumbnail_uri (`VARCHAR(1024) NULL`; no index)

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

## EPIC — Files-as-Root Foundation (Batches 1–6, 2026-04-18..19)
- DDL: migrations 021–027 (files root + pivots + downstream file_id + backfill + drops); in-process runner `apps/api/src/db/migrate.ts` + `schema_migrations` table + production gate
- BE: `file.repository.ts`, `file.service.ts`, `file.controller.ts`, `file.routes.ts`; `fileLinks.repository.ts` + service + response.service; POST /projects/:id/files, POST /generation-drafts/:id/files, GET /generation-drafts/:id/assets
- refactored: `clip.repository.ts` / `clip.service.ts` / `clips.controller.ts` — asset_id → file_id; `isFileLinkedToProject`
- refactored: `caption.repository.ts` + service + `transcribe.job.ts` — file_id; `getCaptionTrackByFileId`
- refactored: `aiGenerationJob.repository.ts` (removed projectId/resultAssetId; added outputFileId + `setOutputFile`); `enqueue-ai-generate.ts`; `aiGeneration.service.ts` user-scoped
- FE: `shared/file-upload/` (useFileUpload, UploadDropzone, UploadProgressList shared); moved 47 files `features/ai-generation/` → `shared/ai-generation/`; `AiGenerationContext` discriminated union
- AI-generate handlers: replaced asset-insert paths with `filesRepo.createFile` → `aiGenerationJobRepo.setOutputFile(jobId, fileId)` (INSERT IGNOREs `draft_files` pivot); extracted `ai-generate.utils.ts` (125L)
- render-worker: `resolveAssetUrls()` rewritten — filter `'fileId' in c`, SELECT from files, return map keyed by fileId
- Wire rename: `assetId` → `fileId` across api-contracts + FE (~70 files) + workers; `MediaIngestJobPayload.fileId` required
- S3 CORS: `infra/s3/cors.json` authoritative; regression test Pattern B in `apps/api/src/__tests__/infra/cors.test.ts`
- `mimeToKind` + `FileKind` canonical at `packages/project-schema/src/file-kind.ts` (re-exported); local copies removed from api+media-worker
- fixed: `project.repository.ts` broken JOIN subquery (was 500ing GET /projects)
- fixed: `VideoComposition.tsx` clip.assetId → clip.fileId (black preview fix); `useProjectInit.ts` always sets project-store.id to URL projectId
- tests: 56 new files-as-root tests; render-worker 26/26; ai-generate 134/134; migrate 19; schema-final-state 7; file-kind 14
- E2E: 5/5 core workflows PASS; `timeline-drop-regression.spec.ts` added

---

## [2026-04-20] Backlog Batch — general_tasks.md issues 1–6 (18 subtasks / 6 EPICs)

### EPIC A — Per-project timeline UI state (server-persisted)
- **A1 schema+repo:** migration 028 (composite PK user_id/project_id + JSON state_json + CASCADE FKs); `userProjectUiState.repository.ts` (getByUserAndProject / upsertByUserAndProject / deleteByUserAndProject; state typed `unknown`); integration test (13 tests) + unit test (8 mocked)
- **A2 service+REST:** `userProjectUiState.service.ts` (project-existence check → NotFoundError); `userProjectUiState.controller.ts` (permissive `z.unknown().refine(v !== undefined)`); `userProjectUiState.routes.ts` (auth + ACL('editor')); `GET /projects/:id/ui-state` + `PUT` (204); mounted in index.ts; integration test 12 cases (401/404/null/round-trip/overwrite/per-user isolation; 403 `it.todo` under ACL stub)
- **A3 FE hook+hydration:** `useProjectUiState.ts` two-phase (fetch+validate+restore when `isProjectReady`; subscribe + debounce-save 800ms + `beforeunload` flush); exported `EphemeralState` type + `setAll(partial)` on ephemeral-store (clamps playheadFrame/zoom/pxPerFrame/scrollOffsetX; excludes selection/volume); wired in `App.tsx` next to `useProjectInit`; `isPersistedUiState` type guard; network errors non-fatal; project switch re-fetches + cancels pending save without flushing. Tests split per §9.7 into `useProjectUiState.{restore,debounce,flush,project-switch}.test.ts` + `useProjectUiState.fixtures.ts` (14 tests total)

### EPIC B — System-wide soft-delete + Undo
- **B1 migration 029:** `deleted_at DATETIME(3) NULL` on files / projects / generation_drafts / project_files / draft_files; indexes on files+projects; INFORMATION_SCHEMA guards; idempotent; 13 integration tests
- **B2 repos:** audit 22 SELECTs across 6 repos (file, project, generationDraft, fileLinks, clip, asset); added `WHERE deleted_at IS NULL` on all reads (files + both sides of pivots); added `softDelete/restore`, `softDeleteProject/restoreProject`, `softDeleteDraft/restoreDraft`; internal `*IncludingDeleted` helpers (not re-exported). Split `asset.repository.ts` (335L→244L) into `asset.repository.list.ts` (166L) to comply with §9.7. `file.repository.ts` 306L accepted as pragmatic exception. 54 new unit tests
- **B3 services + GoneError:** added `GoneError` class in `lib/errors.ts` (registered → 410 in index.ts); `asset.service.deleteAsset` now soft-delete (no ConflictError on linked clips) + `restoreAsset`; `file.service` softDeleteFile/restoreFile; `generationDraft.service.remove` → softDeleteDraft; new `generationDraft.restore.service.ts`, `project.restore.service.ts`; `project.service.softDeleteProject`. 30-day TTL policy: restore 410s when row missing OR `deleted_at` > 30 days. 35 unit tests + fixed 3 pre-existing integration tests for migration 027 drift
- **B4 REST endpoints:** `DELETE /projects/:id` (soft); `POST /{assets,projects,generation-drafts}/:id/restore`; `GET /trash?type=file|project|draft&limit=50` with cursor; new `trash.{routes,controller,service}.ts` + per-type `*.repository.trash.ts` splits for file/generationDraft; auth + ACL('editor') or service-layer ownership. 36 new tests (9 unit + 27 integration)
- **B5 FE Undo toast + Trash panel:** `shared/undo/{useUndoToast.ts,UndoToast.tsx,undoToast.styles.ts}` (single-toast queue, 5s auto-dismiss, keyboard accessible); `features/trash/{TrashPanel.tsx,api.ts,trashPanel.styles.ts}` (loading/error/empty/populated + per-row restore); `/trash` ProtectedRoute in main.tsx; wired into `DeleteAssetDialog`, `ProjectCard`, `StoryboardCard` (delete buttons + toast via host panels); `restoreTrashItem` dispatcher by type. Track soft-delete carved out (lives in ProjectDoc patches + Ctrl+Z). 34 new tests. Design-fix: 4px-grid paddings + ERROR token constants + label fontWeight 500 on cards. Hoisted `AUTO_DISMISS_MS` to module scope

### EPIC C — Project preview = first frame
- **C1 migration 030:** `files.thumbnail_uri VARCHAR(1024) NULL`; idempotent INFORMATION_SCHEMA guard; 6 assertions integration test
- **C2 media-worker writes thumbnail:** `ingest.job.ts` extracts thumbnail via ffmpeg seekInput (Math.min(1, dur/2)), uploads to S3 (`thumbnails/{fileId}.jpg`), calls `file.repository.setThumbnailUri(fileId, uri)`; `IngestJobDeps` gains `bucket`. Skip path for non-video / audio-only containers. `file.repository.ts` split 318L→245L (+ `file.repository.list.ts` 144L). 14 new tests (9 ingest + 5 repo)
- **C3 project preview SQL:** `project.repository.findProjectsByUserId` replaces `NULL AS thumbnail_uri` with two correlated subqueries (earliest visual clip by `start_frame` from `project_clips_current`; fallback to first linked file in `project_files`; both filter `deleted_at IS NULL`); `ProjectSummary` gains `thumbnailFileId`; `projects.controller.listProjects` builds proxy URL `${baseUrl}/assets/:fileId/thumbnail`. 6 integration tests + updated unit tests

### EPIC D — Storyboard asset detail panel
- **D1 parameterize AssetDetailPanel:** moved `features/asset-manager/components/AssetDetailPanel.tsx` → `shared/asset-detail/{AssetDetailPanel.tsx,assetDetailPanel.styles.ts,AssetDetailPanel.fixtures.ts}`; discriminated-union prop `context: {kind:'project', projectId} | {kind:'draft', draftId}`; draft context renders "Add to Prompt" CTA (14px/600 token matching ExportModal); project context unchanged; old path re-exports as barrel for backward compat. 37 tests split across `.test.tsx` (project + shared) + `.draft.test.tsx`
- **D2 wizard opens panel:** `GenerateWizardPage.tsx` adds `selectedAssetId` state + handlers (open/close/add-to-prompt/delete + undo); new `useWizardAsset.ts` (React Query fetches full Asset by fileId); new `WizardAssetDetailSlot.tsx` (loading + panel render with context draft); extracted `generateWizardPage.styles.ts`. `InlineRenameField.tsx` gains `onRenameSuccess?` prop; `AssetDetailPanel.tsx` uses it + `useQueryClient` to invalidate `['generate-wizard','assets']` when `context.kind==='draft'` (fixes rename not refreshing wizard gallery). Absolute import fix (`@/features/generate-wizard/types`). 8 component integration tests

### EPIC E — General vs project/draft file scope
- **E1 API scope param:** Zod enums narrowed per endpoint — projects `['all','project'].default('project')`, drafts `['all','draft'].default('draft')`; `file.repository.list.ts` + `findAllForUser(userId)` (deleted_at IS NULL, newest first); `fileLinks.response.service.ts` extended with scope + userId; `fileLinks.service.getFilesForUser`; controllers parse+validate. Legacy default preserves behavior. 12 integration tests (both endpoints × 3 scopes + cross-endpoint rejection + soft-delete exclusion)
- **E2 FE scope toggle:** new `asset-manager/hooks/useScopeToggle.ts` (within-session state + first-load auto-switch guard via ref); `AssetBrowserPanel.tsx` scope toggle at sticky bottom with aria-pressed; wizard `MediaGalleryPanel.tsx` + new `MediaGalleryRecentBody.tsx` (extracted to stay under 300L) with scope toggle gated on draftId presence; `api.ts` wrappers (`getAssets(projectId, scope)`, `listDraftAssets(draftId, scope)`); React Query keys include scope for invalidation; `useAssets` routes to `listDraftAssets` when draftId present. Design-fix: `padding: '8px 16px'` on scope toggle container. 26 new tests
- **E3 auto-link on use:** `features/timeline/api.linkFileToProject(projectId, fileId)` + `features/generate-wizard/api.linkFileToDraft(draftId, fileId)`; `useDropAssetToTimeline` + `useDropAssetWithAutoTrack` fire-and-forget after drop; `PromptEditor.onFileLinked?` prop threaded through `usePromptEditorHandlers`; `GenerateWizardPage.handleAddToPrompt` + drag-drop both call auto-link. Server endpoints already INSERT IGNORE (idempotent). 8 new tests

### EPIC F — AI generation panel scales to full width
- **F1 fluid AI panel:** `aiGenerationPanelStyles.ts` exports `getPanelStyle(compact: boolean)` — compact=true → 320px fixed (editor sidebar), compact=false → 100% + maxWidth 720px (wizard default); `AiGenerationPanel.tsx` gains `compact?: boolean` prop (default false); `App.tsx` + `App.panels.tsx` pass `compact={true}`; wizard embedding (`MediaGalleryPanel.tsx`) leaves default. 9 new tests (6 style + 3 states)

---

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via `*.fixtures.ts` + `.<topic>.test.ts` splits (dot-infix mandatory); approved exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L pragmatic), `useProjectInit.test.ts` (318L)
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets + repos via `deps` (never module-level singletons)
- Migration strategy: in-process runner (`apps/api/src/db/migrate.ts`) with `schema_migrations` (sha256 checksum) = only sanctioned mutation path; `docker-entrypoint-initdb.d` deprecated
- MySQL 8.0 DDL non-transactional; INSERT into `schema_migrations` AFTER DDL succeeds; migration files must be idempotent (INFORMATION_SCHEMA + PREPARE/EXECUTE guards)
- Vitest integration: `pool: 'forks'` + `singleFork: true` serialize across files; each split test file declares its own `vi.hoisted()` block (cannot be shared via fixtures — documented exception)
- Files-as-root: `files` user-scoped root; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file) = app-layer GC before file delete
- Soft-delete: application-level `deleted_at IS NULL` filter on all reads; `*IncludingDeleted` internal helpers; restore services enforce 30-day TTL → `GoneError` (410); `softDelete` returns boolean, no throw on missing
- Reviewer verdict tokens are EXACTLY `NOT`/`YES`/`COMMENTED` (not `OK`/`COMPLIANT`) per task-orchestrator contract
- Wire DTO naming: `fileId` across wire (contracts + BE + FE + worker payloads); `assetId` compat shim removed; `MediaIngestJobPayload.fileId` required; `submitGenerationSchema.strict()`
- `project-store.snapshot.id` must be kept in sync with `useProjectInit` URL-resolved projectId on both success and 404 branches
- `findByIdForUser` unifies existence + ownership (cross-user → null → NotFoundError — avoids leaking existence)
- Audio via ElevenLabs (not fal.ai)
- Wizard MediaGalleryPanel separate from editor AssetBrowserPanel (§14 no cross-feature imports)
- Stitch DS `spacing`/`typography` do NOT round-trip — design-guide.md §3 authoritative
- Enhance state in BullMQ/Redis only; rate limit per-user; vanilla setInterval in FE hook
- mysql2 JSON columns: repository mappers guard `typeof === 'string'` before `JSON.parse`
- Typography §3: body 14/400, label 12/500, heading-3 16/600; spacing 4px multiples; radius-md 8px
- Primary CTA buttons: 14px/600 (matches ExportModal precedent)
- Per-file design-token pattern: hex constants at top of each `.styles.ts` (documented convention; NO CSS custom properties / `var(--…)` anywhere in web-editor)
- `/` HomePage is post-login + `*`-fallback; `/editor?projectId=<id>` is editor entry; `/trash` protected route
- Shared hooks keyed by `AiGenerationContext` discriminated union live in `shared/ai-generation/` + `shared/file-upload/` + `shared/asset-detail/` + `shared/undo/`; `features/generate-wizard/` may import only from `shared/`
- AI-generate completion hook at repository layer: `aiGenerationJob.setOutputFile(jobId, fileId)` INSERT IGNOREs `draft_files` pivot when job has `draft_id`
- Production migration safety: runner refuses if `NODE_ENV === 'production' && !APP_MIGRATE_ON_BOOT` (temporary; multi-replica race risk)
- AI panel width: `getPanelStyle(compact)` — compact=true (editor sidebar) 320px fixed; compact=false (wizard) 100% + 720px max
- React component props: `interface` (not `type`), suffixed with `Props` — §9 (recurring ruling)
- Storybook `StoryObj.args` is `Partial<Props>`; tests that narrow must use `as unknown as StoryArgs` + bracket-notation on discriminated-union access
- ESM `__dirname`: compute via `dirname(fileURLToPath(import.meta.url))`
- `mimeToKind()` + `FileKind` canonical at `packages/project-schema/src/file-kind.ts`; re-exported from the package index
- Test-infra subtasks: any skip/gate on filesystem/env preconditions MUST be live-verified in the actual container BEFORE marking done
- `express-rate-limit` login limiter in-memory; `tsx watch` restarts do NOT clear; only `docker restart <api>` resets
- `APP_DEV_AUTH_BYPASS=true` hard-codes `dev-user-001` in `auth.middleware.ts`; backend ignores JWT; E2E user sessions are FE-only under bypass
- S3 CORS: authoritative JSON at `infra/s3/cors.json`; regression test Pattern B (top-level `if (!corsReachable) describe.skip else readFileSync + describe(...)`)

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred (B3 `it.todo` 403 foreign-project tests activate when done)
- `project_assets_current` table dropped; any beforeAll seeds against it must be migrated to `files` + `project_files`
- `duration_ms` NULL for migrated files (source lacked fps); ingest reprocess repopulates
- `bytes` NULL after ingest (FFprobe doesn't return S3 object size; HeadObject needs worker bucket config)
- Presigned download URL deferred; production stream endpoint needs signed URL tokens
- Integration-test beforeAll schema self-healing distributed; candidate for centralized fixture layer
- OAuth client IDs/secrets default empty
- Lint workspace-wide fails with ESLint v9 config-migration error
- Pre-existing TS errors in unrelated test files (`App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`)
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile variants, secondary screens, spacing/typography echo)
- `DEV_PROJECT` fixture in `project-store.ts` — candidate for removal (cosmetic-only after useProjectInit fix)
- TopBar buttons `borderRadius: 6px` off-token (pre-existing); `AssetBrowserPanel` pre-existing drift: `gap: 2`, `padding: '0 10px'`, `fontSize: 13` (deferred — outside E2 surface)
- Chip × button needs semi-transparent background token
- `parseStorageUri` duplicated between `asset.service.ts` + `file.service.ts` — candidate to move to `lib/storage-uri.ts`
- Editor 404s on thumbnail/waveform + wizard 500 on fresh-draft `/generation-drafts/:id/assets` (empty) — cosmetic, pre-existing
- AI panel query-key rescoping: unified invalidation could be revisited
- Per-file ERROR token duplication across card components (ProjectCard, StoryboardCard) — consolidation candidate with TODO comments in code
- EPIC B hard-purge scheduled job: out of scope for this batch; soft-deleted rows past 30 days currently 410 on restore but are not physically removed
- Track soft-delete granularity: track/clip deletes remain ProjectDoc patches (Ctrl+Z via history-store); DB-level row soft-delete is file/project/draft only
- Files `thumbnail_uri` backfill for pre-ingest files deferred (re-ingest fills)
- **Class A (2 tests — pre-existing DEV_AUTH_BYPASS user-mismatch):** `renders-endpoint.test.ts`, `versions-list-restore-endpoint.test.ts`
- `asset.repository.ts` thin compat adapter over files+project_files — candidate for collapse (non-urgent)
- Manual live smoke (S3 CORS + render-worker export + AI-generate wizard + scope toggle + trash + project-preview thumbnail) deferred to manual/CI run at `https://15-236-162-140.nip.io`
- E2E image/audio timeline-drop tests skip when no assets of those types are linked to test project — only video path is E2E-covered
- All 2026-04-20 batch branches chained feat/a1-…→feat/f1-… — not yet merged into master

---

## [2026-04-20]

### Task: Guardian Post-Review Fixes — Backlog Batch A1–F1
**Subtask:** Fix 5 guardian-flagged regressions + 1 latent runtime bug across the 18-subtask batch

**What was done:**
- Fix 1 (`vi.hoisted` TDZ): Inlined `DEFAULT_SNAPSHOT` literal inside all 4 `vi.hoisted()` blocks in `useProjectUiState.{restore,debounce,flush,project-switch}.test.ts`; the imported value was in TDZ at hoist time. All 14 tests now load and pass.
- Fix 2 (App sibling mock gap): Added `subscribe: vi.fn(() => () => {})`, `getSnapshot: vi.fn(() => {...})`, `setAll: vi.fn()` to the `@/store/ephemeral-store` mock in 6 App test files (`App.test.tsx`, `App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`, `App.reorder.test.tsx`, `App.leftSidebar.test.tsx`, `App.mobile.test.tsx`). All 79 App tests now pass.
- Fix 3 (`asset.response.service.test.ts` config mock): Extended `vi.mock('@/config.js', ...)` to include `db: { host, port, name, user, password }` — `db/connection.ts` reads these at module init time. All 30 tests in that file now pass.
- Fix 4 (`thumbnailUri` latent bug): Updated `asset.repository.ts`: added `thumbnail_uri` field to `AssetRow`, changed `thumbnailUri: null` hardcode to `row.thumbnail_uri ?? null`, updated type comment. Added 3 new tests in `asset.repository.test.ts` (non-null, null, pre-migration absent field cases). Replaced the stale "always-null" test.
- Fix 5 (trash cursor pagination): Added keyset cursor (`deletedAt:id` format) support to `file.repository.trash.ts`, `generationDraft.repository.trash.ts`, `project.repository.ts`; threaded cursor param through `trash.service.ts` and `trash.controller.ts` (`trashQuerySchema` now includes `cursor: z.string().optional()`). Updated service tests to match new cursor format; added pagination e2e test + cursor forwarding assertions.

**Files created/modified:**
- `apps/web-editor/src/features/project/hooks/useProjectUiState.restore.test.ts` — Fix 1
- `apps/web-editor/src/features/project/hooks/useProjectUiState.debounce.test.ts` — Fix 1
- `apps/web-editor/src/features/project/hooks/useProjectUiState.flush.test.ts` — Fix 1
- `apps/web-editor/src/features/project/hooks/useProjectUiState.project-switch.test.ts` — Fix 1
- `apps/web-editor/src/App.test.tsx` — Fix 2
- `apps/web-editor/src/App.PreviewSection.test.tsx` — Fix 2
- `apps/web-editor/src/App.RightSidebar.test.tsx` — Fix 2
- `apps/web-editor/src/App.reorder.test.tsx` — Fix 2
- `apps/web-editor/src/App.leftSidebar.test.tsx` — Fix 2
- `apps/web-editor/src/App.mobile.test.tsx` — Fix 2
- `apps/api/src/services/asset.response.service.test.ts` — Fix 3
- `apps/api/src/repositories/asset.repository.ts` — Fix 4 (AssetRow type + mapRowToAsset)
- `apps/api/src/repositories/asset.repository.test.ts` — Fix 4 (3 new thumbnail tests, replaced stale test)
- `apps/api/src/repositories/file.repository.trash.ts` — Fix 5 (cursor + ORDER BY id)
- `apps/api/src/repositories/generationDraft.repository.trash.ts` — Fix 5 (cursor + ORDER BY id)
- `apps/api/src/repositories/project.repository.ts` — Fix 5 (cursor + ORDER BY id)
- `apps/api/src/services/trash.service.ts` — Fix 5 (cursor threading + buildCursor helper)
- `apps/api/src/services/trash.service.test.ts` — Fix 5 (updated + 3 new pagination tests)
- `apps/api/src/controllers/trash.controller.ts` — Fix 5 (cursor in trashQuerySchema)

**Notes:**
- `vi.hoisted()` bodies run before any `import` resolves — never reference imported values inside them (even from a fixtures file in the same package).
- Pre-existing Class A failures (not fixed): `assets-list-endpoint.test.ts` (project_assets_current table dropped in migration 027), `versions-list-restore-endpoint.test.ts` (DEV_AUTH_BYPASS user mismatch).
- Test results: web-editor 2152/2152 pass; API 1072/1072 unit+integration pass (4 integration files pre-existing fail); media-worker 143/143 pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Guardian post-review fixes</summary>

All 5 fixes applied per guardian spec. No active_task.md exists (all subtasks were already done before this fix session).

</details>

checked by code-reviewer - NOT
checked by qa-reviewer - NOT
checked by design-reviewer - NOT
checked by playwright-reviewer: NOT
