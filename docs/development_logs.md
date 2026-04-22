# Development Log (compacted — 2026-03-29 to 2026-04-21)

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

## Home: Projects & Storyboard Hub
- added: migration 020 (owner_user_id + title + composite idx); `findProjectsByUserId`, `listForUser`
- added: `MediaPreview`, `StoryboardCard` types; `findStoryboardDraftsForUser`, `findAssetPreviewsByIds`; `listStoryboardCardsForUser`
- added: `GET /generation-drafts/cards`; `/projects` + `/generation-drafts/cards` in openapi.ts
- added FE: `features/home/` (HomePage, HomeSidebar, ProjectCard/Panel, StoryboardCard/Panel)
- updated: `/` → `HomePage`; `*` → `/`; LoginPage post-login → `/`; wizard reads `?draftId=` via useSearchParams

## Editor + Generate-Wizard UX Batch
- added: Home button + Manual Save + Overwrite buttons in editor TopBar; `BackToStoryboardButton.tsx` → `/?tab=storyboard`
- fixed: PromptEditor chip-deletion (walk past consecutive empty text nodes); 3 regression tests
- added: HTML5 drag-drop (MIME `application/x-cliptale-asset`) from AssetThumbCard/AudioRowCard into PromptEditor; × remove button on chips

## Files-as-Root Foundation (Batches 1–6, 2026-04-18..19)
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

## Backlog Batch — general_tasks.md issues 1–6 (2026-04-20, 18 subtasks / 6 EPICs)

### EPIC A — Per-project timeline UI state (server-persisted)
- A1 schema+repo: migration 028; `userProjectUiState.repository.ts` (getByUserAndProject / upsertByUserAndProject / deleteByUserAndProject); integration + unit tests
- A2 service+REST: `userProjectUiState.service.ts` + `userProjectUiState.controller.ts` + routes; `GET/PUT /projects/:id/ui-state` (auth + ACL('editor')); permissive `z.unknown().refine(v !== undefined)`
- A3 FE hook+hydration: `useProjectUiState.ts` two-phase (fetch+validate+restore; subscribe + debounce-save 800ms + beforeunload flush); `setAll(partial)` on ephemeral-store; tests split per §9.7 into `.{restore,debounce,flush,project-switch}.test.ts` + `.fixtures.ts`

### EPIC B — System-wide soft-delete + Undo
- B1 migration 029: `deleted_at DATETIME(3) NULL` on files/projects/generation_drafts/project_files/draft_files; indexes; INFORMATION_SCHEMA guards
- B2 repos: audit 22 SELECTs; added `WHERE deleted_at IS NULL`; `softDelete/restore` families + internal `*IncludingDeleted` helpers. Split `asset.repository.ts` (335→244L) + `asset.repository.list.ts` (166L). `file.repository.ts` 306L accepted exception
- B3 services + GoneError: added `GoneError` (→410); `asset.service.deleteAsset` soft-delete (no more ConflictError on linked clips); new restore services with 30-day TTL
- B4 REST endpoints: `DELETE /projects/:id` (soft); `POST /{assets,projects,generation-drafts}/:id/restore`; `GET /trash?type=file|project|draft&limit=50` cursor; `trash.{routes,controller,service}.ts` + per-type `.repository.trash.ts` splits
- B5 FE Undo toast + Trash panel: `shared/undo/{useUndoToast.ts,UndoToast.tsx,undoToast.styles.ts}` (5s auto-dismiss); `features/trash/{TrashPanel.tsx,api.ts}` (loading/error/empty/populated + per-row restore); wired into DeleteAssetDialog + ProjectCard + StoryboardCard; `/trash` ProtectedRoute

### EPIC C — Project preview = first frame
- C1 migration 030: `files.thumbnail_uri VARCHAR(1024) NULL`
- C2 ingest: `ingest.job.ts` extracts thumbnail via ffmpeg seekInput, uploads `thumbnails/{fileId}.jpg`, calls `file.repository.setThumbnailUri`. Split `file.repository.ts` 318→245L + `file.repository.list.ts` 144L
- C3 project preview SQL: `findProjectsByUserId` replaces `NULL AS thumbnail_uri` with correlated subqueries (earliest visual clip by `start_frame` → fallback to first linked file); `ProjectSummary.thumbnailFileId`; controller builds proxy URL `${baseUrl}/assets/:fileId/thumbnail`

### EPIC D — Storyboard asset detail panel
- D1: moved `AssetDetailPanel` → `shared/asset-detail/`; discriminated-union `context: {kind:'project'} | {kind:'draft'}`; draft context renders "Add to Prompt" CTA (14px/600); old path re-exports as barrel; tests split `.test.tsx` + `.draft.test.tsx`
- D2 wizard panel: `GenerateWizardPage` adds `selectedAssetId` state + handlers; `useWizardAsset.ts` (React Query); `WizardAssetDetailSlot.tsx`; extracted `generateWizardPage.styles.ts`; `InlineRenameField.onRenameSuccess?` prop invalidates `['generate-wizard','assets']` in draft context

### EPIC E — General vs project/draft file scope
- E1 API scope param: Zod enums per endpoint — projects `['all','project'].default('project')`, drafts `['all','draft'].default('draft')`; `file.repository.list.findAllForUser(userId)`; `fileLinks.service.getFilesForUser`
- E2 FE scope toggle: `asset-manager/hooks/useScopeToggle.ts` + AssetBrowserPanel toggle; wizard `MediaGalleryPanel` + new `MediaGalleryRecentBody.tsx`; `api.ts` wrappers (`getAssets(projectId, scope)`, `listDraftAssets(draftId, scope)`); React Query keys include scope
- E3 auto-link on use: `features/timeline/api.linkFileToProject(projectId, fileId)` + `features/generate-wizard/api.linkFileToDraft(draftId, fileId)`; fire-and-forget from `useDropAssetToTimeline` + `useDropAssetWithAutoTrack`; `PromptEditor.onFileLinked?` threaded through `usePromptEditorHandlers`; server endpoints idempotent (INSERT IGNORE)

### EPIC F — AI generation panel scales to full width
- F1 fluid AI panel: `aiGenerationPanelStyles.ts.getPanelStyle(compact: boolean)` — compact=true → 320px (editor sidebar), compact=false → 100%/max 720px (wizard); `AiGenerationPanel` gains `compact?: boolean` prop; `App.tsx` passes `compact={true}`

### Guardian Post-Review Fixes (2026-04-20)
- vi.hoisted TDZ: inlined `DEFAULT_SNAPSHOT` literal inside 4 `vi.hoisted()` blocks in `useProjectUiState.{restore,debounce,flush,project-switch}.test.ts`
- App sibling mock gap: added `subscribe/getSnapshot/setAll` to `@/store/ephemeral-store` mock in 6 App test files
- `asset.response.service.test.ts` config mock: extended `vi.mock('@/config.js')` with `db: { host, port, name, user, password }`
- `thumbnailUri` mapping: `asset.repository.ts` `AssetRow.thumbnail_uri`, `row.thumbnail_uri ?? null`; 3 new tests
- trash cursor pagination: `deletedAt:id` keyset cursor in `file.repository.trash.ts` + `generationDraft.repository.trash.ts` + `project.repository.ts`; threaded through `trash.service.ts` + controller (`trashQuerySchema.cursor`)
- design-reviewer: `ProjectCard.tsx` delete-button typography 11/400 → 12/500 per design-guide §3 label token

## Editor asset-fetch loop + general→project link + /generate error (2026-04-21)
- diagnosed: `/generate?draftId=<id>` empty gallery — FE cast bare `AssetApiResponse[]` as envelope; field-name mismatch (`contentType`/`type`, `filename`/`displayName`/`label`, `thumbnailUri`/`thumbnailUrl`); no 500 (prior Known Issue mischaracterised)
- added: `GET /projects/:id/assets` keyset pagination `?cursor=<base64 ISO|fileId>&limit=<1..100>&scope=<project|all>` → `{ items, nextCursor, totals: { count, bytesUsed } }` envelope; `fileLinks.repository.findFilesByProjectIdPaginatedWithCursor`, `file.repository.list.findAllForUserPaginated`; `getProjectFilesTotals` + `getAllFilesTotalsForUser`; `encodeProjectCursor`/`decodeProjectCursor` in `fileLinks.response.service.ts`; extracted `assets.controller.schemas.ts` (§9.7); OpenAPI `AssetApiResponseItem`/`ProjectAssetsTotals`/`AssetListResponse` + path entry
- added: `packages/api-contracts/src/asset-list.schemas.ts` (Zod schemas + inferred types); dist rebuilt
- rewired FE to envelope: `getAssets()` returns `AssetListResponse`; `fetchNextAssetsPage()` exported; `AssetBrowserPanel` reads `data?.items ?? []`; `useProjectAssets.ts` reads `['assets', projectId, 'project']` cache; `useRemotionPlayer.ts` rewritten cache-first (`useQueries` fallback only for orphan fileIds)
- configured: `main.tsx` QueryClient `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1` (stops focus-refetch 429 bursts)
- added: `useAddAssetToTimeline.ts` fires `linkFileToProject` + cache invalidate after `createClip()` (closes scope=all "Add to Timeline" link gap)
- fixed: `/generate` page — `fileLinks.response.service.getDraftFilesResponse` returns envelope; `generationDrafts.controller.getDraftAssets` calls `generationDraftService.getById(userId, draftId)` for ownership (**security fix**: any auth'd user could read any draft); FE `listDraftAssets` maps wire via `wireItemToAssetSummary`; OpenAPI adds `GET /generation-drafts/{id}/assets` envelope; extracted `generationDrafts.controller.schemas.ts` (§9.7)
- tests: `projects-assets-pagination.test.ts` (17), `.contract.test.ts` (3), `generation-drafts-assets.test.ts` (5), envelope migration on `file-links-endpoints{,.draft}.test.ts` + `assets-scope-param.test.ts`, `fileLinks.response.service.test.ts` (9), `useProjectAssets.test.ts` (8), `useRemotionPlayer.test.ts` rewritten (23), `useAddAssetToTimeline.{test,linkfile.test,fixtures}.ts` (22 across splits, §9.7), `useAssets.test.ts` (6)

## Guardian test regressions follow-up (2026-04-21)
- fixed: `useAddAssetToTimeline.placement.test.ts` (8) — added `vi.hoisted` + `@tanstack/react-query` mock; removed inline helper dup (pulled from `.fixtures.ts`); added `linkFileToProject` to `@/features/timeline/api` mock. 30 tests green across 3 split files (15 + 8 + 7)
- fixed: `assets-scope-param.test.ts` draft-half (4) — migrated to envelope (`res.body.items`); 12/12 tests green
- fixed: `generation-draft-ai-generate.test.ts:212` (1) — envelope cast; 8/8 tests green (fix committed as `667ab82` during subtask 2 review — cross-lane workflow irregularity noted)

## Telegram Bugs Batch (2026-04-21, branch `fix/telegram-bugs-timeline-preview-storyboard`)

### Timeline state leak across projects
- added: `resetProjectStore(projectId)` in `apps/web-editor/src/store/project-store.ts` — seeds empty ProjectDoc with given id/tracks:[]/clips:[] using extracted `DEFAULT_SCHEMA_VERSION/FPS/WIDTH/HEIGHT` constants; clears `currentVersionId` to null; notifies listeners
- promoted: `history-store._resetForTesting` → public `resetHistoryStore()` (adds notifyListeners); test-only wrapper kept for backward compat
- updated: `useProjectInit.ts` hydration effect — calls `resetProjectStore(projectId)` + `resetHistoryStore()` at top before `fetchLatestVersion` (prevents autosave draining prior-project patches into new project's first version)
- tests: `project-store.reset.test.ts` (12), `useProjectInit.project-switch.test.ts` (7), `useAutosave.reset.test.ts` (4); existing `useProjectInit.test.ts` mock updated to include new resets

### Home-page thumbnail 401 fix
- fixed: `ProjectCard.tsx` + `StoryboardCard.tsx` `MediaThumb` — wrapped `<img src={thumbnailUrl}>` with `buildAuthenticatedUrl(...)` (appends `?token=` consumed by `auth.middleware` query-param fallback); null-check + placeholder SVG preserved
- tests: +3 in `ProjectCard.test.tsx` (28 total) + +3 in `StoryboardCard.test.tsx` (47 total) — token present → `?token=`, no token → raw URL, null → placeholder

### Storyboard asset-detail fluid layout
- refactored: `assetDetailPanel.styles.ts` static export → `getAssetDetailPanelStyles(compact: boolean)` factory (mirrors EPIC F `getPanelStyle`) — compact=true preserves 280×620 root + 248-wide children (editor sidebar); compact=false → root `width:100%` / `maxWidth:520` / `minHeight:620` + child widths `100%` / `maxWidth:480`; `STATUS_BG` unchanged
- updated: `AssetDetailPanel.tsx` — `compact?: boolean` prop (default `true`); factory called at render
- updated: `WizardAssetDetailSlot.tsx` passes `compact={false}`; `generateWizardPage.styles.ts` `rightColumn.padding` `'0'` → `'24px'`
- tests: `getAssetDetailPanelStyles.test.ts` (21), `AssetDetailPanel.fluid.test.tsx` (11), `WizardAssetDetailSlot.test.tsx` (8); existing AssetDetailPanel tests (38) remain green; full web-editor regression sweep 200 files / 2245 tests green

---

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via `*.fixtures.ts` + `.<topic>.test.ts` splits (dot-infix mandatory); approved exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L pragmatic), `useProjectInit.test.ts` (318L), `StoryboardCard.tsx` (319L pragmatic)
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets + repos via `deps` (never module-level singletons)
- Migration strategy: in-process runner (`apps/api/src/db/migrate.ts`) with `schema_migrations` (sha256 checksum) = only sanctioned mutation path
- MySQL 8.0 DDL non-transactional; INSERT into `schema_migrations` AFTER DDL succeeds; migration files must be idempotent (INFORMATION_SCHEMA + PREPARE/EXECUTE guards)
- Vitest integration: `pool: 'forks'` + `singleFork: true` serialize across files; each split test file declares its own `vi.hoisted()` block (cannot be shared via fixtures — documented exception)
- Files-as-root: `files` user-scoped root; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file) = app-layer GC before file delete
- Soft-delete: application-level `deleted_at IS NULL` filter on all reads; `*IncludingDeleted` internal helpers; restore services enforce 30-day TTL → `GoneError` (410)
- Reviewer verdict tokens are EXACTLY `NOT`/`YES`/`COMMENTED` per task-orchestrator contract
- Wire DTO naming: `fileId` across wire (contracts + BE + FE + worker payloads); `assetId` compat shim removed
- `project-store.snapshot.id` kept in sync with `useProjectInit` URL-resolved projectId on both success and 404 branches
- **Project-switch store reset**: `useProjectInit` hydration effect must call `resetProjectStore(projectId) + resetHistoryStore()` BEFORE `fetchLatestVersion` — module-singleton stores do not unmount with React; without reset, useAutosave drains prior-project patches into new project's first version
- **Media elements need `buildAuthenticatedUrl`**: `<img>`/`<video>`/`<audio>` from `/assets/:id/{thumbnail,stream}` MUST be wrapped (browsers cannot send Authorization headers; auth.middleware accepts `?token=` query fallback)
- `findByIdForUser` unifies existence + ownership (cross-user → null → NotFoundError — avoids leaking existence)
- Audio via ElevenLabs (not fal.ai)
- Wizard MediaGalleryPanel separate from editor AssetBrowserPanel (§14 no cross-feature imports)
- Stitch DS `spacing`/`typography` do NOT round-trip — design-guide.md §3 authoritative
- mysql2 JSON columns: repository mappers guard `typeof === 'string'` before `JSON.parse`
- Typography §3: body 14/400, label 12/500, heading-3 16/600; spacing 4px multiples; radius-md 8px; Primary CTA 14px/600
- Per-file design-token pattern: hex constants at top of each `.styles.ts`; NO CSS custom properties / `var(--…)` in web-editor
- React component props: `interface` (not `type`), suffixed with `Props` — §9
- FE asset list is a paginated envelope `{ items, nextCursor, totals }` across wire (projects + drafts); editor cache-first via `['assets', projectId, 'project']`; `useRemotionPlayer` only falls back to `getAsset(fileId)` for orphan clips not in the cached page
- QueryClient defaults (editor main.tsx): `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1`
- **Panel `compact` prop pattern**: shared panels embedded in both editor sidebar (compact=true, fixed narrow width) and wizard column (compact=false, fluid 100%/maxWidth) via `getXyzStyles(compact)` factory — precedent: `aiGenerationPanelStyles.getPanelStyle` (320px/720max); `getAssetDetailPanelStyles` (280×620/520max)
- Draft-assets endpoint now shares the envelope + ownership-check pattern with project-assets; `generationDraftService.getById(userId, draftId)` required before returning any draft-scoped data

---

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred (B3 `it.todo` 403 foreign-project tests activate when done)
- `project_assets_current` table dropped; any beforeAll seeds against it must be migrated to `files` + `project_files`
- `duration_ms` NULL for migrated files; ingest reprocess repopulates
- `bytes` NULL after ingest (FFprobe doesn't return S3 object size; HeadObject needs worker bucket config)
- Presigned download URL deferred; production stream endpoint needs signed URL tokens
- Lint workspace-wide fails with ESLint v9 config-migration error
- Pre-existing TS errors in unrelated test files (`App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`)
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile variants, secondary screens, spacing/typography echo)
- TopBar buttons `borderRadius: 6px` off-token (pre-existing); `AssetBrowserPanel` pre-existing drift: `gap: 2`, `padding: '0 10px'`, `fontSize: 13`
- Chip × button needs semi-transparent background token
- `parseStorageUri` duplicated between `asset.service.ts` + `file.service.ts` — candidate to move to `lib/storage-uri.ts`
- AI panel query-key rescoping: unified invalidation could be revisited
- Per-file ERROR token duplication across card components — consolidation candidate
- EPIC B hard-purge scheduled job: out of scope; soft-deleted rows past 30 days currently 410 on restore but not physically removed
- Track soft-delete granularity: tracks/clips remain ProjectDoc patches (Ctrl+Z); DB-level row soft-delete is file/project/draft only
- Files `thumbnail_uri` backfill for pre-ingest files deferred (re-ingest fills)
- **Class A (pre-existing DEV_AUTH_BYPASS user-mismatch / dropped-table refs):** `renders-endpoint.test.ts`, `versions-list-restore-endpoint.test.ts`, `assets-finalize-endpoint.test.ts`, `assets-list-endpoint.test.ts`
- `asset.repository.ts` thin compat adapter over files+project_files — candidate for collapse (non-urgent)
- `linkFileToProject` duplicated between `features/timeline/api.ts` + `shared/file-upload/api.ts` — consolidation candidate
- E2E image/audio timeline-drop tests skip when no assets of those types are linked to test project — only video path E2E-covered
- Infinite scroll UX in asset sidebar: BE pagination shipped (limit 100 page-1) but FE still page-1-only; `fetchNextAssetsPage()` helper exported but unwired
- Project-switch: unsaved edits on the departing project are intentionally discarded by the reset (2s debounce + beforeunload cover the normal case). Pre-navigation flush hook is a follow-up candidate.
- `lust-not-compacted-dev-logs.md` holds the single-copy uncompacted backup of this log; git holds prior-batch history
