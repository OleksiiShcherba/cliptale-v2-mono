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

---

## [2026-04-03]

### Task: EPIC 3 — AI Captions / Auto-Subtitles
**Subtask:** 1. DB Migration — `caption_tracks` table

**What was done:**
- Created `apps/api/src/db/migrations/002_caption_tracks.sql` — idempotent `CREATE TABLE IF NOT EXISTS` for `caption_tracks` with `caption_track_id CHAR(36) PK`, `asset_id CHAR(36) NOT NULL`, `project_id CHAR(36) NOT NULL`, `language VARCHAR(10) NOT NULL DEFAULT 'en'`, `segments_json JSON NOT NULL`, `created_at DATETIME(3)`, and composite index `idx_caption_tracks_asset_project` on `(asset_id, project_id)`
- Created `apps/api/src/__tests__/integration/migration-002.test.ts` — integration smoke tests following the `migration-001.test.ts` pattern

**Notes:**
- Test requires a live MySQL instance; uses `APP_DB_*` env vars with docker-compose defaults as fallbacks
- `segments_json` is `NOT NULL` — the table never stores a row without segment data; an in-progress transcription is represented by the absence of a row (404 from the API), not a null column
- TypeScript compilation passes cleanly (`tsc --noEmit` on the API project)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 1. DB Migration — caption_tracks table</summary>

- What: Create `apps/api/src/db/migrations/002_caption_tracks.sql` with the `caption_tracks` table and a migration test.
- Where: `apps/api/src/db/migrations/`, `apps/api/src/db/migrations/__tests__/migration-002.test.ts`
- Why: Stores Whisper transcript segments (as JSON) per asset; required by the service layer before any other subtask can be tested end-to-end.
- Schema: `caption_track_id CHAR(36) PK`, `asset_id CHAR(36) NOT NULL`, `project_id CHAR(36) NOT NULL`, `language VARCHAR(10) NOT NULL DEFAULT 'en'`, `segments_json JSON NOT NULL`, `created_at DATETIME(3)`. Index on `(asset_id, project_id)`. Idempotent (`CREATE TABLE IF NOT EXISTS`).
- Depends on: none

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES

---

## [2026-04-03]

### Task: EPIC 3 — AI Captions / Auto-Subtitles
**Subtask:** 2. `TranscriptionJobPayload` type

**What was done:**
- Added `TranscriptionJobPayload` to `packages/project-schema/src/types/job-payloads.ts` with fields: `assetId: string`, `storageUri: string`, `contentType: string`, `language?: string`
- Re-exported `TranscriptionJobPayload` from `packages/project-schema/src/index.ts` alongside existing `MediaIngestJobPayload`
- Created `packages/project-schema/src/types/job-payloads.test.ts` — 4 tests covering happy path (all fields, no language), explicit language, undefined language, and MediaIngestJobPayload regression check

**Notes:**
- This is a pure TypeScript type addition — no Zod schema needed (payloads are not validated at a runtime API boundary; they are produced and consumed in trusted code paths)
- `language` is optional (`?`) so callers can omit it; the worker will pass it directly to Whisper and Whisper defaults to auto-detection when undefined
- TypeScript compilation passes clean (`tsc --noEmit`)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 2. TranscriptionJobPayload type</summary>

- What: Add `TranscriptionJobPayload` to `packages/project-schema/src/types/job-payloads.ts` and re-export it from the package index.
- Where: `packages/project-schema/src/types/job-payloads.ts`, `packages/project-schema/src/index.ts`
- Why: Single source of truth for the payload shape used by both the API (enqueue side) and the media-worker (consume side). Must exist before either side is implemented.
- Shape: `{ assetId: string; storageUri: string; contentType: string; language?: string }`.
- Depends on: none

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-03. No UI changes in this subtask — pure TypeScript type addition with no visual, layout, color, typography, or component impact. Design review not applicable; auto-approved.

---

## [2026-04-03]

### Task: EPIC 3 — AI Captions / Auto-Subtitles
**Subtask:** 3. BE — Transcription enqueue helper + caption repository/service/routes

**What was done:**
- Created `apps/api/src/queues/jobs/enqueue-transcription.ts` — follows `enqueue-ingest.ts` pattern; uses `assetId` as BullMQ `jobId` for idempotency; 3 retries, exponential backoff; returns the job ID string
- Created `apps/api/src/repositories/caption.repository.ts` — `insertCaptionTrack()` with `INSERT IGNORE` for idempotency; `getCaptionTrackByAssetId()` returns null when no track exists yet; maps snake_case DB rows to camelCase TS types; handles both string and parsed JSON for `segments_json`
- Created `apps/api/src/services/caption.service.ts` — `transcribeAsset()` (NotFoundError if asset missing, ConflictError 409 if track exists, enqueue job, return `{ jobId }`); `getCaptions()` (NotFoundError 404 if no track, return `{ segments }`)
- Created `apps/api/src/controllers/captions.controller.ts` — thin parse/delegate; `transcribeAsset` returns 202, `getCaptions` returns 200
- Created `apps/api/src/routes/captions.routes.ts` — POST `/assets/:id/transcribe` (auth + acl editor) → 202; GET `/assets/:id/captions` (auth) → 200 or 404
- Updated `apps/api/src/index.ts` — mounted `captionsRouter` alongside `assetsRouter`
- Created `apps/api/src/services/caption.service.test.ts` — 8 unit tests (transcribeAsset: happy path, payload shape, NotFoundError, ConflictError, propagates DB errors; getCaptions: returns segments, NotFoundError, propagates DB errors)
- Created `apps/api/src/__tests__/integration/captions-endpoints.test.ts` — integration tests covering all HTTP status codes for both endpoints (401, 404, 409, 202, 200); BullMQ mocked to avoid Redis dependency; seeds real MySQL rows for fixture data

**Notes:**
- `transcriptionQueue.add()` is called with `jobId: assetId` so the returned `job.id` always equals `assetId` — the service returns this as `{ jobId }`
- `getCaptionTrackByAssetId` returns `null` (not an empty array) to signal "not yet transcribed"; the FE uses the 404 status to distinguish this case
- `INSERT IGNORE` in `insertCaptionTrack` means the worker side (subtask 4) is safe to call this even if a race condition causes two completions for the same asset
- TypeScript compiles clean (`tsc --noEmit` on api project passes with 0 errors)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 3. BE — Transcription enqueue helper + caption repository/service/routes</summary>

- What: Build the full API slice: `enqueue-transcription.ts` job helper, `caption.repository.ts` (insert/get by assetId), `caption.service.ts` (enqueue + 409 guard), `captions.controller.ts` (thin parse/delegate), `captions.routes.ts` (POST `/assets/:id/transcribe` → 202, GET `/assets/:id/captions`), wired into `apps/api/index.ts`.
- Acceptance: POST returns `{ jobId }` with 202; GET returns `{ segments: [{start, end, text}] }` when ready, 404 when not yet transcribed; POST returns 409 if transcript already exists.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-03. No UI changes in this subtask — entirely backend API code (BullMQ enqueue helper, DB repository, service layer, HTTP controllers, Express routes). No visual, layout, color, typography, or component impact. Design review not applicable; auto-approved.

---

## [2026-04-03]

### Task: EPIC 3 — AI Captions / Auto-Subtitles
**Subtask:** 4. Media Worker — `transcribe.job.ts`

**What was done:**
- Added `"openai": "^4.0.0"` to `apps/media-worker/package.json` dependencies
- Updated `apps/media-worker/src/config.ts` — added `APP_OPENAI_API_KEY` env var (Zod validation, `config.openai.apiKey` accessor)
- Created `apps/media-worker/src/jobs/transcribe.job.ts` — BullMQ job handler following `ingest.job.ts` pattern: downloads asset from S3 to temp file (using `origFilename` from storage key so Whisper gets the right extension), calls OpenAI Whisper API with `response_format: 'verbose_json'`, maps `segments[]` to `CaptionSegment[]` (with text trimming), inserts via `INSERT IGNORE`, cleans up temp dir in finally block; uses `TranscribeJobDeps` injection for testability
- Updated `apps/media-worker/src/index.ts` — added `transcriptionWorker` (BullMQ `Worker` on `QUEUE_TRANSCRIPTION`, `concurrency: 1`), renamed `worker` → `ingestWorker`, updated `shutdown()` to close both workers in parallel
- Created `apps/media-worker/src/jobs/transcribe.job.test.ts` — 12 unit tests covering: happy path segment insertion with trim, language forwarded to Whisper, language omitted when not in payload, INSERT IGNORE used, 'auto' stored when language undefined, NotFoundError when asset missing from DB, S3 failure re-throws for retry, Whisper API failure re-throws for retry, temp dir cleaned on error, empty segments handled gracefully

**Notes:**
- `createReadStream` is cast to `unknown as File` to satisfy the OpenAI SDK's TypeScript overload resolution; at runtime the SDK accepts `ReadStream` via its Node.js path
- `INSERT IGNORE` in the worker mirrors the repository layer — safe if two job completions race for the same asset
- Concurrency is set to `1` for the transcription worker (Whisper calls are slow and expensive)
- `origFilename` extracted from `path.basename(key)` ensures Whisper receives a filename with the correct extension (e.g. `video.mp4`) for format detection

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 4. Media Worker — transcribe.job.ts</summary>

- What: Implement the BullMQ job handler that downloads the asset from S3, sends it to the OpenAI Whisper API, parses segments[], inserts into caption_tracks, and handles errors with retry. Wire it into apps/media-worker/src/index.ts.
- Depends on: Subtask 1, Subtask 2, Subtask 3 (repo for DB insert)

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-03. No UI changes in this subtask — entirely backend/worker code (BullMQ job handler, env config, worker wiring, unit tests). No visual, layout, color, typography, or component impact. Design review not applicable; auto-approved.

---

## [2026-04-03]

### Task: EPIC 3 — AI Captions / Auto-Subtitles
**Subtask:** 5. FE — Captions feature: types, api.ts, `useTranscriptionStatus` hook

**What was done:**
- Created `apps/web-editor/src/features/captions/types.ts` — `CaptionSegment` (`start, end, text`) and `CaptionTrackStatus` (`idle | pending | processing | ready | error`) types
- Created `apps/web-editor/src/features/captions/api.ts` — `triggerTranscription(assetId)` (POST /assets/:id/transcribe → 202 `{ jobId }`); `getCaptions(assetId)` (GET /assets/:id/captions → `{ segments }` or `null` on 404; throws on other errors) — both go through `apiClient`
- Created `apps/web-editor/src/features/captions/hooks/useTranscriptionStatus.ts` — React Query `useQuery` polls every 3s; `refetchInterval` returns `false` when data is present (ready) or query errored; `retry: false` so 404 is not retried; status derived as `ready` | `error` | `idle`
- Created `apps/web-editor/src/features/captions/hooks/useTranscriptionStatus.test.ts` — 7 unit tests: idle (404), ready (200 with segments), error (non-404 throw), disabled when assetId null, correct assetId forwarded, poll-to-ready transition via queryClient.refetchQueries, isFetching true on in-flight

**Notes:**
- `getCaptions` returns `null` (not throws) on 404 so React Query treats "not yet transcribed" as empty data, not an error
- `CaptionTrackStatus` includes `pending` and `processing` for use by the component (subtask 6); the hook itself only sets `idle`, `ready`, or `error` — consumers track `pending` locally after calling `triggerTranscription`
- The shared `queryClient` pattern in tests (destructuring `{ Wrapper, queryClient }`) allows forcing re-fetches without fake timers

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 5. FE — Captions feature: types, api.ts, useTranscriptionStatus hook</summary>

- What: Define CaptionSegment, CaptionTrackStatus types; implement api.ts (triggerTranscription, getCaptions); implement useTranscriptionStatus hook (React Query poll on /assets/:id/captions every 3s while status is not ready).
- Depends on: Subtask 3 (endpoints must be specced)

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-03. No UI changes in this subtask — entirely TypeScript types, API functions, and a React Query hook with no JSX or visual output. No visual, layout, color, typography, or component impact. Design review not applicable; auto-approved.

---

## [2026-04-03]

### Task: EPIC 3 — AI Captions / Auto-Subtitles
**Subtask:** 6. FE — "Transcribe" button + "Add Captions to Timeline" action

**What was done:**
- Created `apps/web-editor/src/features/captions/components/TranscribeButton.tsx` — manages the full transcription CTA flow: idle→pending→ready→error; uses `useTranscriptionStatus` for polling (only starts polling after trigger is called), `triggerTranscription` for POST, `useAddCaptionsToTimeline` for the add action; aria-label, aria-busy on button for accessibility; styled using design-guide tokens (`#7C3AED` idle, `#10B981` ready, `#EF4444` error, `#8A8AA0` disabled)
- Created `apps/web-editor/src/features/captions/hooks/useAddCaptionsToTimeline.ts` — converts `CaptionSegment[]` to `TextOverlayClip[]` using frame math (`startFrame = Math.round(seg.start * fps)`, `durationFrames = Math.max(1, Math.round((seg.end - seg.start) * fps))`); creates `overlay` track named "Captions"; calls `setProject()` with spread-updated ProjectDoc
- Updated `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` — card container changed from fixed `height: 64` to `minHeight: 64` with `flexDirection: 'column'`; top row preserved as `flexDirection: 'row'`; `TranscribeButton` added conditionally when `asset.status === 'ready'` and asset is video or audio
- Created `apps/web-editor/src/features/captions/hooks/useAddCaptionsToTimeline.test.ts` — 6 unit tests: track type overlay, frame math at 30fps, durationFrames clamped to min 1, clip trackId matches new track, existing tracks/clips preserved, empty segments no-throw

**Notes:**
- `TranscribeButton` only starts polling (`assetId !== null` passed to `useTranscriptionStatus`) after `triggerTranscription` succeeds — avoids unnecessary polling for idle assets
- `isTranscribable` helper checks `video/` or `audio/` MIME prefix before rendering `TranscribeButton`
- `TranscribeButton` only rendered when `asset.status === 'ready'` (asset must be ingested before it can be transcribed)
- `crypto.randomUUID()` uses the browser's Web Crypto API (not Node.js `node:crypto`)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 6. FE — "Transcribe" button + "Add Captions to Timeline" action</summary>

- What: Add a "Transcribe" button to AssetCard (video/audio assets). Show status inline. When ready, "Add Captions to Timeline" button converts segments into TextOverlayClips and appends a captions track.
- Depends on: Subtask 5

</details>

checked by code-reviewer - NOT
checked by qa-reviewer - NOT
checked by design-reviewer - NOT
