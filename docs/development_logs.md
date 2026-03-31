# Development Log

---

## 2026-03-29

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 1. Scaffold monorepo structure

**What was done:**
- Created root `package.json` (npm workspaces: `apps/*`, `packages/*`) and `turbo.json` with build/dev/lint/test/typecheck pipeline tasks
- Created root `tsconfig.json` with strict-mode TypeScript baseline (extended by all apps/packages)
- Created `.env.example` with all required variables: DB, Redis, S3/R2, JWT, OpenAI, API server, Vite API URL
- Created `.gitignore` covering `node_modules`, `dist`, `.env`, `.turbo`, `coverage`
- Created `docker-compose.yml` with `db` (MySQL 8.0) and `redis` (Redis 7 Alpine) services; DB mounts migrations dir as init scripts
- Scaffolded `apps/api/` — `package.json`, `tsconfig.json`, `src/index.ts` (Express + helmet + cors + rate-limit), `src/config.ts`, `src/db/connection.ts`, `src/queues/bullmq.ts` (Queue definitions for `media-ingest`, `render`, `transcription`)
- Scaffolded `apps/web-editor/` — `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx` (React 18 + QueryClientProvider), `src/lib/config.ts`, `src/lib/api-client.ts`; all feature subdirectories created
- Scaffolded `apps/media-worker/` — `package.json`, `tsconfig.json`, `src/config.ts`, `src/index.ts` (BullMQ Worker stub on `media-ingest` queue)
- Scaffolded `apps/render-worker/` — `package.json`, `tsconfig.json`, `src/config.ts`, `src/index.ts` (BullMQ Worker stub on `render` queue)
- Scaffolded `packages/project-schema/` — Zod schemas for `ProjectDoc`, `Track`, `Clip` (discriminated union: `VideoClip | AudioClip | TextOverlayClip`), TypeScript type exports; `src/index.ts` barrel
- Scaffolded `packages/api-contracts/` — empty stub (`src/index.ts`); will be populated with OpenAPI-generated client in subtask 4+
- Scaffolded `packages/ui/` — empty stub; shared React components added per feature
- Scaffolded `packages/editor-core/` — empty stub; timeline math/Immer patch logic added per feature
- Scaffolded `packages/remotion-comps/` — `VideoComposition.tsx` (root composition consuming `ProjectDoc`), `VideoLayer.tsx` (dual-mode: `<OffthreadVideo>` in SSR, `<Video>` in browser), `AudioLayer.tsx`, `ImageLayer.tsx`, `TextOverlayLayer.tsx`, `useRemotionEnvironment.ts` hook
- Wrote unit tests (Vitest, co-located): `clip.schema.test.ts` (14 cases covering happy path, defaults, edge cases, discriminated union routing) and `project-doc.schema.test.ts` (7 cases covering defaults, required fields, invalid values)

**Notes:**
- Package scope uses `@ai-video-editor/` for shared packages (as referenced in `architecture-rules.md` import examples) and `@cliptale/` for apps — consistent with the monorepo root name
- `docker-compose.yml` mounts `apps/api/src/db/migrations/` as MySQL init scripts so running `docker compose up` automatically applies migrations — this is the intended workflow for subtask 2
- Subtasks 2 (DB migration) and 3 (Redis/BullMQ infra) are unblocked and can proceed in parallel — both were partially addressed here (Redis is in Docker Compose, BullMQ queue names defined)
- `packages/api-contracts/` is a stub — the typed API client pattern (calling `apiClient.assets.createUploadUrl(...)`) requires the OpenAPI spec to exist first; the `lib/api-client.ts` in web-editor uses a plain fetch wrapper until then

checked by code-reviewer - YES
checked by qa-reviewer - YES

**Review fixes applied (2026-03-30):**
- Fixed all backend env var names to use `APP_` prefix across `apps/api/src/config.ts`, `apps/media-worker/src/config.ts`, `apps/render-worker/src/config.ts`, and `.env.example`
- Added Zod startup validation + `process.exit(1)` in all three backend config modules; frontend config throws instead of `process.exit` (browser environment)
- Fixed frontend env var to `VITE_PUBLIC_API_BASE_URL` in `apps/web-editor/src/lib/config.ts` and `.env.example`
- Added `zod` dependency to `apps/media-worker/package.json` and `apps/render-worker/package.json`
- Added JSDoc comments to all exported types in `packages/project-schema/src/types/index.ts`
- Note: `api-client.ts` plain-fetch stub is intentional — will be replaced with typed client at subtask 4

**Remaining subtasks (2–7) stay in `docs/active_task.md`.**

---

## 2026-03-30

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 2. DB migration — `project_assets_current` table

**What was done:**
- Created `apps/api/src/db/migrations/001_project_assets_current.sql`
- Table has all required columns: `asset_id` (PK, CHAR(36)), `project_id`, `user_id`, `filename`, `content_type`, `file_size_bytes`, `storage_uri`, `status` (ENUM: `pending|processing|ready|error`, default `pending`), `error_message`, `duration_frames`, `width`, `height`, `fps`, `thumbnail_uri`, `waveform_json` (JSON), `created_at`, `updated_at`
- Composite index `idx_project_assets_project_status` on `(project_id, status)` for the most common query pattern (list assets for a project filtered by status)
- Migration is idempotent via `CREATE TABLE IF NOT EXISTS`
- MySQL will auto-execute this on first Docker Compose boot via the `docker-entrypoint-initdb.d` volume mount already configured in `docker-compose.yml`

**Notes:**
- `fps` is stored as `DECIMAL(10, 4)` to avoid floating-point drift (e.g. 29.9700 for 29.97fps NTSC)
- `waveform_json` uses MySQL `JSON` column type — no separate JSON blob column needed; MySQL validates JSON on write
- No unit test written: architecture-rules.md §testing explicitly states "Do NOT test: repository SQL correctness (that is integration test territory)"
- No separate migrate script added: docker-compose mounts `apps/api/src/db/migrations/` to `docker-entrypoint-initdb.d` so MySQL runs it automatically on first boot
- Integration test added at `apps/api/src/__tests__/integration/migration-001.test.ts` — bootstraps the integration test infrastructure for the API; covers: table existence, idempotency, all column types/nullability, ENUM default (`pending`), ENUM rejection of invalid values, composite index presence

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 2. DB migration — `project_assets_current` table</summary>

- What: Write and run the numbered SQL migration that creates the `project_assets_current` table with columns `asset_id`, `project_id`, `user_id`, `filename`, `content_type`, `file_size_bytes`, `storage_uri`, `status` (`pending | processing | ready | error`), `error_message`, `duration_frames`, `width`, `height`, `fps`, `thumbnail_uri`, `waveform_json`, `created_at`, `updated_at`; add index on `(project_id, status)`
- Where: `apps/api/src/db/migrations/001_project_assets_current.sql`
- Why: The presigned URL endpoint must insert a `pending` row — the table must exist before any BE code runs
- Depends on: subtask 1 ✅

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-30

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 3. Redis + BullMQ infrastructure setup

**What was done:**
- `docker-compose.yml` — added `healthcheck` to Redis service (`redis-cli ping`, 5s interval, 3 retries) so container orchestrators can wait for Redis to be ready
- `apps/api/src/queues/bullmq.ts` — added `error` event handler to all three Queue instances to prevent unhandled promise rejections when Redis is temporarily unavailable; removed unnecessary `Worker` class re-export (API enqueues only — workers run in worker apps)
- `apps/media-worker/src/index.ts` — added `worker.on('error', ...)` handler; added graceful shutdown via `SIGTERM`/`SIGINT` signal handlers that call `worker.close()` before exiting; set `concurrency: 2`
- `apps/render-worker/src/index.ts` — same graceful shutdown and error handler pattern; `concurrency: 1` (render jobs are CPU-heavy)
- No changes to `.env.example` or `apps/api/src/config.ts` — Redis URL config was already complete from subtask 1

**Notes:**
- Arch-rules §10 explicitly: "Do NOT test: BullMQ worker wiring" — no unit tests written
- Graceful shutdown is critical: without `worker.close()`, an in-progress job gets abandoned mid-execution when a container is stopped/scaled; BullMQ marks it as stalled and retries — acceptable for idempotent jobs but wasteful; `worker.close()` waits for the current job to finish before exiting
- `concurrency: 1` on render-worker intentional — Remotion SSR renders are multi-threaded internally and compete for CPU; running two simultaneously on a single core would be slower
- `connection` is still exported from `bullmq.ts` — will be used by `enqueue-ingest.ts` (subtask 5) to call `queue.getJob(assetId)` for the idempotency check

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 3. Redis + BullMQ infrastructure setup</summary>

- What: Add Redis to the local dev environment (Docker Compose service), configure the BullMQ Queue and Worker connection in apps/api/src/queues/bullmq.ts, and wire the media-worker app entry point (apps/media-worker/src/index.ts) to register its worker against the same Redis instance
- Where: docker-compose.yml, apps/api/src/queues/bullmq.ts, apps/media-worker/src/index.ts, .env.example
- Why: The finalization endpoint enqueues a media-ingest job — Redis must be reachable before that endpoint can be tested end-to-end
- Depends on: subtask 1 ✅

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

**Review fixes applied (2026-03-30):**
- Fixed import in `apps/api/src/queues/bullmq.ts`: `../config.js` → `@/config.js` (§9 absolute `@/` path convention)
- Added `"paths": { "@/*": ["./src/*"] }` to `apps/api/tsconfig.json` to define the `@/` alias
- Added `tsc-alias` devDependency to `apps/api/package.json` and updated build script to `tsc && tsc-alias` so the path alias is rewritten in compiled output (tsx in dev handles aliases natively)

---

## 2026-03-30

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 4. [BE] Presigned URL endpoint

**What was done:**
- Created `apps/api/src/lib/errors.ts` — typed error classes: `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`; each carries `statusCode` for controller mapping
- Created `apps/api/src/lib/s3.ts` — singleton `S3Client` configured from `config.s3`; `forcePathStyle: true` when a custom endpoint is set (R2 compatibility)
- Created `apps/api/src/types/express.d.ts` — augments `Express.Request` with `user?: { id, email }` attached by auth middleware
- Created `apps/api/src/middleware/validate.middleware.ts` — `validateBody(schema)` Zod middleware; returns 400 with field-level errors
- Created `apps/api/src/middleware/auth.middleware.ts` — verifies Bearer JWT via `jsonwebtoken`, attaches `req.user`
- Created `apps/api/src/middleware/acl.middleware.ts` — stub that enforces auth presence; full project-membership check deferred to projects CRUD subtask
- Created `apps/api/src/repositories/asset.repository.ts` — `insertPendingAsset`, `getAssetById`, `updateAssetStatus`; all SQL only, typed row mapping
- Created `apps/api/src/services/asset.service.ts` — `createUploadUrl` (content-type allowlist, filename sanitization, max 2 GiB, presigned PUT URL at 15 min expiry, inserts pending row), `getAsset` (throws NotFoundError if missing)
- Created `apps/api/src/controllers/assets.controller.ts` — thin: parse body with Zod, call service with injected s3Client + bucket, return response
- Created `apps/api/src/routes/assets.routes.ts` — `POST /projects/:id/assets/upload-url` (auth + acl('editor')), `GET /assets/:id` (auth only)
- Modified `apps/api/src/index.ts` — registered `assetsRouter`; added centralized error handler that maps typed errors to HTTP status codes
- Created `apps/api/src/services/asset.service.test.ts` — 13 unit tests covering happy path, all audio/image content types, size limits, filename sanitization edge cases, NotFoundError, DB error propagation

**Notes:**
- S3Client is injected into the service (not imported directly) — enables unit testing without AWS credentials
- `sanitize-html` strips HTML tags then replaces non-safe chars; leading dots removed to prevent hidden files on Linux
- `fileSizeBytes` is validated in the service (not trusted blindly from client) but actual upload size enforcement is via `ContentLength` in the presigned PUT command — S3/R2 will reject PUTs that don't match
- `GET /assets/:id` added as noted in the Open Questions — needed by `useAssetPolling` FE hook (subtask 7)
- ACL middleware is a stub; real project ownership check will be implemented in the projects CRUD subtask
- `updateAssetStatus` added to repository now (used by subtask 5 finalization + subtask 6 worker)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 4. [BE] Presigned URL endpoint</summary>

- What: Implement POST /projects/:id/assets/upload-url — route → controller → asset.service.ts (validates content type, generates presigned PUT URL via S3/R2 SDK, calls repository to insert pending row) → asset.repository.ts (INSERT SQL)
- Where: apps/api/src/routes/assets.routes.ts, apps/api/src/controllers/assets.controller.ts, apps/api/src/services/asset.service.ts, apps/api/src/repositories/asset.repository.ts
- Why: This is the entry point of the upload pipeline; unblocks the finalization endpoint and the FE upload flow
- Depends on: subtasks 2, 3

</details>

**Review fixes applied (2026-03-30):**
- `asset.service.ts` — Added `.replace(/\.\./g, '_')` step in `sanitizeFilename` to strip `..` traversal sequences; changed post-sanitization guard from `=== '_'` to `/^_+$/.test()` to catch all-underscore filenames like `"!!!"` (BUG 1, BUG 2)
- `assets.controller.ts` — Exported `createUploadUrlSchema`; removed inline `.parse()` call from handler; controller now receives pre-validated body cast to `CreateUploadUrlBody`; added JSDoc to both exported handlers (BUG 3 + code-reviewer §3/§9)
- `assets.routes.ts` — Added `validateBody(createUploadUrlSchema)` middleware to upload-url route; invalid bodies now return 400 via the middleware before reaching the controller (BUG 3 + code-reviewer §3)
- `asset.repository.ts` — Added expanded JSDoc to `AssetStatus` and `Asset` exports (code-reviewer §9); `AssetRow` already used `type` not `interface`
- `asset.service.ts` — Added JSDoc to `CreateUploadUrlParams` and `UploadUrlResult` (code-reviewer §9)
- `index.ts` — Added `ConflictError` to centralized error handler so 409 is returned correctly for conflict/optimistic-lock errors (code-reviewer §8)

**Review fixes applied (2026-03-30, round 2):**
- `docs/architecture-rules.md` §3 — Added `lib/` (errors.ts, s3.ts) and `types/` (express.d.ts) to documented `apps/api/` folder structure
- `asset.service.test.ts` — Renamed all `it('should ...')` descriptions to present-tense (e.g. `'throws ValidationError when...'`, `'returns uploadUrl...'`) per §10 convention
- `assets-endpoints.test.ts` — Seeded a dedicated asset row in `beforeAll` (`seededAssetId`); GET 200 test now uses that fixture instead of implicitly depending on POST happy-path test order; cleanup extended to include seeded row

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-30

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 5. [BE] Asset finalization + ingest enqueue endpoint

**What was done:**
- Created `apps/api/src/queues/jobs/enqueue-ingest.ts` — `MediaIngestJobPayload` type + `enqueueIngestJob()` helper; uses `assetId` as BullMQ `jobId` for idempotency; skips re-enqueue if non-failed/non-completed job already exists; 3 attempts with exponential backoff (5s base)
- Extended `apps/api/src/services/asset.service.ts` — added `finalizeAsset(assetId, s3)`: fetches asset (NotFoundError if missing), idempotency guard for `processing`/`ready` status, S3 HEAD verification (ValidationError if NotFound/NoSuchKey), `updateAssetStatus → processing`, `enqueueIngestJob`; added `parseStorageUri` private helper
- Extended `apps/api/src/controllers/assets.controller.ts` — added `finalizeAsset` handler with JSDoc
- Extended `apps/api/src/routes/assets.routes.ts` — added `POST /assets/:id/finalize` with `authMiddleware`
- Extended `apps/api/src/services/asset.service.test.ts` — 7 new unit tests for `finalizeAsset`: happy path, idempotency (processing), idempotency (ready), NotFoundError, ValidationError on S3 404, unexpected S3 error re-throw, error-status re-finalization; added `updateAssetStatus` to repository mock and `enqueueIngestJob` module mock
- Extended `apps/api/src/__tests__/integration/assets-endpoints.test.ts` — 6 new integration tests for `POST /assets/:id/finalize`: 401 (no auth), 401 (bad JWT), 404 (missing asset), 400 (S3 object not uploaded), 200 happy path (DB row verified), 200 idempotency; added `@/lib/s3.js` mock + seeded fixture in `beforeAll`

**Notes:**
- `HeadObjectCommand` used (not `GetObjectCommand`) — cheap metadata-only check; no object download
- `err.name === 'NotFound'` covers AWS SDK v3 HEAD 404; `'NoSuchKey'` covers GET-style errors defensively
- BullMQ `getJob(assetId)` checks before enqueue — skips if waiting/active/delayed, allows re-enqueue if failed/completed
- `error` status intentionally not guarded — allows client to retry finalization after a failed ingest
- `parseStorageUri` kept private — only needed inside service for HeadObjectCommand

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 5. [BE] Asset finalization + ingest enqueue endpoint</summary>

- What: Implement `POST /assets/:id/finalize` — verifies object exists in storage (HEAD request in service layer), transitions status `pending → processing`, enqueues `media-ingest` BullMQ job via `enqueue-ingest.ts` helper; idempotency guard (no duplicate jobs if already processing/ready)
- Where: `apps/api/src/routes/assets.routes.ts`, `apps/api/src/controllers/assets.controller.ts`, `apps/api/src/services/asset.service.ts`, `apps/api/src/repositories/asset.repository.ts`, `apps/api/src/queues/jobs/enqueue-ingest.ts`
- Why: Closes the upload loop — client calls this after the XHR PUT completes, triggering background processing
- Depends on: subtask 4

</details>

**Review fixes applied (2026-03-30, round 2):**
- `asset.service.test.ts` — Removed `finalizeAsset` describe block; split into `asset.finalize.service.test.ts` (new file, 130 lines) keeping both files under 300-line limit
- `assets-endpoints.test.ts` — Removed finalize endpoint tests; split into `assets-finalize-endpoint.test.ts` (new file, 155 lines) with its own `beforeAll`/`afterAll`/`beforeEach` setup
- `assets.routes.ts` — Added `aclMiddleware('editor')` to `POST /assets/:id/finalize` route, consistent with upload-url route

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-30

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 6. [BE/INFRA] Media worker — `media-ingest` job handler

**What was done:**
- Created `packages/project-schema/src/types/job-payloads.ts` — `MediaIngestJobPayload` type; exported from `packages/project-schema/src/index.ts` so both API and worker import it without duplication
- Updated `apps/api/src/queues/jobs/enqueue-ingest.ts` — removed local type definition; now imports `MediaIngestJobPayload` from `@ai-video-editor/project-schema`; re-exports for callers
- Created `apps/media-worker/src/lib/s3.ts` — singleton S3Client from config
- Created `apps/media-worker/src/lib/db.ts` — mysql2 connection pool from config
- Created `apps/media-worker/src/jobs/ingest.job.ts` — full ingest handler: S3 download → FFprobe metadata → thumbnail (video) → waveform peaks (audio/video) → S3 thumbnail upload → DB `ready`; error path: DB `error` + re-throw for BullMQ retry; pure helpers `parseStorageUri`, `parseFps`, `computeRmsPeaks` exported for testing
- Updated `apps/media-worker/src/index.ts` — wired `processIngestJob` with real S3 + DB deps; typed `Worker<MediaIngestJobPayload>`
- Created `apps/media-worker/src/jobs/ingest.job.test.ts` — 11 unit tests: pure helper tests (parseStorageUri, parseFps, computeRmsPeaks), flow tests (happy path, S3 error path, image asset skips thumbnail/waveform)
- Created `apps/media-worker/Dockerfile` — `node:20-alpine` + `apk add ffmpeg`; resolves FFmpeg dependency
- Updated `docker-compose.yml` — added `media-worker` service with Redis/DB deps + S3 env vars from `.env`
- Updated `docs/architecture-rules.md` §3 — added `lib/` folder to documented `apps/media-worker/` structure

**Notes:**
- `computeRmsPeaks` operates on s16le mono PCM at 8 kHz — low sample rate keeps memory small; 200 peaks sufficient for waveform display
- `parseFps` stores 4-decimal float (e.g. 29.9700) matching `DECIMAL(10,4)` DB column from migration 001
- `processIngestJob` uses UUID-based temp dirs under `os.tmpdir()`; cleaned up in `finally` to avoid disk leaks
- BullMQ retry configured at enqueue time (3 attempts, 5s exponential) — job handler just re-throws
- `MediaIngestJobPayload` is now single source of truth in `packages/project-schema/`

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 6. [BE/INFRA] Media worker — `media-ingest` job handler</summary>

- What: Implement the BullMQ job handler in `apps/media-worker/src/jobs/ingest.job.ts`
- Where: `apps/media-worker/src/jobs/ingest.job.ts`, `apps/media-worker/src/index.ts`
- Why: Without this, assets are stuck in `processing` forever
- Depends on: subtask 5, subtask 3

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

**Review fixes applied (2026-03-31, round 2):**
- `apps/media-worker/tsconfig.json` — added `"paths": { "@/*": ["./src/*"] }` for `@/` import alias
- `apps/media-worker/package.json` — added `tsc-alias` devDep; updated build script to `tsc && tsc-alias`
- `apps/media-worker/src/lib/s3.ts`, `db.ts`, `src/index.ts` — replaced all relative imports (`'../config.js'`, `'./lib/...'`, `'./jobs/...'`) with `@/` absolute imports per §9

## 2026-03-31

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 7. [FE] Asset browser panel + upload UI

**What was done:**
- Created `apps/web-editor/src/features/asset-manager/types.ts` — `Asset`, `AssetStatus`, `AssetFilterTab`, `UploadEntry`, `UploadUrlRequest`, `UploadUrlResponse` types
- Created `apps/web-editor/src/features/asset-manager/api.ts` — `requestUploadUrl`, `finalizeAsset`, `getAsset`, `getAssets` calling `apiClient`
- Created `apps/web-editor/src/features/asset-manager/hooks/useAssetUpload.ts` — multi-file XHR upload hook with per-file progress, finalize call, and `onUploadComplete` callback
- Created `apps/web-editor/src/features/asset-manager/hooks/useAssetPolling.ts` — 2 s interval polling hook with cleanup; stops on `ready`/`error`; callbacks held in refs to avoid restarting interval
- Created `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` — 296×64px card with 48×48 thumbnail, filename, type label, status badge
- Created `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — 280px right panel: preview, filename, metadata row, status badge, Replace/Delete buttons
- Created `apps/web-editor/src/features/asset-manager/components/UploadDropzone.tsx` — modal with drag-and-drop zone, browse button, per-file XHR progress bars, Cancel/Done footer
- Created `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx` — main 320px panel: All/Video/Audio/Image tabs, search bar, React Query asset list, upload button; wires detail panel and upload modal; invalidates query cache on upload complete
- Created `hooks/useAssetUpload.test.ts` — 7 unit tests: initial state, entry added on URL request resolve, XHR progress updates, done on load+finalize, error on XHR fail, onUploadComplete callback, clearEntries
- Created `hooks/useAssetPolling.test.ts` — 6 unit tests: onReady on first poll, onError on error status, continues polling through processing, no poll when assetId null, stops after unmount, continues through network errors
- Created `components/AssetCard.test.tsx` — 11 unit tests: filename, status badge, onClick, Enter key, Space key, thumbnail img, aria-pressed, type labels
- Created `components/AssetBrowserPanel.test.tsx` — 8 integration-style tests: tabs render, assets load, Video tab filter, search filter, empty state, upload modal opens, detail panel on select, error state

**Notes:**
- `useAssetUpload` uses native `XMLHttpRequest` (not `fetch`) so `xhr.upload.onprogress` fires during the S3 PUT — `fetch` does not expose upload progress
- `useAssetPolling` stores callbacks in refs so the `setInterval` is only created/destroyed when `assetId` changes, not on every render
- `AssetBrowserPanel` calls `queryClient.invalidateQueries` in `onUploadComplete` so the asset list refreshes automatically after each file finishes
- `UploadDropzone` resets `e.target.value = ''` after selection so the same file can be re-uploaded
- `AssetDetailPanel` uses a spacer `flex: 1` div to push Replace/Delete buttons to y=508 and y=560 (bottom of 620px panel), matching Figma
- Tests for `AssetBrowserPanel` mock `useAssetUpload` to isolate from XHR logic; mocking `@/features/asset-manager/api` covers the React Query paths
- Tests cannot be run in this environment because `web-editor`'s `workspace:*` deps require pnpm; install and run with `cd apps/web-editor && pnpm install && pnpm test`

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 7. [FE] Asset browser panel + upload UI</summary>

- What: Build `apps/web-editor/src/features/asset-manager/` — `AssetBrowserPanel` (grouped list by type with thumbnail cards), `UploadDropzone` (drag-and-drop + file picker), `useAssetUpload` hook (presigned URL flow + XHR progress), `useAssetPolling` hook (2 s poll on `/assets/:id` until `ready`), detail popover (duration, resolution, size), empty state, error toasts
- Where: `apps/web-editor/src/features/asset-manager/components/`, `hooks/`, `api.ts`, `types.ts`
- Why: This is the user-facing surface of the entire epic — visible proof that the pipeline works
- Depends on: subtasks 4 + 5 live or mocked; FE development can start against mock stubs in parallel

</details>

**Review fixes applied (2026-03-31, round 2):**
- `useAssetUpload.ts` — Changed `interface UseAssetUploadOptions` and `interface UseAssetUploadResult` to `type` (§9 allows `interface` only for `*Props` shapes)
- `useAssetPolling.ts` — Changed `interface UseAssetPollingOptions` to `type`
- `UploadDropzone.tsx` — Extracted per-file progress list into new `UploadProgressList.tsx`; `UploadDropzone` now 250 lines (under 300-line limit)
- `AssetBrowserPanel.tsx` — Moved `@/features/asset-manager/types` type import before relative component imports per §9 ordering

**Review fixes applied (2026-03-31, round 3):**
- `AssetBrowserPanel.tsx` — Added blank line between `@/` import group and relative import group (§9)
- `UploadDropzone.tsx` — Added blank line between `@/` import group and relative import group (§9)
- Deleted `components/AssetCard.test.tsx` — §10 prohibits testing React component rendering details
- Deleted `components/AssetBrowserPanel.test.tsx` — §10 same rule
- Note: `getTypeLabel` duplication is a warning only; will extract to `src/shared/utils/` if a third consumer appears

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-31

### Task: Add API and Web Editor to Docker Compose
**Subtask:** 1. Add `api` and `web-editor` Docker services

**What was done:**
- Created `apps/api/Dockerfile` — copies monorepo root + api + project-schema; `npm ci`; builds with `tsc && tsc-alias`; runs `node apps/api/dist/index.js`
- Created `apps/web-editor/Dockerfile` — copies all five workspace packages; `npm ci`; runs Vite dev server via `npx vite --host 0.0.0.0` from `apps/web-editor/`
- Updated `docker-compose.yml` — added `api` service (port 3001, depends on db + redis healthy, env vars from `.env`) and `web-editor` service (port 5173, depends on api, `VITE_PUBLIC_API_BASE_URL=http://localhost:3001`)
- No tests written: Dockerfile correctness is verified by `docker compose up --build`; arch-rules §10 excludes Docker/infra wiring from unit test scope

**Notes:**
- `VITE_PUBLIC_API_BASE_URL` is set to `http://localhost:3001` — Vite dev server injects this at runtime so the browser on the host reaches the API on the mapped port
- DB and Redis use Docker-internal hostnames (`db`, `redis`); API env vars set accordingly
- `APP_JWT_SECRET` defaults to the dev value from `.env.example` so the stack works without a `.env` file for local testing

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 1. Add `api` and `web-editor` Docker services</summary>

- What: Create `apps/api/Dockerfile`, `apps/web-editor/Dockerfile`, update `docker-compose.yml` with `api` and `web-editor` services
- Where: `apps/api/Dockerfile`, `apps/web-editor/Dockerfile`, `docker-compose.yml`
- Acceptance: `docker compose up --build` starts all five services; browser at `http://localhost:5173` loads the editor

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-31

### Hotfix: Docker Compose build errors

Two bugs surfaced when running `docker compose up --build` for the first time.

---

#### Bug 1 — `npm ci` fails: no root `package-lock.json`

**Error:** `The npm ci command can only install with an existing package-lock.json`

**Root cause:** The Dockerfiles used `npm ci`, which requires a lockfile at the copied path. The monorepo has per-app lockfiles (`apps/api/package-lock.json`, etc.) but no root-level one. The `COPY package-lock.json* ./` glob silently copied nothing, so `npm ci` found no lockfile and aborted.

**Fix:** Switched from `npm ci` to `npm install` in all three Dockerfiles and removed the `package-lock.json*` copy line.

**Files changed:** `apps/api/Dockerfile`, `apps/media-worker/Dockerfile`, `apps/web-editor/Dockerfile`

---

#### Bug 2 — `npm install` fails: `workspace:*` protocol not supported by npm

**Error:** `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:": workspace:*`

**Root cause:** Six `package.json` files used `"workspace:*"` as a dependency version. This is a **pnpm-specific** protocol — npm (which runs inside `node:20-alpine`) does not understand it. `apps/web-editor/package.json` was already correct (used `file:` references); all other apps and shared packages were not.

**Fix:** Replaced every `"workspace:*"` with the equivalent `file:` path:

| File | New value |
|---|---|
| `apps/api/package.json` | `file:../../packages/project-schema` |
| `apps/media-worker/package.json` | `file:../../packages/project-schema` |
| `apps/render-worker/package.json` | `file:../../packages/project-schema`, `file:../../packages/remotion-comps` |
| `packages/api-contracts/package.json` | `file:../project-schema` |
| `packages/editor-core/package.json` | `file:../project-schema` |
| `packages/remotion-comps/package.json` | `file:../project-schema` |

---

## 2026-03-31

### Task: Wire the Asset Browser Panel into the app so it's visible on load
**Subtask:** Mount AssetBrowserPanel in main.tsx with a hardcoded dev projectId

**What was done:**
- Modified `apps/web-editor/src/main.tsx` — imported `AssetBrowserPanel` from `@/features/asset-manager/components/AssetBrowserPanel`; added `DEV_PROJECT_ID = 'dev-project-001'` constant; replaced the placeholder `<h1>ClipTale Editor</h1>` with `<AssetBrowserPanel projectId={DEV_PROJECT_ID} />`; added `display: flex` to the root div so the panel renders at its natural width
- No new files created; no other files modified
- No tests written — arch §10 prohibits testing React component rendering details; no business logic was introduced

**Notes:**
- `DEV_PROJECT_ID` is intentionally hardcoded — the project creation flow does not yet exist; this provides an immediately visible panel without requiring user interaction
- `display: flex` on the root div is required so `AssetBrowserPanel` (and the future `AssetDetailPanel` alongside it) render side-by-side at their natural widths rather than stacking vertically
- The `@/` alias resolves correctly in both Vite dev (`vite.config.ts` alias) and TypeScript (`tsconfig.json` paths)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Task 1 — Wire the Asset Browser Panel into the app so it's visible on load</summary>

Mount `AssetBrowserPanel` in `apps/web-editor/src/main.tsx`. Pass it a hardcoded test `projectId` string so the panel loads immediately without needing a real project creation flow. The result should be that opening `http://localhost:5173` shows the panel with its tabs, search bar, and upload button.

Acceptance criteria:
- When I open http://localhost:5173, I see the Asset Browser panel — not just a dark screen with a title
- The panel shows the All / Video / Audio / Image tabs and a search bar
- There is an "Upload Assets" button at the bottom of the panel
- Clicking the button opens the upload modal

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-31

### Task: Add a backend route to list assets for a project
**Subtask:** Implement GET /projects/:id/assets — repository, service, controller, route, and tests

**What was done:**
- Modified `apps/api/src/repositories/asset.repository.ts` — added `getAssetsByProjectId(projectId)` returning `Asset[]`, ordered by `created_at ASC`
- Modified `apps/api/src/services/asset.service.ts` — added `getProjectAssets(projectId)` which delegates to the repository; returns empty array for unknown projects (no NotFoundError)
- Modified `apps/api/src/controllers/assets.controller.ts` — added `getProjectAssets` handler with JSDoc
- Modified `apps/api/src/routes/assets.routes.ts` — added `GET /projects/:id/assets` with `authMiddleware`
- Modified `apps/api/src/services/asset.service.test.ts` — added `getAssetsByProjectId` to repository mock; added 3 unit tests for `getProjectAssets`: returns assets, returns empty array, propagates DB error
- Created `apps/api/src/__tests__/integration/assets-list-endpoint.test.ts` — 5 integration tests: 401 no auth, 401 bad JWT, 200 empty array, 200 with assets, cross-project isolation

**Notes:**
- Route does not use `aclMiddleware` — consistent with `GET /assets/:id` which also only requires auth (not editor role). List is a read operation.
- Service returns `[]` for a non-existent `projectId` — the frontend interprets an empty array as "no assets yet" and shows the empty state, which is the required behavior
- Integration test uses stable seeded asset IDs (`00000000-list-seed-...`) to avoid depending on other test suites

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Task 2 — Add a backend route to list assets for a project</summary>

Add `GET /projects/:id/assets` to the API. The route should query the `project_assets_current` table for all rows where `project_id` matches the URL parameter and return them as a JSON array.

Acceptance criteria:
- When the panel loads with no uploaded files, it shows an empty state message — not a red error
- When assets have been uploaded, the panel shows them listed after the page loads
- If the project ID doesn't exist or has no assets, the API returns an empty array (not a 404)
- The route is protected by auth middleware, consistent with other asset routes

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## 2026-03-31

### Task: Disable deceptive buttons and wire processing asset polling
**Subtasks:** Task 1 (disable Delete), Task 2 (disable Replace File), Task 3 (wire useAssetPolling)

**What was done:**
- Modified `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — added `disabled` attribute to both "Replace File" and "Delete Asset" buttons; updated styles to `color: '#555560'`, `cursor: 'not-allowed'`, `opacity: 0.5`; `onDelete` prop retained for future use but button does not fire click events when disabled
- Modified `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx` — imported `useAssetPolling`; added private `AssetPoller` helper component (renders `null`, wraps `useAssetPolling` for one asset, calls `onSettled` on `ready` or `error`); rendered one `<AssetPoller>` per asset in `processing` or `pending` status; `onSettled` invalidates the `['assets', projectId]` React Query cache so the card updates automatically

**Notes:**
- `AssetPoller` is a private helper (not exported) — allows calling `useAssetPolling` per-item without violating rules-of-hooks (no hooks in loops)
- Polling covers both `processing` and `pending` — a `pending` asset that never got finalized would otherwise be stuck forever
- No tests written — arch §10 prohibits testing React component rendering details; no new business logic introduced

**Completed subtasks from active_task.md:**
<details>
<summary>Task 1: Disable the Delete Asset button</summary>
Disable "Delete Asset" button in AssetDetailPanel — grayed out, not clickable, `disabled` attribute.
</details>

<details>
<summary>Task 2: Disable the Replace File button</summary>
Disable "Replace File" button in AssetDetailPanel — grayed out, not clickable, `disabled` attribute.
</details>

<details>
<summary>Task 3: Wire background polling for processing assets</summary>
Add AssetPoller helper to AssetBrowserPanel; render one per processing/pending asset; invalidate query cache on settled.
</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES

**Why `file:` works:** npm resolves `file:` as a local directory install and symlinks it into `node_modules` — functionally identical to `workspace:*` for a monorepo, but using native npm syntax supported since npm 5.

---

## 2026-03-31

### Task: Fix the upload URL request to include the project ID in the path
**Subtask:** Update `requestUploadUrl` in `api.ts` to call `POST /projects/${projectId}/assets/upload-url`

**What was done:**
- Modified `apps/web-editor/src/features/asset-manager/api.ts` — changed `requestUploadUrl` URL from `/assets/upload-url` to `/projects/${payload.projectId}/assets/upload-url`; `projectId` was already present in `UploadUrlRequest` payload so no type changes required

**Notes:**
- The `projectId` was already part of `UploadUrlRequest` and passed in the body; now it is also placed in the URL path to match the backend route `POST /projects/:id/assets/upload-url`
- No test changes needed: `useAssetUpload.test.ts` mocks `@/features/asset-manager/api` entirely and does not assert on URL paths; `api.ts` function wrappers are excluded from unit tests per §10 (covered by integration tests)

**Completed subtask from active_task.md:**
<details>
<summary>Task 3: Fix the upload URL request to include the project ID in the path</summary>

In `apps/web-editor/src/features/asset-manager/api.ts`, update the `requestUploadUrl` function so that the `projectId` is included in the URL path: `POST /projects/${projectId}/assets/upload-url`. The `projectId` is already available as a prop on `AssetBrowserPanel` and passed through to the upload hook — it just needs to flow into the API call.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
