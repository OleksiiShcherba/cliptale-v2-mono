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
- tested: `clip.schema.test.ts` (14 cases), `project-doc.schema.test.ts` (7 cases)
- fixed: all backend env vars use `APP_` prefix; Zod startup validation + `process.exit(1)` in all backend configs
- fixed: `VITE_PUBLIC_API_BASE_URL` in web-editor config; added `zod` dep to media-worker and render-worker

## DB Migration (Subtask 2)
- added: `apps/api/src/db/migrations/001_project_assets_current.sql` — `project_assets_current` table with full column set (status ENUM, fps DECIMAL, waveform_json JSON, etc.)
- added: composite index `idx_project_assets_project_status` on `(project_id, status)`
- tested: `migration-001.test.ts` — table existence, idempotency, column types, ENUM default/rejection, index presence

## Redis + BullMQ Infrastructure (Subtask 3)
- updated: `docker-compose.yml` — Redis healthcheck
- updated: `apps/api/src/queues/bullmq.ts` — error handlers; removed Worker re-export
- updated: `apps/media-worker/src/index.ts` — error handler, graceful shutdown, `concurrency: 2`
- updated: `apps/render-worker/src/index.ts` — same pattern, `concurrency: 1`
- fixed: `@/` alias + `tsc-alias` added to api tsconfig/package.json

## Presigned URL Endpoint (Subtask 4)
- added: `apps/api/src/lib/errors.ts` — `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`
- added: `apps/api/src/lib/s3.ts` — singleton `S3Client`; `forcePathStyle` for R2
- added: `apps/api/src/types/express.d.ts` — `req.user?: { id, email }`
- added: `apps/api/src/middleware/validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts` (auth-presence stub)
- added: `apps/api/src/repositories/asset.repository.ts`, `services/asset.service.ts`, `controllers/assets.controller.ts`, `routes/assets.routes.ts`
- added: `POST /projects/:id/assets/upload-url`, `GET /assets/:id`
- tested: `asset.service.test.ts` (13), `assets-endpoints.test.ts` (integration)
- fixed: `sanitizeFilename` strips `..` traversal; `validateBody` added to upload-url route; `ConflictError` mapped in error handler

## Asset Finalization + Ingest Enqueue (Subtask 5)
- added: `apps/api/src/queues/jobs/enqueue-ingest.ts` — `MediaIngestJobPayload` + `enqueueIngestJob()`; jobId=assetId idempotency; 3 retries, exponential backoff
- updated: `asset.service.ts` — `finalizeAsset`: NotFoundError guard, idempotency for `processing`/`ready`, S3 HEAD verify, enqueue
- added: `POST /assets/:id/finalize` + `aclMiddleware('editor')`
- tested: `asset.finalize.service.test.ts` (7), `assets-finalize-endpoint.test.ts` (6)

## Media Worker — Ingest Job (Subtask 6)
- added: `packages/project-schema/src/types/job-payloads.ts` — `MediaIngestJobPayload` (single source of truth)
- added: `apps/media-worker/src/lib/s3.ts`, `db.ts` — singleton S3Client + mysql2 pool
- added: `apps/media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform peaks → S3 upload → DB `ready`; error path → DB `error`
- added: `apps/media-worker/Dockerfile` — `node:20-alpine` + `apk add ffmpeg`
- updated: `docker-compose.yml` — `media-worker` service
- tested: `ingest.job.test.ts` (11)

## Asset Browser Panel + Upload UI (Subtask 7)
- added: `apps/web-editor/src/features/asset-manager/types.ts`, `api.ts`, `hooks/useAssetUpload.ts`, `hooks/useAssetPolling.ts`
- added: `components/AssetCard.tsx`, `AssetDetailPanel.tsx`, `UploadDropzone.tsx`, `UploadProgressList.tsx`, `AssetBrowserPanel.tsx`
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6)

## Docker Services + App Wiring
- added: `apps/api/Dockerfile`, `apps/web-editor/Dockerfile`
- updated: `docker-compose.yml` — `api` (port 3001), `web-editor` (port 5173)
- added: `GET /projects/:id/assets` — returns `[]` for unknown projects; tested (5 integration tests)
- updated: `apps/web-editor/src/main.tsx` — mounted `AssetBrowserPanel` with hardcoded `DEV_PROJECT_ID='dev-project-001'`
- fixed: `workspace:*` → `file:` paths in all package.json files (npm doesn't support pnpm workspace protocol)

## EPIC 2 — VideoComposition Fixes (Subtask 1)
- updated: `packages/remotion-comps/src/compositions/VideoComposition.tsx` — z-order sort by track array index, muted track filtering, `trimInFrame`→`startFrom` / `trimOutFrame`→`endAt` passthrough
- extracted: sort/filter logic to `VideoComposition.utils.ts` (`prepareClipsForComposition`) per §5
- added: `packages/remotion-comps/vitest.config.ts` — jsdom environment
- added: `VideoComposition.test.tsx` (15 tests), `VideoComposition.utils.test.ts` (7 tests)
- added: `VideoComposition.fixtures.ts` — extracted fixture helpers from test file

## EPIC 2 — Storybook for remotion-comps (Subtask 2)
- added: `packages/remotion-comps/.storybook/main.ts`, `preview.ts` — react-vite builder, dark theme backgrounds
- added: `packages/remotion-comps/src/stories/VideoComposition.stories.tsx` — 5 stories: EmptyTimeline, SingleVideoClip, AudioAndVideo, OverlappingClips, TextOverlay
- added: `storybook`, `build-storybook` scripts to `packages/remotion-comps/package.json`

## EPIC 2 — Stores (Subtask 3)
- added: `apps/web-editor/src/store/project-store.ts` — `useSyncExternalStore`-based singleton; `getSnapshot()`, `subscribe()`, `setProject()`, dev fixture (30fps, 300 frames, 1920×1080)
- added: `apps/web-editor/src/store/ephemeral-store.ts` — `{ playheadFrame, selectedClipIds, zoom }`; `setPlayheadFrame`/`setZoom` skip notify on no-op to prevent unnecessary re-renders
- tested: `project-store.test.ts` (9), `ephemeral-store.test.ts` (14)

## EPIC 2 — PreviewPanel + useRemotionPlayer (Subtask 4)
- added: `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts` — subscribes project/ephemeral stores; `useQueries` for asset URLs (dedup by assetId, staleTime 5min); returns `{ projectDoc, assetUrls, currentFrame, playerRef }`
- added: `apps/web-editor/src/features/preview/components/PreviewPanel.tsx` — memoized `inputProps`, Remotion `<Player controls={false}>`, optional external `playerRef` prop
- tested: `useRemotionPlayer.test.ts` (11), `PreviewPanel.test.tsx`

## EPIC 2 — PlaybackControls + usePlaybackControls (Subtask 5)
- added: `apps/web-editor/src/features/preview/hooks/usePlaybackControls.ts` — rAF loop mutates `--playhead-frame` CSS property; `play()`, `pause()`, `rewind()`, `stepForward()`, `stepBack()`, `seekTo()`; keyboard listeners (Space, Arrow keys, Home)
- added: `apps/web-editor/src/features/preview/components/PlaybackControls.tsx` — `role="toolbar"`, inline SVG icons, scrub slider, frame counter, timecode; styled per design-guide
- added: `apps/web-editor/src/shared/utils/formatTimecode.ts` — `HH:MM:SS:FF` formatter
- tested: `usePlaybackControls.test.ts` (44), `PlaybackControls.test.tsx` (18)

## EPIC 2 — Dev Auth Bypass (Subtask 6)
- updated: `apps/api/src/middleware/auth.middleware.ts` — `NODE_ENV === 'development'` early-return attaches hardcoded `DEV_USER`; production JWT path unchanged
- updated: `apps/api/src/middleware/acl.middleware.ts` — `NODE_ENV === 'development'` early-return; production unchanged
- tested: 2 bypass tests added to each middleware test file

## EPIC 2 — App Shell Wiring (Subtask 7)
- added: `apps/web-editor/src/App.tsx` — two-column shell: 320px `AssetBrowserPanel` aside + `PreviewSection` (PreviewPanel + PlaybackControls stacked)
- updated: `apps/web-editor/src/main.tsx` — minimal mount point only (imports `App`, calls `createRoot`)
- updated: `docs/architecture-rules.md` §3 — documented `App.tsx` at web-editor src root
- tested: `App.test.tsx` (10 behavior-focused tests; CSS assertions removed per §10)

## EPIC 2 — Bug Fix: rAF Loop Frame Updates
- fixed: `usePlaybackControls.ts` rAF `tick` missing `setCurrentFrameState(frame)` — frame counter, timecode, scrub slider frozen during playback
- updated: JSDoc on `usePlaybackControls` to reflect both CSS and state update
- added: `usePlaybackControls.raf.test.ts` (4), `usePlaybackControls.seek.test.ts` refactored
- added: `usePlaybackControls.fixtures.ts` — shared `makePlayerRef`/`makeProjectDoc` factories
- updated: `docs/architecture-rules.md` §9 — multi-part test suffix + `.fixtures.ts` co-location rule

## EPIC 2 — Dev Fixture: Visible Preview Content
- updated: `apps/web-editor/src/store/project-store.ts` — added `TextOverlayClip` (`text: 'ClipTale'`, fontSize 64, center, 0–300 frames) + matching overlay track to `DEV_PROJECT`

## Docker + API Runtime Fixes
- fixed: `docker-compose.yml` — `tsx watch` tsconfig flag order; `NODE_ENV: development` missing from api service
- fixed: `apps/api/src/controllers/assets.controller.ts` — `serializeAsset()` maps internal shape to API response: `assetId→id`, S3 URI→HTTPS URL, `durationFrames+fps→durationSeconds`, `waveformJson→waveformPeaks`, Date→ISO string
- added: `apps/web-editor/.env.local` — `VITE_PUBLIC_API_BASE_URL=http://localhost:3001`
- fixed: `apps/web-editor/.env.test` — corrected port 3000→3001

## Playwright E2E Setup (Subtask 1)
- added: `@playwright/test` (^1.59.1) to root devDependencies; `"e2e": "playwright test"` script
- added: `e2e` task to `turbo.json` (dependsOn `^build`, cache disabled, `"outputs": []`)
- added: `playwright.config.ts` — baseURL `http://localhost:5173`, Chromium only, `reuseExistingServer: true`, `webServer` auto-starts Vite
- added: `e2e/.gitkeep` — ensures testDir exists
- fixed: removed `fullyParallel: true` (contradicted `workers: 1`); changed webServer command to `npm run dev -w apps/web-editor`

## Playwright E2E Tests (Subtask 2)
- added: `e2e/app-shell.spec.ts` — 3 smoke tests: sidebar + preview panels visible, no uncaught JS errors
- added: `e2e/preview.spec.ts` — 6 tests: player container, play/pause toggle, timecode `HH:MM:SS:FF` pattern, scrubber, frame counter; `test.setTimeout(60_000)`
- added: `e2e/asset-manager.spec.ts` — 10 tests: panel, filter tabs, search bar, empty-state, upload button, dialog open/close
- fixed: `getByRole('generic')` → `getByLabel()` for timecode/frame elements (headless reliability); `isVisible().catch()` → `(await locator.count()) > 0`

## Known Issues / TODOs
- ACL middleware is a stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` is a stub — typed API client deferred until OpenAPI spec exists
- `getTypeLabel` duplicated in FE — extract to `src/shared/utils/` if a third consumer appears
- Presigned download URL (`GET /assets/:id/download-url`) deferred to a later epic; `storage_uri` used directly for now
- Timeline ruler bi-directional sync deferred to Timeline Editor epic
- S3 CORS policy must be configured on the bucket to allow PUT from `http://localhost:5173` for browser-direct uploads to work
- Assets stay in `processing` state until media-worker ingest job processes them (worker must be running)
