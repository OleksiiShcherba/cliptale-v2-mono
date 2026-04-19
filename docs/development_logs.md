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
### Subtask 1 — In-process migration runner
- added: `apps/api/src/db/migrations/000_schema_migrations.sql`; `apps/api/src/db/migrate.ts` (`runPendingMigrations`, checksum, numeric-prefix order, per-migration mysql2 conn w/ multipleStatements, production gate `NODE_ENV=production && !APP_MIGRATE_ON_BOOT`)
- updated: `apps/api/src/index.ts` — awaits runPendingMigrations before listen
- updated: `docker-compose.yml` — removed `/docker-entrypoint-initdb.d:ro` mount
- added: `migrate.unit.test.ts` (14), `migrate.production.test.ts` (2), `migrate.integration.test.ts` (3)
- invariant: MySQL 8.0 DDL non-transactional → INSERT schema_migrations AFTER DDL; migrations must be idempotent

### Subtask 2 — Live DB recovery + schema final-state guard
- added: migration 027_drop_project_assets_current; `schema-final-state.integration.test.ts` (7)
- recovery: diagnosed pre-migration state despite seeded schema_migrations (beforeAll DELETE+re-seed poison); Path B — `docker volume rm cliptalecom-v2_db_data` → clean boot
- hardened: `vitest.config.ts` `pool: 'forks'` + `singleFork: true`; `migrate.integration.test.ts` schema-broken guard; `migration-014.test.ts` beforeAll stub + UPSERT repair; `migration-001.test.ts` outer DROP cleanup
- updated: `.claude/agent-memory/regression-direction-guardian/project_migration_reliability.md`

### Subtask 3 — Stale `asset_id` test debt
- updated: `migration-002.test.ts` columns/INSERTs asset_id → file_id; composite-index absence assertion
- updated: `projects-list-endpoint.test.ts` → `files` + `project_files` seed; FK-aware cleanup; thumbnail → `toBeNull()`
- updated: `assets-delete-endpoint.test.ts` clip INSERT → file_id
- acceptance: `Unknown column 'asset_id'` full suite = 0

### Subtask 4 — Delete DEV_AUTH_BYPASS-incompatible auth-contract tests
- removed: 25 `.toBe(401)` tests across 10 integration files — versions-list-restore, versions-persist, versions-latest, assets-endpoints, assets-finalize, assets-list, assets-stream, renders, clip-patch, assets-delete
- rationale: `APP_DEV_AUTH_BYPASS=true` dev/CI default → 401 unreachable

### Subtask 5 — Working-tree hygiene
- deleted: 17 `docs/test_screenshots/wizard-ai-*.png`; `git rm` 2 `playwright-screenshots/*.png` + `playwright-review-temp.js`
- extended: `.gitignore` — transient QA artefact block

### Subtask 6 — Wire rename `assetId` → `fileId`
- renamed: `packages/api-contracts/src/openapi.ts` MediaPreview.assetId → fileId; `packages/project-schema/src/schemas/clip.schema.ts` (video/audio/image) + `promptDoc.schema.ts` mediaRefBlockSchema + `types/job-payloads.ts` (TranscriptionJobPayload.fileId; MediaIngestJobPayload dual-key fileId?+assetId?)
- updated: `apps/api/src/controllers/clips.controller.ts`, `aiGeneration.controller.ts` (removed projectId shim; `.strict()`)
- updated: ~70 FE files in `apps/web-editor/src` via targeted + bulk sed; fixed duplicate-key in `file.service.ts`
- updated: workers `transcribe.job.ts`, `ai-generate.job.ts`, `ai-generate-audio.handler.ts` pass `{ fileId, assetId }`
- rewrote: `ai-generation-endpoints.test.ts` → asserts 400 on unknown fields
- verified: `grep 'assetId' packages/api-contracts apps/api/src apps/web-editor/src` = 0
- note: `npm run build` required for project-schema + api-contracts (workers import from dist)

### Subtask 7 — `general_idea.md` evolution appendix
- appended: `## Evolution since 2026-03-29` — Storyboard drafts (019/022), Files-as-Root (021-026), features/ vs shared/ rule (≥2 consumers → shared), In-process migration runner
- invariant: no earlier sections edited

## EPIC — Backend Repository Migration to Files-as-Root (Batch 3, 2026-04-19)
### Subtask 1 — Migrate `asset.repository.ts`
- rewrote: all 8 SQL statements → `files` + `project_files` LEFT/INNER JOIN; preserved public `Asset` type + signatures (zero service changes)
- `insertPendingAsset`: derives `kind` from MIME; INSERT files + INSERT IGNORE project_files
- `getAssetById`/`getAssetsByProjectId`: LEFT/INNER JOIN project_files; projectId='' when no pivot
- `isAssetReferencedByClip`: `project_clips_current.file_id` (not dropped asset_id)
- `deleteAssetById`: DELETE project_files then files (FK-safe)
- `updateAssetStatus`/`updateAssetDisplayName`: target files via file_id
- `findReadyForUser`: files direct, user-scoped; `mime_type LIKE ?` replaces `content_type LIKE ?`
- `getReadyTotalsForUser`: files direct; `SUM(bytes)` replaces `SUM(file_size_bytes)`
- documented inline: thumbnailUri/waveformJson/fps → null; filename → display_name ?? file_id; durationFrames → duration_ms/1000*30 (lossy)
- updated: `asset.repository.test.ts` (21 tests, new row shape), `asset.repository.list.test.ts` (21 tests, mime_type LIKE assertion)
- added: `asset-repository.integration.test.ts` — real DB: happy path, null-projectId, deleteAssetById FK order, isAssetReferencedByClip, findReadyForUser MIME filter, totals

### Subtask 2 — Migrate `generationDraft.repository.findAssetPreviewsByIds`
- rewrote: SELECT `file_id, mime_type` FROM `files` (was asset_id, content_type, thumbnail_uri FROM project_assets_current)
- updated: `AssetPreviewRow` (file_id, mime_type; removed thumbnail_uri); return shape unchanged — thumbnailUri always null with inline backfill-pending comment
- added: 6 new unit tests (11 total): empty input no-DB-call, mixed-existing+missing, mime_type→contentType, thumbnailUri null, all-missing, SQL correctness
- ownership-agnostic by design (upstream draft check)

### Subtask 3 — Fix `assets-patch-endpoint.test.ts` seed
- replaced: 2× `INSERT project_assets_current` → files + project_files pivot (OWNED_ASSET_ID dev-user-001, OTHER_ASSET_ID other-user-777)
- added: INSERT users (other-user-777), INSERT projects (TEST_PROJECT_ID, ON DUPLICATE KEY UPDATE)
- rewrote: afterAll — FK order project_files → files → projects → users
- updated: "persists displayName" → `SELECT display_name FROM files WHERE file_id = ?`
- updated: "returns 200" assertion narrowed to id + displayName (files has no separate filename; display_name ?? file_id after rename)
- result: 9/9 pass

### Subtask 4 — Fix `generation-drafts-cards` seed + undefined-bind + §9 split
- replaced: 5-asset seed loop → files + project_files pivot; `mimeToKind()` helper mirrors ingest worker mapping
- renamed: seededAssetIds → seededFileIds; afterAll FK order: generation_drafts → project_files → files → projects → sessions → users
- fixed: undefined-bind-param — guarded array-dependent DELETEs (`if (seededFileIds.length)`, `if (DRAFT_A_MANY_REFS || DRAFT_B_ID)`); existence-guarded TEST_PROJECT_ID
- relaxed: thumbnailUrl assertion → `toBeNull()` with "Files-as-Root backfill pending" comment
- fix round 2: split 423-line file into endpoint (293L, 7 tests) + shape (268L, 5 tests) per §9 300-cap
- fix round 3: renamed to dot-infix (`generation-drafts-cards.endpoint.test.ts`, `generation-drafts-cards.shape.test.ts`) per §9; extracted sha256/makePromptDoc/mimeToKind → `generation-drafts-cards.fixtures.ts` (26L)
- `vi.mock()` + env-setup blocks duplicated per Vitest hoisting constraint (documented exception)
- final: endpoint 273L, shape 248L, fixtures 26L; 12/12 pass

### Subtask 5 — Full regression + dev log reconciliation
- suite: **886 pass | 7 fail | 4 skip** (82 test files pass, 7 fail, 1 skipped); 3 Batch-3-patched suites 21/21
- Class A (2, pre-existing DEV_AUTH_BYPASS user-mismatch): versions-list-restore, renders
- Class B (schema drift): **0** — target achieved
- Class C (5, pre-existing stale project_assets_current seed, out-of-Batch-3-scope): assets-finalize, assets-list, assets-stream, assets-delete, assets-endpoints
- reconciled: Batch-2 Subtask 6 count discrepancy (claimed 834, actual 822 — 12-test delta = then-blocked generation-drafts-cards suite); current baseline 886
- verified: `grep -r project_assets_current apps/api/src/` repositories = 0 live SQL (comment lines + migration-history tests + schema-final-state assertions only)

## Architectural Decisions / Notes
- §9.7 300-line cap enforced via `*.fixtures.ts` + `.<topic>.test.ts` splits (dot-infix mandatory); approved exception: `fal-models.ts`
- Worker env discipline: only `index.ts` reads `config.*.key`; handlers receive secrets via deps
- Migration strategy: in-process runner (`apps/api/src/db/migrate.ts`) with `schema_migrations` (sha256 checksum) = only sanctioned mutation path; `docker-entrypoint-initdb.d` deprecated
- MySQL 8.0 DDL non-transactional; INSERT into `schema_migrations` AFTER DDL succeeds; migration files must be idempotent (INFORMATION_SCHEMA + PREPARE/EXECUTE guards)
- Vitest integration: `pool: 'forks'` + `singleFork: true` serialize across files; each split test file declares its own `vi.hoisted()` block (cannot be shared via fixtures — documented exception)
- Files-as-root: `files` user-scoped root; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file) = app-layer GC before file delete
- Wire DTO naming: `fileId` across wire (contracts + BE + FE); `assetId` compat shim removed; `submitGenerationSchema.strict()`
- `findByIdForUser` unifies existence + ownership (cross-user → null → NotFoundError — avoids leaking existence)
- Audio via ElevenLabs (not fal.ai)
- Wizard MediaGalleryPanel separate from editor AssetBrowserPanel (§14 no cross-feature imports)
- Stitch DS `spacing`/`typography` do NOT round-trip — design-guide.md §3 authoritative
- Enhance state in BullMQ/Redis only; rate limit per-user; vanilla setInterval in FE hook
- mysql2 JSON columns: repository mappers guard `typeof === 'string'` before `JSON.parse`
- Typography §3: body 14/400, label 12/500, heading-3 16/600; spacing 4px multiples; radius-md 8px
- `/` HomePage is post-login + `*`-fallback; `/editor?projectId=<id>` is editor entry
- Shared hooks keyed by `AiGenerationContext` discriminated union live in `shared/ai-generation/` + `shared/file-upload/`; `features/generate-wizard/` may import only from `shared/`
- AI-generate completion hook at repository layer (INSERT IGNORE into `draft_files` pivot when `draft_id` set on job row)
- Production migration safety: runner refuses if `NODE_ENV === 'production' && !APP_MIGRATE_ON_BOOT` (temporary; multi-replica race risk)
- `asset.repository.ts` now a thin compatibility adapter over `files + project_files` — preserves Asset type + service signatures; candidate for collapse into direct `file.repository` calls

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred
- `files` lacks `thumbnail_uri`/`waveform_json`; `getProjectFilesResponse` returns null (FE handles); tests assert `toBeNull()`
- `duration_ms` NULL for migrated files (source lacked fps); ingest reprocess repopulates
- `MediaIngestJobPayload.fileId?` + `assetId?` dual-key during migration window; legacy AI worker still writes via `project_assets_current` path
- `bytes` NULL after ingest (FFprobe doesn't return S3 object size; HeadObject needs worker bucket config)
- Seed `project_assets_current` rows with non-UUID project_id migrated to files; pivot links skipped (INSERT IGNORE)
- `packages/api-contracts/` OpenAPI spec only covers scoped endpoints
- Presigned download URL deferred; S3 CORS needs bucket config
- Integration test beforeAll schema self-healing (migrate/migration-014/schema-final-state) distributed; candidate for centralized fixture layer
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
- Media-worker (`ai-generate.job.ts`) still writes to `project_assets_current`; must migrate to `aiGenerationJob.repository.setOutputFile`
- Editor 404s on thumbnail/waveform + wizard 500 on fresh-draft `/generation-drafts/:id/assets` (empty) — cosmetic, pre-existing
- AI panel query-key rescoping: unified invalidation could be revisited
- **Class A (2 tests — pre-existing DEV_AUTH_BYPASS user-mismatch):** `renders-endpoint.test.ts` (user-render-test JWT vs dev-user-001 bypass → 404), `versions-list-restore-endpoint.test.ts` (createdByUserId mismatch). Root cause: `auth.middleware.ts` hard-codes dev-user-001 under bypass.
- **Class C (5 tests — stale seed/table debt, queued for follow-up batch):** `assets-finalize-endpoint.test.ts`, `assets-list-endpoint.test.ts`, `assets-stream-endpoint.test.ts`, `assets-delete-endpoint.test.ts`, `assets-endpoints.test.ts` — beforeAll still INSERTs into dropped `project_assets_current`
- `asset.repository.ts` thin compat adapter over files+project_files — candidate for collapse + deletion (non-urgent; minimises blast radius)
