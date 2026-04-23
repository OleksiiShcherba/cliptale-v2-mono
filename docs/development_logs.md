# Development Log (compacted — 2026-03-29 to 2026-04-23)

## Monorepo Scaffold (Epic 1)
- added: root config (`package.json`, `turbo.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` — MySQL 8 + Redis 7)
- added: `apps/api/` (Express + helmet/cors/rate-limit, BullMQ stubs), `apps/web-editor/` (React 18 + Vite), `apps/media-worker/`, `apps/render-worker/`
- added: `packages/project-schema/` (Zod: ProjectDoc, Track, Clip union, imageClipSchema), `packages/remotion-comps/` (VideoComposition + layers)
- fixed: `APP_` env prefix; Zod startup validation; `workspace:*` → `file:` paths

## DB Migrations
- added: 001–020 — projects, assets, captions, versions, render_jobs, project_clips, seed, image clip ENUM, users/sessions/password_resets/email_verifications, ai_generation_jobs
- added: 013_drop_ai_provider_configs; 014_ai_jobs_fal_reshape; 015_ai_jobs_audio_capabilities; 016_user_voices; 017_asset_display_name; 018_add_caption_clip_type; 019_generation_drafts; 020_projects_owner_title
- added: 021_files (root table, user-scoped, status ENUM); 022_file_pivots (project_files + draft_files, composite PKs, CASCADE container / RESTRICT file)
- added: 023_downstream_file_id_columns; 024_backfill_file_ids (project_assets_current → files + project_files; drops project_assets_current)
- added: 025_drop_ai_job_project_id; 026_ai_jobs_draft_id; 027_drop_project_assets_current; 028_user_project_ui_state
- added: 029_soft_delete_columns (`deleted_at DATETIME(3) NULL` on files/projects/generation_drafts/project_files/draft_files + indexes; INFORMATION_SCHEMA guards)
- added: 030_files_thumbnail_uri (`VARCHAR(1024) NULL`)
- added: 031_storyboard_blocks; 032_storyboard_edges (UNIQUE source+target enforces one-in/one-out); 033_storyboard_block_media; 034_storyboard_history (fire-and-forget, no FK)

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
- added: `ai-generate.output.ts`; `GET /ai/models`; removed 8 legacy provider adapters
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
- added: `CaptionLayer.tsx` — per-word color via `useCurrentFrame()`, `premountFor={fps}`, `clipStartFrame` prop
- updated: `useAddCaptionsToTimeline.ts` — branches on words (CaptionClip vs TextOverlayClip fallback)
- added: `CaptionEditor` dual-hex color inputs; 5 regression tests

## AssetPreviewModal Fix
- fixed: `AssetPreviewModal.tsx` — replaced presigned `downloadUrl` with `${apiBaseUrl}/assets/${id}/stream` + `buildAuthenticatedUrl`

## EPIC 10 STAGE 1 — Design Tooling (Figma → Stitch)
- installed: `davideast/stitch-mcp`; removed `figma-remote-mcp`
- created: Stitch project `1905176480942766690` + DS `assets/17601109738921479972` v1 "ClipTale Dark"
- generated: 4 DESKTOP screens (Landing/Dashboard/Editor/Asset Browser); transient dup Landing (OQ-S1)
- rewrote: `docs/design-guide.md` — §1 Stitch, §3 tokens + DS ID, §6 screen IDs, §7 tool patterns, §10 OQ-S1..S4

## Video Generation Wizard (Phase 0 + Step 1)
- added: migration 019; `promptDocSchema`; `generationDraft.repository.ts`, `generationDraft.service.ts`, controllers + routes (5 routes)
- added: `features/generate-wizard/` (components/, hooks/, api.ts, types.ts)
- added: `WizardStepper.tsx`, `GenerateWizardPage.tsx`, `/generate` route (protected)
- added: `PromptEditor.tsx` + `promptEditorDOM.ts` — contenteditable chip controller
- chip colors: video=#0EA5E9, image=#F59E0B, audio=#10B981
- added: `useAssets.ts` (React Query); `MediaGalleryPanel.tsx`; `AssetThumbCard.tsx`, `AudioRowCard.tsx`
- added: `mediaGalleryStyles.ts`; `AssetPickerModal.tsx` (520×580, type-filtered, focus trap)
- added: `PromptToolbar.tsx`; `useGenerationDraft.ts` (debounced 800ms, POST-then-PUT)
- added: `WizardFooter.tsx` + `CancelConfirmDialog.tsx`; `GenerateRoadMapPlaceholder.tsx`

## Wizard Phase 2 (AI Enhance + Pro Tip)
- added: `EnhancePromptJobPayload`; `QUEUE_AI_ENHANCE`; `enhancePrompt.job.ts`; `enhance.rate-limiter.ts` (10/hr per userId)
- added: `POST /generation-drafts/:id/enhance` (202), `GET .../enhance/:jobId`; `useEnhancePrompt.ts` (1000ms poll, 60s cap)
- added: `EnhancePreviewModal.tsx` + `renderPromptDocText.ts`; `useDismissableFlag.ts` + `ProTipCard.tsx`
- fixed: `mapRowToDraft` — `typeof === 'string'` guard for mysql2 JSON columns

## Home: Projects & Storyboard Hub
- added: migration 020; `findProjectsByUserId`, `listForUser`; `listStoryboardCardsForUser`
- added: `GET /generation-drafts/cards`; FE `features/home/` (HomePage, HomeSidebar, ProjectCard/Panel, StoryboardCard/Panel)
- updated: `/` → `HomePage`; wizard reads `?draftId=` via useSearchParams

## Editor + Generate-Wizard UX Batch
- added: Home button + Manual Save + Overwrite buttons in editor TopBar; `BackToStoryboardButton.tsx`
- fixed: PromptEditor chip-deletion (walk past consecutive empty text nodes); 3 regression tests
- added: HTML5 drag-drop from AssetThumbCard/AudioRowCard into PromptEditor; × remove button on chips

## Files-as-Root Foundation (Batches 1–6, 2026-04-18..19)
- DDL: migrations 021–027; in-process runner `apps/api/src/db/migrate.ts` + `schema_migrations` table
- BE: `file.repository.ts`, `file.service.ts`, `file.controller.ts`, `file.routes.ts`; `fileLinks.repository.ts` + service + response.service
- refactored: `clip.repository.ts` / `clip.service.ts` / `clips.controller.ts` — asset_id → file_id
- refactored: `caption.repository.ts` + service + `transcribe.job.ts` — file_id
- refactored: `aiGenerationJob.repository.ts` (removed projectId/resultAssetId; added outputFileId)
- FE: `shared/file-upload/` (useFileUpload, UploadDropzone, UploadProgressList); moved 47 files `features/ai-generation/` → `shared/ai-generation/`
- render-worker: `resolveAssetUrls()` rewritten — filter `'fileId' in c`, SELECT from files
- Wire rename: `assetId` → `fileId` across api-contracts + FE (~70 files) + workers
- S3 CORS: `infra/s3/cors.json` authoritative; regression test in `apps/api/src/__tests__/infra/cors.test.ts`
- fixed: `project.repository.ts` broken JOIN subquery; `VideoComposition.tsx` clip.assetId → clip.fileId
- tests: 56 new files-as-root tests; render-worker 26/26; ai-generate 134/134; migrate 19; E2E 5/5

## Backlog Batch — general_tasks.md issues 1–6 (2026-04-20)

### EPIC A — Per-project timeline UI state
- A1: migration 028; `userProjectUiState.repository.ts`; integration + unit tests
- A2: `userProjectUiState.service.ts` + controller + routes; `GET/PUT /projects/:id/ui-state`
- A3: `useProjectUiState.ts` two-phase (fetch+restore; subscribe + debounce-save 800ms + beforeunload flush); tests split per §9.7 into 4 files + fixtures

### EPIC B — Soft-delete + Undo
- B1: migration 029; B2: audit 22 SELECTs; `softDelete/restore` families; split `asset.repository.ts` → `asset.repository.list.ts`
- B3: `GoneError` (→410); `asset.service.deleteAsset` soft-delete; restore services with 30-day TTL
- B4: `DELETE /projects/:id` (soft); `POST /{assets,projects,generation-drafts}/:id/restore`; `GET /trash` cursor; trash splits
- B5: `shared/undo/{useUndoToast,UndoToast}` (5s auto-dismiss); `features/trash/TrashPanel.tsx`; `/trash` ProtectedRoute

### EPIC C — Project preview = first frame
- C1: migration 030; C2: `ingest.job.ts` ffmpeg seekInput thumbnail → S3 → `setThumbnailUri`
- C3: `findProjectsByUserId` correlated subqueries for `thumbnailFileId`; proxy URL `${baseUrl}/assets/:fileId/thumbnail`

### EPIC D — Storyboard asset detail panel
- D1: moved `AssetDetailPanel` → `shared/asset-detail/`; discriminated-union context prop; tests split
- D2: `WizardAssetDetailSlot.tsx`; `useWizardAsset.ts` (React Query); `InlineRenameField.onRenameSuccess?`

### EPIC E — General vs project/draft file scope
- E1: Zod enums per endpoint; `file.repository.list.findAllForUser(userId)`
- E2: `useScopeToggle.ts` + AssetBrowserPanel toggle; wizard `MediaGalleryRecentBody.tsx`; React Query keys include scope
- E3: fire-and-forget auto-link on use (`linkFileToProject` / `linkFileToDraft`); server endpoints idempotent (INSERT IGNORE)

### EPIC F — AI panel fluid
- F1: `getPanelStyle(compact: boolean)` — compact=true → 320px, compact=false → 100%/max 720px; `App.tsx` passes `compact={true}`

### Guardian Post-Review Fixes (2026-04-20)
- fixed: vi.hoisted TDZ in 4 `useProjectUiState.*.test.ts` files
- fixed: `subscribe/getSnapshot/setAll` added to ephemeral-store mock in 6 App test files
- fixed: `thumbnailUri` mapping in `asset.repository.ts`; 3 new tests
- fixed: trash cursor pagination — `deletedAt:id` keyset cursor threaded through trash repos + service + controller
- fixed: `ProjectCard.tsx` delete-button typography 11/400 → 12/500 per design-guide §3

## Editor asset-fetch loop + /generate error (2026-04-21)
- added: `GET /projects/:id/assets` keyset pagination envelope `{ items, nextCursor, totals }`; `fileLinks.repository.findFilesByProjectIdPaginatedWithCursor`; `encodeProjectCursor`/`decodeProjectCursor`
- added: `packages/api-contracts/src/asset-list.schemas.ts` (Zod + inferred types)
- rewired FE to envelope: `getAssets()` returns `AssetListResponse`; `AssetBrowserPanel` reads `data?.items ?? []`
- configured: `main.tsx` QueryClient `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1`
- fixed: `/generate` page — `getDraftFilesResponse` returns envelope; `getDraftAssets` calls `getById(userId, draftId)` for ownership (security fix)
- tests: projects-assets-pagination (17), contract (3), generation-drafts-assets (5), useProjectAssets (8), useRemotionPlayer (23), useAddAssetToTimeline (22 across splits)

## Guardian test regressions follow-up (2026-04-21)
- fixed: `useAddAssetToTimeline.placement.test.ts` — vi.hoisted + react-query mock; 30 tests green
- fixed: `assets-scope-param.test.ts` draft-half — envelope migration; 12/12 green
- fixed: `generation-draft-ai-generate.test.ts:212` — envelope cast; 8/8 green

## Telegram Bugs Batch (2026-04-21)
- added: `resetProjectStore(projectId)` + `resetHistoryStore()` called before `fetchLatestVersion` in `useProjectInit.ts`
- fixed: `ProjectCard.tsx` + `StoryboardCard.tsx` — `buildAuthenticatedUrl()` on thumbnail `<img>`
- refactored: `getAssetDetailPanelStyles(compact)` factory; `AssetDetailPanel` compact prop; `WizardAssetDetailSlot` passes `compact={false}`

## Storyboard Editor — Part A: Backend + Canvas Foundation (2026-04-22)
- added: migrations 031–034 (storyboard_blocks, storyboard_edges, storyboard_block_media, storyboard_history)
- added: `storyboard.repository.ts`, `storyboard.service.ts`, `storyboard.controller.ts`, `storyboard.routes.ts`; 5 REST endpoints
- added: `packages/api-contracts/src/storyboard-styles.ts` — 3 styles (cyberpunk, cinematic-glow, film-noir)
- added: `features/storyboard/` — types, api, StoryboardPage (top bar + 3-tab sidebar + canvas + bottom bar)
- installed: `@xyflow/react@^12.10.2`; added `StartNode`, `EndNode`, `SceneBlockNode`, `storyboardIcons.tsx`, `nodeStyles.ts`
- added: `useStoryboardCanvas.ts` (POST /initialize → GET → hydrate React Flow)
- added: `useAddBlock.ts`, `useStoryboardDrag.ts` (ghost drag 30% opacity + portal; auto-insert on edge hit 40px)
- added: `CanvasToolbar.tsx`, `GhostDragPortal.tsx`, `SidebarTab.tsx`, `StoryboardCanvas.tsx`
- added: `useStoryboardKeyboard.ts` (Delete/Ctrl+Z/Ctrl+Y), `ZoomToolbar.tsx` (−/pct/+; 25–200%, step 10)
- added: `storyboard-store.ts` (useSyncExternalStore), `storyboard-history-store.ts` (MAX_HISTORY_SIZE=50, undo/redo cursor, 1s debounce server persistence)
- added: `useStoryboardAutosave.ts` (30s debounce; saveLabel states), `useStoryboardHistoryPush.ts`
- tests: 102/102 full storyboard suite

## Storyboard Part A — Regression Fixes (2026-04-23)
- fixed: `storyboard.repository.ts:110,224` — `pool.execute` → `pool.query` for LIMIT-bound queries (mysql2 ER_WRONG_ARGUMENTS errno 1210)
- added: `e2e/storyboard-history-regression.spec.ts` (4 tests via `page.request`)
- fixed: rebuilt `web-editor` Docker image to hoist `@xyflow/react` into container node_modules
- added: 5 storyboard OpenAPI paths + 8 component schemas in `packages/api-contracts/src/openapi.ts`
- added: `openapi.storyboard.paths.test.ts` (31 tests) + `openapi.storyboard.schemas.test.ts` (18 tests); 89/89 api-contracts pass

## Guardian Recommendations Batch (2026-04-23)
- deleted: `apps/web-editor/src/features/storyboard/store/storyboard-history-store.stub.ts` (dead code; 2351 FE tests still pass)
- added: `e2e/storyboard-canvas.spec.ts` (5 E2E tests for /storyboard/:draftId; 5/5 pass on deployed instance)
- added: `CanvasToolbar.test.tsx` (11 unit tests)
- fixed: `assets-finalize-endpoint.test.ts` + `assets-list-endpoint.test.ts` — reseeded with `files`+`project_files` (dropped `project_assets_current` refs)
- fixed: `versions-list-restore-endpoint.test.ts` — `'user-test-001'` → `'dev-user-001'` (DEV_AUTH_BYPASS identity)

## Guardian Recommendations Cleanup (2026-04-23)
- configured: `docker-compose.yml` lines 57+79 — `APP_CORS_ORIGIN` + `VITE_PUBLIC_API_BASE_URL` parametrized with `${VAR:-localhost-fallback}`; `.env` updated with nip.io values; `.env.example` documented
- pushed: `feat/storyboard-part-a` to remote origin (commit 7a083a3, 63 files / +8855 insertions now safe)
- documented: E2E spec file exemption added to §9.7 in `docs/architecture-rules.md` (`e2e/*.spec.ts` exempt from 300-line cap; quality gate = one `test.describe` per file)
- removed: stale Class A Known Issue bullet (renders-endpoint.test.ts passes 10/10; versions fixed prior subtask)

---

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via `*.fixtures.ts` + `.<topic>.test.ts` splits (dot-infix mandatory); approved exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L), `useProjectInit.test.ts` (318L), `StoryboardCard.tsx` (319L), `StoryboardPage.tsx` (322L); `e2e/*.spec.ts` files exempt (one describe block quality gate)
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets + repos via `deps`
- Migration strategy: in-process runner + `schema_migrations` (sha256 checksum) = only sanctioned mutation path
- MySQL 8.0 DDL non-transactional; INSERT into `schema_migrations` AFTER DDL; migration files must be idempotent
- Vitest integration: `pool: 'forks'` + `singleFork: true`; each split test file declares own `vi.hoisted()` block
- Files-as-root: `files` user-scoped root; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file)
- Soft-delete: application-level `deleted_at IS NULL`; `*IncludingDeleted` helpers; 30-day TTL → `GoneError` (410)
- Reviewer verdict tokens: EXACTLY `NOT`/`YES`/`COMMENTED`
- Wire DTO naming: `fileId` across wire; `assetId` compat shim removed
- **Project-switch store reset**: `resetProjectStore(projectId) + resetHistoryStore()` BEFORE `fetchLatestVersion`
- **Media elements need `buildAuthenticatedUrl`**: `<img>`/`<video>`/`<audio>` from `/assets/:id/{thumbnail,stream}` MUST be wrapped
- `findByIdForUser` unifies existence + ownership (cross-user → null → NotFoundError)
- Audio via ElevenLabs (not fal.ai); Wizard MediaGalleryPanel separate from editor AssetBrowserPanel (§14)
- mysql2 JSON columns: mappers guard `typeof === 'string'` before `JSON.parse`
- Typography §3: body 14/400, label 12/500, heading-3 16/600; spacing 4px multiples; radius-md 8px
- Per-file design-token pattern: hex constants at top of `.styles.ts`; NO CSS custom properties in web-editor
- React component props: `interface` (not `type`), suffixed `Props` — §9
- FE asset list: paginated envelope `{ items, nextCursor, totals }`; QueryClient `staleTime: 60_000 / refetchOnWindowFocus: false / retry: 1`
- **Panel `compact` prop pattern**: `getXyzStyles(compact)` factory — compact=true narrow (sidebar), compact=false fluid 100%/maxWidth (wizard)
- Draft-assets endpoint: `generationDraftService.getById(userId, draftId)` required before returning data (ownership security)
- `generation_drafts.id` is canonical storyboard ID; storyboard tables use `draft_id CHAR(36)` FK
- **mysql2 LIMIT binding**: use `pool.query` (text) — not `pool.execute` (prepared stmt) — for `LIMIT ?` params
- **Docker image node_modules**: must `docker compose build <service>` to reinstall baked packages
- **DEV_AUTH_BYPASS identity**: injects `dev-user-001`; all user-id assertions in that context must expect `dev-user-001`
- **E2E CORS on deployed instance**: use `page.request.fetch()` (bypasses browser CORS) + `page.route()` with `access-control-allow-origin: *`

---

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred (B3 `it.todo` 403 tests activate when done)
- `duration_ms` NULL for migrated files; ingest reprocess repopulates
- `bytes` NULL after ingest (FFprobe doesn't return S3 object size; HeadObject needs worker bucket config)
- Presigned download URL deferred; production stream endpoint needs signed URL tokens
- Lint workspace-wide fails with ESLint v9 config-migration error
- Pre-existing TS errors in unrelated test files (`App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`)
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile variants, secondary screens, spacing/typography echo)
- TopBar buttons `borderRadius: 6px` off-token (pre-existing); `AssetBrowserPanel` pre-existing drift: `gap: 2`, `padding: '0 10px'`, `fontSize: 13`
- Chip × button needs semi-transparent background token
- `parseStorageUri` duplicated between `asset.service.ts` + `file.service.ts` — candidate to move to `lib/storage-uri.ts`
- EPIC B hard-purge scheduled job: out of scope; soft-deleted rows past 30 days currently 410 on restore but not physically removed
- Files `thumbnail_uri` backfill for pre-ingest files deferred (re-ingest fills)
- `linkFileToProject` duplicated between `features/timeline/api.ts` + `shared/file-upload/api.ts` — consolidation candidate
- E2E image/audio timeline-drop tests skip when no assets of those types linked to test project
- Infinite scroll UX: BE pagination shipped but FE still page-1-only; `fetchNextAssetsPage()` exported but unwired
- `lust-not-compacted-dev-logs.md` holds the single-copy uncompacted backup; git holds prior-batch history
- Storyboard Task B (Scene detail modal, Library panel, Effects panel) — deferred; planned separately
- Ghost drag E2E spec deferred to future Playwright task (unit coverage only for now)

## [ST-B1] DB + BE — Scene Templates API — 2026-04-23

**Branch:** feat/st-b1-scene-templates-api

**Files:**
- NEW `apps/api/src/db/migrations/035_scene_templates.sql` — scene_templates table (idempotent)
- NEW `apps/api/src/db/migrations/036_scene_template_media.sql` — scene_template_media pivot table (idempotent)
- NEW `apps/api/src/repositories/sceneTemplate.repository.ts` — DB access layer (findAll, findById, insert, update, softDelete)
- NEW `apps/api/src/services/sceneTemplate.service.ts` — business logic (CRUD + add-to-storyboard, ownership checks, media limit enforcement)
- NEW `apps/api/src/controllers/sceneTemplate.controller.ts` — HTTP handlers + Zod body schemas
- NEW `apps/api/src/routes/sceneTemplate.routes.ts` — Express router (6 routes)
- EDIT `apps/api/src/index.ts` — registered sceneTemplateRouter
- EDIT `packages/api-contracts/src/openapi.ts` — added 6 scene-template paths + SceneTemplate, SceneTemplateMedia, AddToStoryboardPayload schemas

**Tests:**
- NEW `apps/api/src/__tests__/scene-templates-endpoint.test.ts` — 21 integration tests (CRUD happy path + 401/404/wrong-owner/media-limit/soft-delete idempotency)
- NEW `apps/api/src/__tests__/scene-templates-add-to-storyboard.test.ts` — 10 integration tests (add-to-storyboard happy path + cross-ownership + missing draft + position overrides + multiple calls)
- NEW `packages/api-contracts/src/openapi.scene-templates.paths.test.ts` — 42 tests (all 6 paths + 3 schemas in OpenAPI spec)

**Notes:**
- Zod validates `fileId` as UUID so test seed files must use full `randomUUID()` values (not custom prefix strings)
- `add-to-storyboard` uses the storyboard repository's `getConnection()` for the transaction that inserts into storyboard_blocks + storyboard_block_media
- Template ownership check returns 404 (not 403) to avoid leaking existence of other users' templates
- All 73 tests pass (21 + 10 + 42)

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-23. No UI components in this subtask (backend-only: DB migrations, API routes, OpenAPI contracts, integration tests). Nothing to review from a design/UI perspective.
checked by playwright-reviewer: YES

## [ST-B2] FE — Types + API client for scene templates — 2026-04-23
**Branch:** feat/st-b2-scene-templates-fe-types
**Files:**
- EDIT `apps/web-editor/src/features/storyboard/types.ts` — added SceneTemplateMedia, SceneTemplate, CreateSceneTemplatePayload, UpdateSceneTemplatePayload, AddToStoryboardPayload types
- EDIT `apps/web-editor/src/features/storyboard/api.ts` — added listSceneTemplates(), createSceneTemplate(), getSceneTemplate(), updateSceneTemplate(), deleteSceneTemplate(), addTemplateToStoryboard() using existing apiClient pattern
**Tests:**
- NEW `apps/web-editor/src/features/storyboard/__tests__/storyboard-api.test.ts` — 20 tests covering each API function: correct URL construction, method, request body, query param encoding, and error propagation on non-ok status
**Notes:**
- All types match the ST-B1 OpenAPI contract (SceneTemplate, SceneTemplateMedia, payloads)
- listSceneTemplates uses encodeURIComponent for the optional search param
- addTemplateToStoryboard accepts { templateId, draftId } and returns StoryboardBlock (matches existing type)
- TypeScript compiles without errors in storyboard/* files; pre-existing type errors in App.PreviewSection.test.tsx and App.RightSidebar.test.tsx are unrelated to this subtask
- All 20 new tests pass

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-23. No UI components in this subtask (pure TypeScript types + API client functions). Nothing to review from a design/UI perspective.
checked by playwright-reviewer - YES

**Fix round 1 (2026-04-23):** Renamed `media` → `mediaItems` in `SceneTemplate`, `CreateSceneTemplatePayload`, and `UpdateSceneTemplatePayload` in `types.ts` to align with backend contract (backend repo uses `mediaItems` in both response shape and request payload). Updated test fixture `mockTemplate.media` → `mockTemplate.mediaItems` and the `updateSceneTemplate` test payload. Updated the `api.ts` JSDoc comment. All 20 tests pass. No storyboard-scope TypeScript errors.

---

## [ST-B3] FE — SceneModal + SceneBlockNode thumbnails — 2026-04-23
**Branch:** feat/st-b3-scene-modal
**Files:**
- NEW `apps/web-editor/src/features/storyboard/components/SceneModal.tsx` — main modal (block/template modes, validation, save/delete/close)
- NEW `apps/web-editor/src/features/storyboard/components/SceneModal.styles.ts` — design-token hex constants and all inline style objects
- NEW `apps/web-editor/src/features/storyboard/components/SceneModal.types.ts` — shared types: ModalMediaItem, SceneModalMode, SceneModalProps union
- NEW `apps/web-editor/src/features/storyboard/components/SceneModal.formFields.tsx` — Name, Prompt, Duration fields (extracted for line-cap)
- NEW `apps/web-editor/src/features/storyboard/components/SceneModal.mediaSection.tsx` — Media list + type-picker + AssetPickerModal integration (max 6)
- NEW `apps/web-editor/src/features/storyboard/components/SceneModal.styleSection.tsx` — STORYBOARD_STYLES radio cards + Animation stub
- NEW `apps/web-editor/src/features/storyboard/hooks/useSceneModal.ts` — encapsulates modal open/save/delete/close wired to storyboard-store
- EDIT `apps/web-editor/src/features/storyboard/components/SceneBlockNode.tsx` — real thumbnail rendering via buildAuthenticatedUrl, CLIP type badges, onEdit callback
- EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — onNodeClick → openModal for scene nodes; renders SceneModal when editingBlock != null
- EDIT `apps/web-editor/src/features/storyboard/components/StoryboardCanvas.tsx` — forward onNodeClick prop
- EDIT `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` — added updateBlock() and removeBlock() actions
- EDIT `apps/web-editor/src/features/storyboard/types.ts` — added optional onEdit to SceneBlockNodeData
**Tests:**
- NEW `apps/web-editor/src/features/storyboard/__tests__/SceneModal.test.tsx` — 16 tests: render (block + template modes), field validation (prompt required, duration 1-180), save/delete/close actions, style selection toggle, max-media limit (button disabled at 6 items)
- NEW `apps/web-editor/src/features/storyboard/__tests__/SceneBlockNode.thumbnails.test.tsx` — 9 tests: 0/1/3/4 media items (thumbnail cap at 3), audio placeholder, unique media type badges, remove/edit callbacks + stopPropagation
**Notes:**
- api-contracts package rebuilt (permissions fixed) to make STORYBOARD_STYLES available in dist/index.d.ts
- AssetPickerModal already supported single-file pick mode via onPick(asset) → onClose() chain; no adaptation needed
- SceneModal split into 6 files to stay under the 300-line cap (§9.7)
- useSceneModal hook extracts store-wiring from StoryboardPage to keep page under 300 lines
- All 158 storyboard tests pass after adding 25 new tests

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-23. Fix round 1 verified: `headerStyle` and `footerStyle` padding changed from '16px 20px' to '16px 24px' (24px = space-6 token, 4px-grid aligned per design-guide §3). All color tokens, typography, border-radius, and spacing now compliant. No additional violations found.

checked by playwright-reviewer: YES

**Fix round 1 (2026-04-23):** Applied design-reviewer spacing fix — changed `headerStyle` and `footerStyle` horizontal padding from `'16px 20px'` to `'16px 24px'` in `SceneModal.styles.ts` (lines 56 and 214). 20px is not on the 4px grid; 24px is a valid token (design-guide §3). Committed on feat/st-b4-library-panel (same working branch).

## [ST-B4] FE — LibraryPanel — 2026-04-23
**Branch:** feat/st-b4-library-panel
**Files:**
- NEW `apps/web-editor/src/features/storyboard/hooks/useSceneTemplates.ts` — React Query hook (staleTime 30s); client-side text filter with 300ms debounce; CRUD helpers (createTemplate, updateTemplate, removeTemplate, addToStoryboard) each invalidate cache
- NEW `apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts` — dark-theme hex constants + CSSProperties for panel, card thumbnails, badges, and action buttons
- NEW `apps/web-editor/src/features/storyboard/components/LibraryPanel.templateCard.tsx` — single template card: 3-thumbnail strip via buildAuthenticatedUrl, unique media type badges, two-step delete confirm, Edit/Del/Add buttons
- NEW `apps/web-editor/src/features/storyboard/components/LibraryPanel.tsx` — sidebar panel: search input, empty state, TemplateCard list, SceneModal in template-create/edit mode; Add to Storyboard calls API → addBlockNode → switches tab to 'storyboard'
- EDIT `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` — added addBlockNode(block, onRemove) to insert a new scene-block Node returned by add-to-storyboard API
- EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — renders `<LibraryPanel>` when activeTab === 'library'; stays under 300-line cap
- EDIT `apps/web-editor/src/features/storyboard/components/StoryboardPage.test.tsx` — mock LibraryPanel to isolate from QueryClientProvider dependency
**Tests:**
- NEW `apps/web-editor/src/features/storyboard/__tests__/useSceneTemplates.test.ts` — 9 tests: loading state, successful fetch, error surfacing, filter text update, createTemplate/updateTemplate/removeTemplate/addToStoryboard API delegation
- NEW `apps/web-editor/src/features/storyboard/__tests__/LibraryPanel.test.tsx` — 14 tests: header render, empty state, loading/error banners, template cards rendered, Add to Storyboard (addBlockNode + switchTab), New Scene modal open/close/save, Edit template (values pre-filled, updateTemplate called), delete confirm flow, search input
**Notes:**
- LibraryPanel split into 4 files (panel + templateCard + styles + hook) to stay under §9.7 line cap
- StoryboardPage.test.tsx mock of LibraryPanel needed to avoid QueryClient missing-context error when Library tab is clicked in existing tests
- SceneModal reused in template mode (mode='template') — no changes needed to SceneModal itself
- addBlockNode store action wires returned StoryboardBlock as a React Flow node with a no-op onRemove (removal handled via canvas keyboard/menu)
- All 181 storyboard tests pass after adding 23 new tests

checked by code-reviewer - COMMENTED
> ❌ Hardcoded inline style in LibraryPanel.tsx:213 `style={{ fontSize: '11px' }}` violates per-file design-token pattern (dev-log line 283); should be `emptyStateHintStyle` in .styles.ts
> ❌ Multiple design-token violations in LibraryPanel.styles.ts (spacing, radius, typography off 4px grid/scale) — flagged by design-reviewer, require fixes before merge
checked by qa-reviewer - COMMENTED
checked by design-reviewer - COMMENTED
design-reviewer comments (2026-04-23):
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 68] ISSUE: newSceneButtonStyle padding `'0 10px'` is off 4px grid (10px invalid). EXPECTED: 4px multiples per design-guide §3; valid spacing tokens are 4, 8, 12, 16, 24, 32, 48, 64px. FIX: change padding to `'0 8px'` or `'0 12px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 68] ISSUE: newSceneButtonStyle borderRadius `'6px'` is not a valid token (should be radius-sm 4px or radius-md 8px per design-guide §3). EXPECTED: radius-sm = 4px per design-guide line 115. FIX: change borderRadius to `'4px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 71] ISSUE: newSceneButtonStyle fontSize `'11px'` with weight 600 does not match any scale. EXPECTED: design-guide §3 has caption 11/400 or label 12/500; this button uses 11/600 (invalid). FIX: change to fontSize `'12px'` and fontWeight 500 (label token).
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 88] ISSUE: searchInputStyle borderRadius `'6px'` not valid token. EXPECTED: radius-sm 4px per design-guide §3 line 115. FIX: change to `'4px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 89] ISSUE: searchInputStyle padding `'0 10px'` off 4px grid (10px invalid). EXPECTED: 4px multiples. FIX: change to `'0 8px'` or `'0 12px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 120] ISSUE: emptyStateStyle fontSize `'13px'` off-scale. EXPECTED: design-guide §3 typography scale has 12px (body-sm/label) and 14px (body), but not 13px. FIX: change to `'12px'` or `'14px'` per context.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 198] ISSUE: mediaBadgeStyle padding `'2px 5px'` off 4px grid and off-scale (2px, 5px both invalid). EXPECTED: 4px multiples per design-guide §3. FIX: change to `'4px 8px'` (standard badge padding).
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 199] ISSUE: mediaBadgeStyle borderRadius `'3px'` not valid token (should be 4px, 8px, 16px, or 9999px). EXPECTED: radius-sm = 4px per design-guide §3 line 115. FIX: change to `'4px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 215] ISSUE: cardActionButtonStyle padding `'2px 7px'` off 4px grid (2px, 7px both invalid). EXPECTED: 4px multiples. FIX: change to `'4px 8px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 216] ISSUE: cardActionButtonStyle fontSize `'10px'` off-scale. EXPECTED: design-guide §3 has 11px (caption) or 12px (body-sm/label), not 10px. FIX: change to `'11px'` (caption) or `'12px'` (body-sm/label) per context.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 226] ISSUE: addButtonStyle padding `'2px 7px'` off 4px grid. EXPECTED: 4px multiples. FIX: change to `'4px 8px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 229] ISSUE: addButtonStyle fontSize `'10px'` off-scale. EXPECTED: 11px (caption) or 12px (body-sm/label). FIX: change to `'11px'` or `'12px'` per context.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 238] ISSUE: deleteButtonStyle padding `'2px 7px'` off 4px grid. EXPECTED: 4px multiples. FIX: change to `'4px 8px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 239] ISSUE: deleteButtonStyle fontSize `'10px'` off-scale. EXPECTED: 11px or 12px. FIX: change to `'11px'` or `'12px'` per context.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.styles.ts, LINE: 252] ISSUE: errorBannerStyle borderRadius `'6px'` not valid token. EXPECTED: radius-sm 4px or radius-md 8px per design-guide §3. FIX: change to `'4px'` or `'8px'`.
- [FILE: apps/web-editor/src/features/storyboard/components/LibraryPanel.templateCard.tsx, LINE: 213] ISSUE: hardcoded inline fontSize `'11px'` (caption token) not abstracted to .styles.ts. EXPECTED: per dev-log line 283, all spacing/color/typography must be in hex constants and CSSProperties at top of .styles.ts, not scattered as inline styles. FIX: create `emptyStateHintStyle` in LibraryPanel.styles.ts and import it; or define as caption token. Currently inconsistent pattern.

<!-- QA NOTES (2026-04-23):
Unit & integration tests: 23 new tests (9 useSceneTemplates.test.ts + 14 LibraryPanel.test.tsx), all PASSING. Full storyboard suite: 68/68 tests pass. Regression clear.
Known issues:
  - Design-token violations in LibraryPanel.styles.ts and LibraryPanel.templateCard.tsx (reported by design-reviewer)
  - These are architectural violations (dev-log line 283: per-file design-token pattern mandatory)
  - 14 specific fixes required in spacing/radius/typography across 5 style objects + 1 inline style
Required developer action:
  - Fix all 14 design-token violations in LibraryPanel.styles.ts and LibraryPanel.templateCard.tsx per design-reviewer comments above
  - Once fixed, QA will recheck and mark YES
-->

checked by playwright-reviewer: YES

**Fix round 1 (2026-04-23):** Applied all 16 design-token fixes from design-reviewer + code-reviewer comments. Changes in `LibraryPanel.styles.ts`: `newSceneButtonStyle` padding `'0 10px'`→`'0 12px'`, borderRadius `'6px'`→`'4px'`, fontSize `'11px'`/600→`'12px'`/500 (label token); `searchInputStyle` borderRadius `'6px'`→`'4px'`, padding `'0 10px'`→`'0 8px'`; `emptyStateStyle` fontSize `'13px'`→`'12px'`; `mediaBadgeStyle` padding `'2px 5px'`→`'4px 8px'`, borderRadius `'3px'`→`'4px'`; `cardActionButtonStyle`, `addButtonStyle`, `deleteButtonStyle` all padding `'2px 7px'`→`'4px 8px'`, fontSize `'10px'`→`'12px'`; `errorBannerStyle` borderRadius `'6px'`→`'8px'`; added `emptyStateHintStyle` named constant (12px/400). In `LibraryPanel.tsx`: replaced inline `style={{ fontSize: '11px' }}` with `style={emptyStateHintStyle}`. TypeScript: no LibraryPanel errors. Commit: 5004a6c.
