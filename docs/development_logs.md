# Development Log (compacted — 2026-03-29 to 2026-04-03)

## Monorepo Scaffold (Epic 1 — Subtask 1)
- added: `package.json`, `turbo.json` — npm workspaces (`apps/*`, `packages/*`), Turborepo pipeline
- added: root `tsconfig.json` — strict TypeScript baseline
- added: `.env.example` — DB, Redis, S3/R2, JWT, OpenAI, API, Vite vars
- added: `.gitignore` — node_modules, dist, .env, .turbo, coverage
- added: `docker-compose.yml` — MySQL 8.0 + Redis 7 Alpine; DB mounts migrations as init scripts
- added: `apps/api/` — Express + helmet + cors + rate-limit; BullMQ queue stubs (`media-ingest`, `render`, `transcription`)
- added: `apps/web-editor/` — React 18 + Vite + QueryClientProvider; feature subdirs
- added: `apps/media-worker/` — BullMQ Worker stub on `media-ingest`
- added: `apps/render-worker/` — BullMQ Worker stub on `render`
- added: `packages/project-schema/` — Zod schemas: `ProjectDoc`, `Track`, `Clip` (discriminated union: `VideoClip | AudioClip | TextOverlayClip`)
- added: `packages/api-contracts/`, `packages/ui/`, `packages/editor-core/` — empty stubs
- added: `packages/remotion-comps/` — `VideoComposition`, `VideoLayer`, `AudioLayer`, `ImageLayer`, `TextOverlayLayer`, `useRemotionEnvironment`
- tested: `clip.schema.test.ts` (14), `project-doc.schema.test.ts` (7)
- fixed: all backend env vars use `APP_` prefix; Zod startup validation + `process.exit(1)` in all backend configs
- fixed: `VITE_PUBLIC_API_BASE_URL` in web-editor config; `zod` dep added to media-worker and render-worker

## DB Migration (Epic 1 — Subtask 2)
- added: `apps/api/src/db/migrations/001_project_assets_current.sql` — `project_assets_current` table (status ENUM, fps DECIMAL, waveform_json JSON); composite index on `(project_id, status)`
- tested: `migration-001.test.ts` — table existence, idempotency, column types, ENUM, index

## Redis + BullMQ Infrastructure (Epic 1 — Subtask 3)
- updated: `docker-compose.yml` — Redis healthcheck
- updated: `apps/api/src/queues/bullmq.ts` — error handlers; removed Worker re-export
- updated: `apps/media-worker/src/index.ts` — error handler, graceful shutdown, `concurrency: 2`
- updated: `apps/render-worker/src/index.ts` — same pattern, `concurrency: 1`
- fixed: `@/` alias + `tsc-alias` in api tsconfig/package.json

## Presigned URL Endpoint (Epic 1 — Subtask 4)
- added: `apps/api/src/lib/errors.ts` — `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`
- added: `apps/api/src/lib/s3.ts` — singleton `S3Client`; `forcePathStyle` for R2
- added: `apps/api/src/types/express.d.ts` — `req.user?: { id, email }`
- added: `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts` (auth-presence stub)
- added: `asset.repository.ts`, `asset.service.ts`, `assets.controller.ts`, `assets.routes.ts`
- added: `POST /projects/:id/assets/upload-url`, `GET /assets/:id`
- tested: `asset.service.test.ts` (13), `assets-endpoints.test.ts` (integration)
- fixed: `sanitizeFilename` strips `..` traversal; `validateBody` on upload-url route; `ConflictError` mapped in error handler

## Asset Finalization + Ingest Enqueue (Epic 1 — Subtask 5)
- added: `apps/api/src/queues/jobs/enqueue-ingest.ts` — `MediaIngestJobPayload` + `enqueueIngestJob()`; jobId=assetId idempotency; 3 retries, exponential backoff
- updated: `asset.service.ts` — `finalizeAsset`: NotFoundError guard, idempotency for `processing`/`ready`, S3 HEAD verify, enqueue
- added: `POST /assets/:id/finalize` + `aclMiddleware('editor')`
- tested: `asset.finalize.service.test.ts` (7), `assets-finalize-endpoint.test.ts` (6)

## Media Worker — Ingest Job (Epic 1 — Subtask 6)
- added: `packages/project-schema/src/types/job-payloads.ts` — `MediaIngestJobPayload` (single source of truth)
- added: `apps/media-worker/src/lib/s3.ts`, `db.ts` — singleton S3Client + mysql2 pool
- added: `apps/media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform peaks → S3 upload → DB `ready`; error path → DB `error`
- added: `apps/media-worker/Dockerfile` — `node:20-alpine` + `apk add ffmpeg`
- updated: `docker-compose.yml` — `media-worker` service
- tested: `ingest.job.test.ts` (11)

## Asset Browser Panel + Upload UI (Epic 1 — Subtask 7)
- added: `apps/web-editor/src/features/asset-manager/types.ts`, `api.ts`, `hooks/useAssetUpload.ts`, `hooks/useAssetPolling.ts`
- added: `AssetCard.tsx`, `AssetDetailPanel.tsx`, `UploadDropzone.tsx`, `UploadProgressList.tsx`, `AssetBrowserPanel.tsx`
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6)

## Docker Services + App Wiring
- added: `apps/api/Dockerfile`, `apps/web-editor/Dockerfile`
- updated: `docker-compose.yml` — `api` (port 3001), `web-editor` (port 5173)
- added: `GET /projects/:id/assets` — returns `[]` for unknown projects; tested (5 integration tests)
- updated: `apps/web-editor/src/main.tsx` — minimal mount; `DEV_PROJECT_ID='dev-project-001'`
- fixed: `workspace:*` → `file:` paths in all package.json files

## EPIC 2 — VideoComposition Fixes
- updated: `VideoComposition.tsx` — z-order sort by track index, muted track filtering, `trimInFrame`→`startFrom` / `trimOutFrame`→`endAt`
- extracted: `VideoComposition.utils.ts` (`prepareClipsForComposition`)
- added: `packages/remotion-comps/vitest.config.ts` — jsdom environment
- added: `VideoComposition.test.tsx` (15), `VideoComposition.utils.test.ts` (7), `VideoComposition.fixtures.ts`

## EPIC 2 — Storybook
- added: `packages/remotion-comps/.storybook/main.ts`, `preview.ts` — react-vite builder, dark theme
- added: `VideoComposition.stories.tsx` — 5 stories: EmptyTimeline, SingleVideoClip, AudioAndVideo, OverlappingClips, TextOverlay

## EPIC 2 — Stores
- added: `apps/web-editor/src/store/project-store.ts` — `useSyncExternalStore` singleton; `getSnapshot()`, `subscribe()`, `setProject()`; dev fixture (30fps, 300 frames, 1920×1080)
- added: `apps/web-editor/src/store/ephemeral-store.ts` — `{ playheadFrame, selectedClipIds, zoom }`; no-op skip on unchanged values
- tested: `project-store.test.ts` (9), `ephemeral-store.test.ts` (14)

## EPIC 2 — PreviewPanel + useRemotionPlayer
- added: `useRemotionPlayer.ts` — subscribes project/ephemeral stores; `useQueries` for asset URLs (dedup, staleTime 5min); returns `{ projectDoc, assetUrls, currentFrame, playerRef }`
- added: `PreviewPanel.tsx` — memoized `inputProps`, Remotion `<Player controls={false}>`, optional `playerRef` prop
- tested: `useRemotionPlayer.test.ts` (11), `PreviewPanel.test.tsx`

## EPIC 2 — PlaybackControls + usePlaybackControls
- added: `usePlaybackControls.ts` — rAF loop mutates `--playhead-frame` CSS property + `setCurrentFrameState`; `play/pause/rewind/stepForward/stepBack/seekTo`; keyboard listeners (Space, Arrows, Home)
- added: `PlaybackControls.tsx` — `role="toolbar"`, SVG icons, scrub slider, frame counter, timecode
- added: `apps/web-editor/src/shared/utils/formatTimecode.ts` — `HH:MM:SS:FF` formatter
- tested: `usePlaybackControls.test.ts` (44), `PlaybackControls.test.tsx` (18), `usePlaybackControls.raf.test.ts` (4)
- added: `usePlaybackControls.fixtures.ts` — `makePlayerRef`/`makeProjectDoc` factories
- fixed: rAF `tick` missing `setCurrentFrameState(frame)` — frame counter/timecode/scrub frozen during playback

## EPIC 2 — Dev Auth Bypass + App Shell
- updated: `auth.middleware.ts`, `acl.middleware.ts` — `NODE_ENV === 'development'` early-return with hardcoded `DEV_USER`
- added: `App.tsx` — two-column shell: 320px `AssetBrowserPanel` + `PreviewSection` + conditional `RightSidebar` (CaptionEditorPanel when text-overlay clip selected)
- updated: `main.tsx` — minimal mount point
- updated: `docs/architecture-rules.md` §3 (App.tsx location), §9 (multi-part test suffix + `.fixtures.ts` rule)
- tested: `App.test.tsx` (10)
- fixed: `docker-compose.yml` — `tsx watch` tsconfig flag order; `NODE_ENV: development` missing from api service
- fixed: `assets.controller.ts` — `serializeAsset()` maps internal shape to API response
- added: `apps/web-editor/.env.local` — `VITE_PUBLIC_API_BASE_URL=http://localhost:3001`
- fixed: `apps/web-editor/.env.test` — port 3000→3001

## Playwright E2E
- added: `@playwright/test` (^1.59.1); `e2e` task in `turbo.json`
- added: `playwright.config.ts` — baseURL `http://localhost:5173`, Chromium, `reuseExistingServer`
- added: `e2e/app-shell.spec.ts` (3), `e2e/preview.spec.ts` (6), `e2e/asset-manager.spec.ts` (10)

## EPIC 3 — Caption Tracks DB Migration
- added: `apps/api/src/db/migrations/002_caption_tracks.sql` — `caption_tracks` table: `caption_track_id CHAR(36) PK`, `asset_id`, `project_id`, `language VARCHAR(10) DEFAULT 'en'`, `segments_json JSON NOT NULL`, `created_at DATETIME(3)`; composite index on `(asset_id, project_id)`; idempotent (`CREATE TABLE IF NOT EXISTS`)
- tested: `migration-002.test.ts` — smoke tests following migration-001 pattern

## EPIC 3 — TranscriptionJobPayload Type
- added: `TranscriptionJobPayload` to `packages/project-schema/src/types/job-payloads.ts` — `{ assetId, storageUri, contentType, language? }`; re-exported from package index
- tested: `job-payloads.test.ts` (4)

## EPIC 3 — Transcription API (BE)
- added: `apps/api/src/queues/jobs/enqueue-transcription.ts` — jobId=assetId idempotency; 3 retries, exponential backoff
- added: `caption.repository.ts` — `insertCaptionTrack()` (`INSERT IGNORE`); `getCaptionTrackByAssetId()` returns null on miss; snake_case→camelCase mapping
- added: `caption.service.ts` — `transcribeAsset()` (NotFoundError/ConflictError 409/enqueue); `getCaptions()` (NotFoundError 404 / return segments)
- added: `captions.controller.ts`, `captions.routes.ts` — POST `/assets/:id/transcribe` → 202; GET `/assets/:id/captions` → 200/404; mounted in `index.ts`
- tested: `caption.service.test.ts` (8), `captions-endpoints.test.ts` (integration, all status codes)

## EPIC 3 — Transcription Worker
- added: `openai ^4.0.0` to `apps/media-worker/package.json`; `APP_OPENAI_API_KEY` to `config.ts`
- added: `apps/media-worker/src/jobs/transcribe.job.ts` — S3 download → Whisper `verbose_json` → map segments (trim text) → `INSERT IGNORE` → DB `ready`; `TranscribeJobDeps` injection for testability
- updated: `apps/media-worker/src/index.ts` — `transcriptionWorker` (`concurrency: 1`); `ingestWorker` rename; parallel shutdown
- tested: `transcribe.job.test.ts` (12)

## EPIC 3 — Captions FE: Types, API, Hook
- added: `apps/web-editor/src/features/captions/types.ts` — `CaptionSegment`, `CaptionTrackStatus`
- added: `apps/web-editor/src/features/captions/api.ts` — `triggerTranscription()`, `getCaptions()` (null on 404)
- added: `useTranscriptionStatus.ts` — React Query poll every 3s; stops when data present or errored; `retry: false`
- tested: `useTranscriptionStatus.test.ts` (7)

## EPIC 3 — TranscribeButton + Add Captions to Timeline
- added: `TranscribeButton.tsx` — state machine: `loading|idle|pending|processing|ready|error|added`; always passes `assetId` to `useTranscriptionStatus` on mount (detects existing captions); `loading` state ("Checking…") while initial fetch in-flight; `added` state ("Captions Added", disabled) after `addCaptionsToTimeline` call
- added: `useAddCaptionsToTimeline.ts` — frame math (startFrame=`Math.round(seg.start*fps)`, durationFrames=`Math.max(1,...)`); `CAPTIONS_TRACK_NAME='Captions'` constant; idempotency guard (skips if "Captions" track already exists)
- updated: `AssetCard.tsx` — `minHeight: 64`, `flexDirection: column`; `TranscribeButton` rendered for ready video/audio assets
- tested: `TranscribeButton.test.tsx` (updated), `useAddCaptionsToTimeline.test.ts` (updated + 3 idempotency tests); total 233 tests pass

## EPIC 3 — Caption Editor Panel
- added: `apps/web-editor/src/features/captions/components/CaptionEditorPanel.tsx` — inspector panel: text (textarea), start/end frame, font size, color (text input), position (select); all mutations via `useCaptionEditor`
- added: `apps/web-editor/src/features/captions/hooks/useCaptionEditor.ts` — per-field handlers; `patchClip` reads latest snapshot via `getSnapshot()`, calls `setProject()`; `setEndFrame` converts absolute frame → `durationFrames` (clamped ≥1)
- updated: `App.tsx` — `RightSidebar` renders `CaptionEditorPanel` when exactly one `text-overlay` clip selected in ephemeral store
- tested: `CaptionEditorPanel.test.tsx` (20), `useCaptionEditor.test.ts`

## Known Issues / TODOs
- ACL middleware is a stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` is a stub — typed API client deferred until OpenAPI spec exists
- `getTypeLabel` duplicated in FE — extract to `src/shared/utils/` if a third consumer appears
- Presigned download URL (`GET /assets/:id/download-url`) deferred to a later epic
- Timeline ruler bi-directional sync deferred to Timeline Editor epic
- S3 CORS policy must be configured on bucket for browser-direct PUT from `http://localhost:5173`
- Assets stay in `processing` until media-worker is running
- Pre-existing TypeScript errors in `PlaybackControls.tsx`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `config.ts` — not introduced by recent work
- `useCaptionEditor` uses object spread instead of Immer `produceWithPatches` — non-blocking but deviates from stated design intent; to be addressed in autosave epic (Epic 4)
