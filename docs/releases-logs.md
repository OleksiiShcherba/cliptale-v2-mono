
---
## Release Snapshot — 2026-04-01 09:58 UTC

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

---
## Release Snapshot — 2026-04-02 17:48 UTC

# Development Log (compacted — 2026-03-29 to 2026-03-31)

## Monorepo Scaffold (Subtask 1)
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
- fixed: all backend env vars use `APP_` prefix across api/media-worker/render-worker config + `.env.example`
- fixed: Zod startup validation + `process.exit(1)` in all backend configs
- fixed: `VITE_PUBLIC_API_BASE_URL` in web-editor config + `.env.example`
- fixed: added `zod` dep to media-worker and render-worker `package.json`

## DB Migration (Subtask 2)
- added: `apps/api/src/db/migrations/001_project_assets_current.sql` — `project_assets_current` table
- columns: `asset_id` PK, `project_id`, `user_id`, `filename`, `content_type`, `file_size_bytes`, `storage_uri`, `status` ENUM(`pending|processing|ready|error`), `error_message`, `duration_frames`, `width`, `height`, `fps` DECIMAL(10,4), `thumbnail_uri`, `waveform_json` JSON, `created_at`, `updated_at`
- added: composite index `idx_project_assets_project_status` on `(project_id, status)`
- added: `apps/api/src/__tests__/integration/migration-001.test.ts` — table existence, idempotency, column types, ENUM default/rejection, index presence

## Redis + BullMQ Infrastructure (Subtask 3)
- updated: `docker-compose.yml` — Redis healthcheck (`redis-cli ping`, 5s, 3 retries)
- updated: `apps/api/src/queues/bullmq.ts` — error handlers on all Queue instances; removed Worker re-export
- updated: `apps/media-worker/src/index.ts` — error handler, SIGTERM/SIGINT graceful shutdown, `concurrency: 2`
- updated: `apps/render-worker/src/index.ts` — same pattern, `concurrency: 1` (Remotion SSR is CPU-heavy)
- fixed: `bullmq.ts` import `../config.js` → `@/config.js` (§9 alias convention)
- fixed: added `"paths": { "@/*": ["./src/*"] }` to `apps/api/tsconfig.json`
- fixed: added `tsc-alias` to api build pipeline

## Presigned URL Endpoint (Subtask 4)
- added: `apps/api/src/lib/errors.ts` — `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`
- added: `apps/api/src/lib/s3.ts` — singleton `S3Client`; `forcePathStyle` for R2
- added: `apps/api/src/types/express.d.ts` — `req.user?: { id, email }`
- added: `apps/api/src/middleware/validate.middleware.ts` — `validateBody(schema)` Zod middleware
- added: `apps/api/src/middleware/auth.middleware.ts` — Bearer JWT verification
- added: `apps/api/src/middleware/acl.middleware.ts` — auth-presence stub
- added: `apps/api/src/repositories/asset.repository.ts` — `insertPendingAsset`, `getAssetById`, `updateAssetStatus`
- added: `apps/api/src/services/asset.service.ts` — `createUploadUrl` (allowlist, filename sanitize, max 2 GiB, 15 min presigned PUT), `getAsset`
- added: `apps/api/src/controllers/assets.controller.ts`, `apps/api/src/routes/assets.routes.ts` — `POST /projects/:id/assets/upload-url`, `GET /assets/:id`
- updated: `apps/api/src/index.ts` — registered assetsRouter; centralized error handler
- tested: `asset.service.test.ts` — 13 unit tests; `assets-endpoints.test.ts` — integration tests
- fixed: `sanitizeFilename` — strip `..` traversal; guard all-underscore filenames
- fixed: `validateBody` middleware added to upload-url route (was missing)
- fixed: `ConflictError` mapped in central error handler
- fixed: `docs/architecture-rules.md` §3 updated with `lib/` and `types/` folders
- fixed: test descriptions changed to present-tense per §10

## Asset Finalization + Ingest Enqueue (Subtask 5)
- added: `apps/api/src/queues/jobs/enqueue-ingest.ts` — `MediaIngestJobPayload` + `enqueueIngestJob()`; BullMQ `jobId=assetId` idempotency; 3 retries, exponential backoff (5s base)
- updated: `asset.service.ts` — `finalizeAsset`: NotFoundError guard, idempotency for `processing`/`ready`, S3 HEAD verify, status → `processing`, enqueue
- updated: `assets.controller.ts`, `assets.routes.ts` — `POST /assets/:id/finalize` + `aclMiddleware('editor')`
- tested: `asset.finalize.service.test.ts` — 7 unit tests; `assets-finalize-endpoint.test.ts` — 6 integration tests
- fixed: split test files to stay under 300-line limit

## Media Worker — Ingest Job (Subtask 6)
- added: `packages/project-schema/src/types/job-payloads.ts` — `MediaIngestJobPayload` (single source of truth)
- updated: `enqueue-ingest.ts` — imports from `@ai-video-editor/project-schema`
- added: `apps/media-worker/src/lib/s3.ts`, `db.ts` — singleton S3Client + mysql2 pool
- added: `apps/media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform peaks → S3 upload → DB `ready`; error path → DB `error` + re-throw
- added: `apps/media-worker/Dockerfile` — `node:20-alpine` + `apk add ffmpeg`
- updated: `docker-compose.yml` — `media-worker` service
- tested: `ingest.job.test.ts` — 11 unit tests (helpers + flow)
- fixed: `@/` alias + `tsc-alias` added to media-worker tsconfig/package.json
- fixed: all relative imports in media-worker replaced with `@/` absolute imports

## Asset Browser Panel + Upload UI (Subtask 7)
- added: `apps/web-editor/src/features/asset-manager/types.ts` — `Asset`, `AssetStatus`, `AssetFilterTab`, `UploadEntry`, `UploadUrlRequest`, `UploadUrlResponse`
- added: `api.ts` — `requestUploadUrl`, `finalizeAsset`, `getAsset`, `getAssets`
- added: `hooks/useAssetUpload.ts` — multi-file XHR upload (native XHR for upload progress), finalize, `onUploadComplete`
- added: `hooks/useAssetPolling.ts` — 2s interval, stops on `ready`/`error`; callbacks in refs to avoid interval restart
- added: `components/AssetCard.tsx` — 296×64px card with thumbnail, filename, type label, status badge
- added: `components/AssetDetailPanel.tsx` — 280px panel: preview, metadata, disabled Replace/Delete buttons
- added: `components/UploadDropzone.tsx` + `UploadProgressList.tsx` — modal with drag-and-drop, XHR progress bars
- added: `components/AssetBrowserPanel.tsx` — 320px panel: tabs, search, React Query asset list, upload modal; `AssetPoller` private helper for per-asset polling (avoids hooks-in-loops)
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6)
- fixed: `interface` → `type` for non-Props shapes (§9)
- fixed: import group blank lines (§9)

## Docker Services (API + Web Editor)
- added: `apps/api/Dockerfile`, `apps/web-editor/Dockerfile`
- updated: `docker-compose.yml` — `api` (port 3001, depends on db+redis), `web-editor` (port 5173, depends on api)
- fixed: `npm ci` → `npm install` (no root lockfile)
- fixed: `workspace:*` → `file:` paths in api, media-worker, render-worker, api-contracts, editor-core, remotion-comps `package.json` files (npm doesn't support pnpm `workspace:` protocol)

## App Wiring + Backend List Route
- updated: `apps/web-editor/src/main.tsx` — mount `AssetBrowserPanel` with hardcoded `DEV_PROJECT_ID='dev-project-001'`
- added: `GET /projects/:id/assets` — `getAssetsByProjectId` in repository/service/controller/routes; returns `[]` for unknown projects
- tested: `assets-list-endpoint.test.ts` — 5 integration tests (401, 200 empty, 200 with assets, cross-project isolation)
- updated: `api.ts` — `requestUploadUrl` URL fixed to `/projects/${projectId}/assets/upload-url`

## Known Issues / TODOs
- ACL middleware is a stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` is a stub — typed API client deferred until OpenAPI spec exists
- `getTypeLabel` duplicated in FE — extract to `src/shared/utils/` if a third consumer appears
- Web editor tests require pnpm: `cd apps/web-editor && pnpm install && pnpm test`

---

## [2026-04-01]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Fix `VideoComposition` — z-order, trim passthrough, and muted track filtering

**What was done:**
- Updated `packages/remotion-comps/src/compositions/VideoComposition.tsx` to:
  - Build a `trackIndexMap` (trackId → array index) and `mutedTrackIds` set at render time.
  - Sort clips by track array index before rendering so z-order matches the track order in `projectDoc.tracks`.
  - Skip clips whose `trackId` is in `mutedTrackIds` (return `null`).
  - Pass `clip.trimInFrame` as `startFrom` and `clip.trimOutFrame` as `endAt` to `VideoLayer` and `AudioLayer`.
  - Use `[...projectDoc.clips].sort(...)` — spreads first to avoid mutating the input prop array.
- Added `packages/remotion-comps/vitest.config.ts` — jsdom environment for React component tests.
- Added `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` to `packages/remotion-comps/package.json` devDependencies.
- Added `packages/remotion-comps/src/compositions/VideoComposition.test.tsx` — 15 unit tests covering: empty timeline, clip rendering (video/audio/text-overlay), trim passthrough (`startFrom`/`endAt`), muted track filtering, z-order sort, and immutability of source array.

**Notes:**
- Remotion primitives (`AbsoluteFill`, `Sequence`, `Video`, `Audio`, `getRemotionEnvironment`) are fully mocked in the test file. This avoids requiring a Remotion Player context in unit tests while still exercising the composition logic.
- Z-order: track at array index 0 renders first (bottom layer); highest index renders last (top layer). This matches CSS stacking — later children paint on top.
- Clips with a `trackId` not present in `projectDoc.tracks` are treated as unmuted and still rendered; this is intentional (defensive over silent data loss).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix `VideoComposition` — z-order, trim passthrough, and muted track filtering</summary>

- What: Update `VideoComposition.tsx` to (a) sort clips by their track's index in `projectDoc.tracks` so z-order is correct, (b) pass `trimInFrame` as `startFrom` and `trimOutFrame` as `endAt` to `VideoLayer`, (c) skip clips whose parent track is `muted`.
- Where: `packages/remotion-comps/src/compositions/VideoComposition.tsx`
- Why: Current implementation ignores track order and mute state; these are required acceptance criteria from the epic.
- Depends on: none

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-02]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Wire preview layout into `main.tsx`

**What was done:**
- Extracted `App` and `PreviewSection` components from `main.tsx` into `apps/web-editor/src/App.tsx` so the layout is testable.
- `main.tsx` is now a minimal mount point: imports `App` from `@/App` and calls `ReactDOM.createRoot`.
- `App.tsx` implements the two-column editor shell:
  - Left column: `<aside>` (320px fixed, `surface-alt` #16161F background) containing `AssetBrowserPanel` with hardcoded `DEV_PROJECT_ID = 'dev-project-001'`.
  - Vertical divider: 1px `div` with `border` #252535 background.
  - Center column: `<main>` (flex: 1, `surface` #0D0D14 background) containing `PreviewSection`.
- `PreviewSection` calls `useRemotionPlayer()` once to obtain the shared `playerRef`, then renders `PreviewPanel` (passing `playerRef` as prop) and `PlaybackControls` (also receiving `playerRef`) stacked vertically with `flexDirection: 'column'`.
- Modified `apps/web-editor/src/features/preview/components/PreviewPanel.tsx`:
  - Added optional `playerRef?: React.RefObject<PlayerRef | null>` prop.
  - When provided, the external ref is forwarded to Remotion `<Player>`; otherwise the internal ref from `useRemotionPlayer()` is used.
  - No breaking change — all existing tests pass with no-prop usage.
- Created `apps/web-editor/src/App.test.tsx` — 13 unit tests covering:
  - App renders without crashing.
  - `AssetBrowserPanel` is rendered inside the `<aside>` with correct `DEV_PROJECT_ID`.
  - `PreviewPanel` and `PlaybackControls` are rendered inside `<main>`.
  - Shell uses flex layout and `surface` background (#0D0D14 → `rgb(13, 13, 20)`).
  - Sidebar is 320px wide with `surface-alt` background.
  - Vertical divider has `border` background and 1px width.
  - `PreviewSection` stacks preview above controls (`flexDirection: 'column'`).

**Notes:**
- `PreviewSection` must call `useRemotionPlayer()` only once — both `PreviewPanel` and `PlaybackControls` share the same `playerRef`. If `PreviewPanel` called the hook internally with a different ref, `PlaybackControls` would control a phantom Player instance.
- `App.tsx` is a natural extraction point since `main.tsx` is not importable for testing (it side-effects via `ReactDOM.createRoot`).
- All 129 tests pass across the web-editor app (11 test files).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Wire preview layout into `main.tsx`</summary>

- What: Update `apps/web-editor/src/main.tsx` to render a two-column editor shell: left column holds `AssetBrowserPanel` (320px fixed), center column holds `PreviewPanel` + `PlaybackControls` stacked vertically. Use the dark theme colors from the design guide (`surface` #0D0D14 background, `surface-alt` #16161F panels, `border` #252535 dividers). No routing or project selector yet — keep `DEV_PROJECT_ID` hardcoded. This is the last step and just wires everything together.
- Where: `apps/web-editor/src/main.tsx`
- Why: Without wiring, the preview panel exists but is unreachable in the running app.
- Depends on: Subtasks 3, 4, 5, 6

</details>

checked by code-reviewer - YES (resolved in "Review fix" entry below)
checked by qa-reviewer - YES

---

## [2026-04-02]

### Task: Client Feedback Fixes — EPIC 2 Cleanup
**Subtask:** Formally defer the timeline ruler sync criterion in the development log

**What was done:**
- Verified `docs/development_logs.md` already contains an explicit EPIC 2 deferral note (section "## [2026-04-02] — EPIC 2 Deferral Note") stating:
  - The "Playhead frame synced bi-directionally with the timeline ruler" criterion is deferred to the Timeline Editor epic.
  - The `ephemeral-store` (`setPlayheadFrame`) is pre-wired and ready to receive the timeline ruler frame position.
  - No code change required.
- Both reviewers already marked that entry YES. No modifications needed.

**Notes:**
- This was a documentation-only task. The deferral note was already present in the log from prior work; this subtask confirms it satisfies the acceptance criteria and formally closes it.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Formally defer the timeline ruler sync criterion in the development log</summary>

Add a note to `docs/development_logs.md` under the EPIC 2 section stating that the "Playhead frame synced bi-directionally with the timeline ruler" criterion is deferred to the Timeline Editor epic, and that `ephemeral-store` is already pre-wired for the connection.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-02]

### Task: Client Feedback Fixes — EPIC 2 Cleanup
**Subtask:** Add a stub clip to the dev fixture so the preview visibly shows the player is working

**What was done:**
- Verified `apps/web-editor/src/store/project-store.ts` already contains a `TextOverlayClip` in `DEV_PROJECT`:
  - `text: 'ClipTale'`, `fontSize: 64`, `color: '#F0F0FA'`, `position: 'center'`
  - `startFrame: 0`, `durationFrames: 300` (10 seconds at 30 fps)
  - Matching `overlay` track with `id: DEV_TRACK_ID` in `tracks[]`
- Verified `apps/web-editor/src/store/project-store.test.ts` already covers this fixture with `DEV_PROJECT contains a TextOverlayClip with the expected fields` — 7 assertions on clip type, text, fontSize, color, position, startFrame, durationFrames.
- No code changes required — fixture and tests were already in the working tree.

**Notes:**
- The `TextOverlayLayer` component in `packages/remotion-comps` renders pure text with no asset dependency, so the preview canvas shows "ClipTale" immediately when the app opens without any backend or upload flow.
- `as unknown as ProjectDoc` cast is intentional — the project schema Zod types use a discriminated union that TypeScript cannot fully narrow at the fixture level without the cast.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add a stub clip to the dev fixture so the preview visibly shows the player is working</summary>

Update `DEV_PROJECT` in `apps/web-editor/src/store/project-store.ts` to include a `TextOverlayClip` centered on the canvas with `startFrame: 0` and `durationFrames: 300`, plus a matching track entry, so the preview canvas shows visible content instead of a black rectangle.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-02]

### Task: Client Feedback Fixes — EPIC 2 Cleanup
**Subtask:** Resolve three code-reviewer issues on App.tsx and App.test.tsx

**What was done:**
- Verified `export function App()` in `apps/web-editor/src/App.tsx` already has a JSDoc comment (lines 47–50) — §9 satisfied.
- Verified `apps/web-editor/src/App.test.tsx` contains no CSS property assertions — all tests are behavior-focused (DOM roles, aria attributes, testid presence, DOM order) — §10 satisfied. Two CSS-asserting tests from the original 13 were removed; 11 tests remain.
- Verified `docs/architecture-rules.md` §3 folder tree already documents `App.tsx` at `apps/web-editor/src/` root (line 103: `App.tsx — Root app shell: QueryClient provider + two-column layout`) — §3 satisfied.
- Reset `code-reviewer` status on the "Wire preview layout into main.tsx" log entry from `COMMENTED` → `NOT` to trigger a clean re-review.

**Notes:**
- No code files were modified; all three issues were already addressed in the working tree before this task was executed. The only change is the dev log status reset to allow the code-reviewer to re-evaluate.
- The original dev log for "Wire preview layout" described 13 tests including CSS assertions; those CSS tests have since been removed and replaced with structural/behavior assertions, bringing the count to 11.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Resolve the three code-reviewer issues on App.tsx and App.test.tsx</summary>

Address all three issues flagged by the code-reviewer:
1. JSDoc on `export function App()` — verified present.
2. Remove CSS rendering detail assertions from `App.test.tsx` — verified absent; tests are behavior-focused.
3. Document `App.tsx` placement in architecture rules §3 — verified already documented.

</details>

checked by code-reviewer - YES (superseded by "Review fix" entry)
checked by qa-reviewer - YES (superseded by "Review fix" entry)

---

## [2026-04-01]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Add Storybook to `packages/remotion-comps/`

**What was done:**
- Installed Storybook 10 (react-vite builder) into `packages/remotion-comps/` devDependencies: `storybook`, `@storybook/react`, `@storybook/react-vite`, `vite`.
- Created `packages/remotion-comps/.storybook/main.ts` — Storybook config pointing to `src/**/*.stories.@(ts|tsx)`, using `@storybook/react-vite` framework.
- Created `packages/remotion-comps/.storybook/preview.ts` — dark theme backgrounds matching design-guide surface colors (#0D0D14, #16161F).
- Added `storybook` and `build-storybook` scripts to `packages/remotion-comps/package.json`.
- Created `packages/remotion-comps/src/stories/VideoComposition.stories.tsx` with 5 stories, each wrapping `VideoComposition` in a `<Player>` instance:
  - `EmptyTimeline` — empty tracks/clips; verifies no crash.
  - `SingleVideoClip` — one video track + clip; stub MP4 URL from archive.org.
  - `AudioAndVideo` — video track + audio track both active; two clips.
  - `OverlappingClips` — two video tracks with clips overlapping in time; tests z-order visually.
  - `TextOverlay` — video clip + text-overlay clip using `TextOverlayLayer`; text "ClipTale Preview" at bottom.
- Fixed: code-reviewer comments from Subtask 1 (see below):
  - Removed unused `beforeEach` import from `VideoComposition.test.tsx`.
  - Extracted fixtures (`makeProjectDoc`, `TRACK_*`, `CLIP_*`) to `VideoComposition.fixtures.ts`; test file reduced from 327 → 253 lines.
  - Extracted sort/filter logic from `VideoComposition.tsx` to `VideoComposition.utils.ts` (`prepareClipsForComposition`) per §5 (no business logic in compositions).
  - Added `VideoComposition.utils.test.ts` — 7 unit tests covering mute filtering, z-order sort, immutability, and edge cases.

**Notes:**
- Storybook 10 no longer uses `@storybook/addon-essentials` as a separate package — essentials functionality is built in. The dependency was removed after npm installed a mismatched v8 version.
- Story asset URLs use a royalty-free MP4 from the Blender Foundation (Big Buck Bunny) hosted on archive.org. Stories work without a running backend.
- The `.storybook/` directory is intentionally excluded from `tsconfig.json` (rootDir is `src`); Storybook resolves its own config files independently via the vite builder.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add Storybook to `packages/remotion-comps/`</summary>

- What: Install and configure Storybook (react + vite builder) in `packages/remotion-comps/`. Add stories covering: empty timeline, single video clip, audio + video together, overlapping clips, text overlay. Use stub asset URLs (e.g. a publicly accessible royalty-free MP4 or a data URI for image stubs) so stories work without a running backend. Wrap each story with a `<Player>` instance (not just rendering the composition directly) so stories exercise the real Player integration path.
- Where: `packages/remotion-comps/.storybook/`, `packages/remotion-comps/src/stories/`
- Why: Acceptance criterion from the epic; enables visual regression testing and isolated composition development.
- Depends on: Subtask 1

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-01]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Create `project-store.ts` and `ephemeral-store.ts`

**What was done:**
- Created `apps/web-editor/src/store/project-store.ts`:
  - Module-level singleton holding a `ProjectDoc` snapshot.
  - Exposes `getSnapshot()`, `subscribe()`, `setProject()`, and `useProjectStore()` hook.
  - Seeded with a dev fixture (valid UUID, `fps: 30`, `durationFrames: 300`, 1920×1080, empty tracks and clips) for development.
- Created `apps/web-editor/src/store/ephemeral-store.ts`:
  - Module-level singleton holding `{ playheadFrame, selectedClipIds, zoom }`.
  - Exposes `getSnapshot()`, `subscribe()`, `setPlayheadFrame()`, `setSelectedClips()`, `setZoom()`, and `useEphemeralStore()` hook.
  - `setPlayheadFrame` and `setZoom` skip subscriber notification when the value is unchanged — prevents unnecessary re-renders from high-frequency calls.
  - Both stores use `useSyncExternalStore` for React integration.
- Created `apps/web-editor/src/store/project-store.test.ts` — 9 unit tests: getSnapshot shape, setProject replacement + reference equality + subscriber notification, multi-subscriber, unsubscribe isolation, edge cases.
- Created `apps/web-editor/src/store/ephemeral-store.test.ts` — 14 unit tests: all setters, no-op deduplication for frame/zoom, subscriber lifecycle, multi-subscriber, unsubscribe isolation.

**Notes:**
- The stores are module-level singletons (not created inside hooks/components). This is intentional — all consumers across the component tree share the exact same instance.
- The rAF loop in `usePlaybackControls` (Subtask 5) must NOT call `setPlayheadFrame` on every tick. Instead it should mutate a CSS custom property directly. `setPlayheadFrame` is for seek/step operations that need a React re-render.
- `setSelectedClips` always notifies (no dedup) because reference equality on arrays is meaningless for this use case — callers pass fresh arrays.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Create `project-store.ts` and `ephemeral-store.ts`</summary>

- What: Implement both stores in `apps/web-editor/src/store/`.
  - `project-store.ts`: `useSyncExternalStore`-based store holding a `ProjectDoc`. Expose `getSnapshot()`, `subscribe()`, `setProject()`. Seed with a dev fixture (empty project doc with valid UUID, `fps: 30`, `durationFrames: 300`, `width: 1920`, `height: 1080`, empty `tracks` and `clips` arrays) for development until the project CRUD epic lands.
  - `ephemeral-store.ts`: `useSyncExternalStore`-based store holding `{ playheadFrame: number, selectedClipIds: string[], zoom: number }`. Expose `getSnapshot()`, `subscribe()`, `setPlayheadFrame()`, `setSelectedClips()`, `setZoom()`. Must allow high-frequency `setPlayheadFrame` calls without triggering unnecessary subscriber notifications (use ref + batching if needed).
  - Do NOT create `history-store.ts` — deferred to the undo/redo epic.
- Where: `apps/web-editor/src/store/project-store.ts`, `apps/web-editor/src/store/ephemeral-store.ts`
- Why: The Player and controls both need granular subscriptions to project and playback state; React context would cause full-tree re-renders.
- Depends on: none (parallel with Subtask 1)

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-01]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Build `PreviewPanel` component + `useRemotionPlayer` hook

**What was done:**
- Created `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts`:
  - Subscribes to `project-store` and `ephemeral-store` via `useSyncExternalStore`.
  - Collects unique `assetId` values from video and audio clips, deduplicating via `Set`.
  - Batches asset URL resolution using React Query `useQueries` (one query per unique assetId, `staleTime: 5 min`).
  - Builds `assetUrls: Record<string, string>` map keyed by assetId from `asset.storageUri`.
  - Returns `{ projectDoc, assetUrls, currentFrame, playerRef }`.
- Created `apps/web-editor/src/features/preview/components/PreviewPanel.tsx`:
  - Uses `useRemotionPlayer` hook for all data and the player ref.
  - Memoizes `inputProps = { projectDoc, assetUrls }` with `useMemo` keyed on both values to prevent composition re-mounts.
  - Mounts Remotion `<Player>` with `component={VideoComposition}`, full project doc props, and `controls={false}` (PlaybackControls provides the UI).
  - Container uses `surface` (#0D0D14) background with flexbox centering; player fills container with `width/height: 100%`.
- Created `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.test.ts` — 11 unit tests covering:
  - Project doc passthrough from project store
  - `currentFrame` from ephemeral store playheadFrame
  - `playerRef` shape and initial null value
  - Empty project produces empty assetUrls and zero queries
  - Unique assetIds per query (deduplication)
  - Text-overlay clips excluded from asset queries
  - Resolved query data populates assetUrls map
  - Loading query results omitted from assetUrls map

**Notes:**
- `storage_uri` is used directly as the asset URL. A presigned download endpoint (`GET /assets/:id/download-url`) is deferred to a later epic per Open Question #2 in the task spec.
- The `inputProps` `useMemo` dependency array includes both `projectDoc` and `assetUrls`. Since `assetUrls` is rebuilt every render from `useQueries` results, stability depends on React Query's referential stability for unchanged results.
- `controls={false}` on `<Player>` intentionally hides Remotion's built-in controls — `PlaybackControls` (Subtask 5) will provide the editor's custom control bar.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Build `PreviewPanel` component + `useRemotionPlayer` hook</summary>

- What: Create `apps/web-editor/src/features/preview/components/PreviewPanel.tsx` and `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts`.
  - `useRemotionPlayer`: subscribes to `project-store` and `ephemeral-store` via `useSyncExternalStore`. Resolves asset URLs via React Query (call `GET /assets/:id` for each unique `assetId` in the project clips; use `useQueries` to batch). Returns `{ projectDoc, assetUrls, currentFrame, playerRef }`.
  - `PreviewPanel`: uses `useRemotionPlayer`, memoizes `inputProps` (`{ projectDoc, assetUrls }`) with `useMemo` keyed on the project doc and asset URL map. Mounts Remotion `<Player>` with `component={VideoComposition}`, `inputProps`, `fps`, `durationInFrames`, `compositionWidth`, `compositionHeight` from project doc. Use `style={{ width: '100%', height: '100%' }}` with `objectFit`-style letterboxing (Remotion's `playerRef` + CSS aspect-ratio trick). Player `ref` is forwarded from the hook for playback control.
  - No direct `GET /assets` call in the component — all data fetching in the hook.
- Where: `apps/web-editor/src/features/preview/components/PreviewPanel.tsx`, `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts`
- Why: Player integration is the core deliverable of this epic; memoization and hook isolation prevent performance regressions.
- Depends on: Subtask 1 (VideoComposition fixed), Subtask 3 (stores)

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-01]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Build `PlaybackControls` bar + `usePlaybackControls` hook

**What was done:**
- Created `apps/web-editor/src/features/preview/hooks/usePlaybackControls.ts`:
  - Accepts `playerRef: React.RefObject<PlayerRef | null>` from the caller.
  - Reads `fps` and `durationFrames` from the project store snapshot at call time.
  - Exposes `play()`, `pause()`, `rewind()`, `stepForward()`, `stepBack()`, `seekTo(frame)`, `isPlaying`, `currentFrame`, `totalFrames`, `timecode`, `containerRef`.
  - `play()` starts a `requestAnimationFrame` loop stored in `rafIdRef`. Each tick reads `player.getCurrentFrame()` and mutates `--playhead-frame` CSS custom property on the container element — does NOT call `setState` on every tick.
  - `pause()`, `stepForward()`, `stepBack()`, `rewind()`, and `seekTo()` all cancel the rAF loop, call `setPlayheadFrame()` on the ephemeral store, and update `currentFrame` React state so the frame counter and timecode re-render.
  - `useEffect` cleanup cancels the rAF loop on unmount to prevent memory leaks.
  - Keyboard listeners (`keydown`) wired on mount: Space (play/pause), ArrowLeft (step back), ArrowRight (step forward), Home (rewind). Listeners are skipped when focus is in an `<input>` or `<textarea>`.
  - Exported `formatTimecode(frame, fps)` utility produces `HH:MM:SS:FF` strings.
- Created `apps/web-editor/src/features/preview/components/PlaybackControls.tsx`:
  - Renders inside a `role="toolbar"` container with `aria-label="Playback controls"`.
  - Left group: rewind, step-back, play/pause (primary accent), step-forward.
  - Center: full-width `<input type="range">` scrub slider.
  - Right group: frame counter (`currentFrame / totalFrames`), divider, timecode.
  - All transport icons are inline SVG — no external icon library dependency.
  - Styled per design-guide: `surface-alt` (#16161F) background, `text-primary` text, `border` separators, `primary` (#7C3AED) accent on the play/pause button.
- Created `apps/web-editor/src/features/preview/hooks/usePlaybackControls.test.ts` — 44 unit tests covering:
  - `formatTimecode`: 8 cases (edge frames, fps variations, padding).
  - `usePlaybackControls` initial state (5 cases), `play()` (3), `pause()` (3), `rewind()` (3), `stepForward()` (2), `stepBack()` (2), `seekTo()` (4), keyboard listeners (7 including unmount cleanup), timecode update (1).
- Created `apps/web-editor/src/features/preview/components/PlaybackControls.test.tsx` — 18 tests covering: render (11 structural/attribute cases), interactions (5 click/change handlers), styling (2 color checks).

**Notes:**
- The rAF loop intentionally does not call `setPlayheadFrame` on every tick. CSS custom property mutation is direct DOM and has zero React overhead at 60fps.
- `isPlayingRef` mirrors the `isPlaying` state so the rAF closure can read it without capturing a stale value.
- jsdom normalises hex color values to `rgb()` notation; styling tests compare against normalised values.
- `formatTimecode` is exported separately so it can be unit-tested without rendering the hook.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Build `PlaybackControls` bar + `usePlaybackControls` hook</summary>

- What: Create `apps/web-editor/src/features/preview/components/PlaybackControls.tsx` and `apps/web-editor/src/features/preview/hooks/usePlaybackControls.ts`.
  - `usePlaybackControls`: receives `playerRef`. Exposes `play()`, `pause()`, `rewind()`, `stepForward()`, `stepBack()`, `seekTo(frame)`, `isPlaying`, `currentFrame`, `totalFrames`, `timecode`. Uses `requestAnimationFrame` loop during playback that reads `playerRef.current.getCurrentFrame()` and mutates a CSS custom property (`--playhead-frame`) on a provided DOM ref — does NOT call `setState` on every rAF tick. Wires keyboard listeners (Space, Left, Right, Home) on mount.
  - `PlaybackControls`: renders play/pause button, rewind-to-start, frame-step forward/back, current frame display (`frame / totalFrames`), timecode (`HH:MM:SS:FF`), and scrub slider. All connected via `usePlaybackControls`. Style per design-guide: `surface-alt` background (#16161F), `text-primary` text, `border` separators, `primary` accent on play button.
- Where: `apps/web-editor/src/features/preview/components/PlaybackControls.tsx`, `apps/web-editor/src/features/preview/hooks/usePlaybackControls.ts`
- Why: Completes the playback UX; rAF mutation pattern keeps the React tree isolated from 60fps updates.
- Depends on: Subtask 4 (playerRef from PreviewPanel)

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-01]

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Add dev auth bypass to API middleware

**What was done:**
- Updated `apps/api/src/middleware/auth.middleware.ts`:
  - Added a `DEV_USER` constant (`{ id: 'dev-user-001', email: 'dev@cliptale.local' }`).
  - Early-return guard: when `process.env.NODE_ENV === 'development'`, attaches `DEV_USER` to `req.user` and calls `next()` immediately, bypassing all JWT verification.
  - Production path is unchanged — JWT verification still runs when `NODE_ENV !== 'development'`.
- Updated `apps/api/src/middleware/acl.middleware.ts`:
  - Early-return guard: when `process.env.NODE_ENV === 'development'`, calls `next()` immediately, bypassing the `req.user` presence check.
  - Production path is unchanged.
- Updated `apps/api/src/middleware/auth.middleware.test.ts`:
  - Added a `describe('development bypass')` block (2 tests): verifies hardcoded dev user is attached and no error is passed to `next()` even with no Authorization header.
  - Uses `beforeEach`/`afterEach` to set/restore `process.env.NODE_ENV`.
- Updated `apps/api/src/middleware/acl.middleware.test.ts`:
  - Added a `describe('development bypass')` block (2 tests): verifies `next()` is called with no arguments even when `req.user` is absent, and for any role value.
  - Uses `beforeEach`/`afterEach` to set/restore `process.env.NODE_ENV`.
- All 14 tests pass (8 in auth, 6 in acl).

**Notes:**
- The bypass is gated entirely on `process.env.NODE_ENV === 'development'`. This string is injected at build time by Vite/esbuild in the API process. It cannot be set to `'development'` in production without modifying the server launch environment, making the bypass impossible to activate in production by accident.
- `DEV_USER` is a `const` with `as const` to prevent accidental mutation.
- The test environment sets `NODE_ENV = 'test'` by default (Vitest), so existing tests are unaffected by the bypass logic.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add dev auth bypass to API middleware</summary>

- What: Update `apps/api/src/middleware/auth.middleware.ts` to short-circuit in development: when `NODE_ENV === 'development'`, skip JWT verification and attach a hardcoded `req.user = { id: 'dev-user-001', email: 'dev@cliptale.local' }`. Gate this behind the env check so the bypass is impossible to activate in production. Also update `apps/api/src/middleware/acl.middleware.ts` to pass through in development (return `next()` immediately when `NODE_ENV === 'development'`). This is the only change needed to make all API endpoints callable from the UI without a real login flow.
- Where: `apps/api/src/middleware/auth.middleware.ts`, `apps/api/src/middleware/acl.middleware.ts`
- Why: EPIC 2 is all frontend — without this bypass every API call (asset list, asset URLs) returns 401, making the preview panel untestable in the browser during development. Auth is deferred to its own epic.
- Depends on: none

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
---

## [2026-04-02] — Review fix

### Task: EPIC 2 — Remotion Player Preview
**Subtask:** Wire preview layout into `main.tsx` — fix code-reviewer comments

**What was done:**
- Added JSDoc to `export function App()` in `apps/web-editor/src/App.tsx` (code-reviewer: ❌ missing JSDoc on exported function per §9).
- Removed inline-style assertions from `App.test.tsx` — tests that checked `style.background`, `style.width`, `style.display`, `style.flexDirection` were deleted and replaced with semantic/structural assertions (accessible label check, aria-hidden attribute, DOM ordering). Complies with §10: "Do NOT test React component rendering details".
- Updated `docs/architecture-rules.md` §3 folder structure to include `App.tsx` at `apps/web-editor/src/` root (code-reviewer: ⚠️ undocumented placement).
- All 129 tests still pass after removals.

**Notes:**
- Replaced 7 style-asserting tests with 3 behavior-asserting tests:
  - `sidebar` suite now checks accessible role + label instead of pixel width / hex background.
  - `vertical divider` suite now checks `aria-hidden="true"` attribute instead of `style.background` and `style.width`.
  - `PreviewSection` DOM-order test no longer checks `style.flexDirection`.
- Test count dropped from 13 to 10 in `App.test.tsx`; this is intentional — the removed tests were invalid per architecture rules.

checked by code-reviewer - OK
checked by qa-reviewer - YES

---

## [2026-04-02]

### Task: EPIC 2 cleanup — Add visible content to dev fixture
**Subtask:** Add stub TextOverlayClip to DEV_PROJECT so preview shows visible content

**What was done:**
- Updated `apps/web-editor/src/store/project-store.ts`:
  - Added a `DEV_TRACK_ID` and `DEV_CLIP_ID` constant (fixed UUIDs) for the dev fixture track and clip.
  - Added one overlay track (`type: 'overlay'`, name: `'Text Overlay'`, `muted: false`, `locked: false`) to `DEV_PROJECT.tracks`.
  - Added one `TextOverlayClip` (`type: 'text-overlay'`, `text: 'ClipTale'`, `fontSize: 64`, `color: '#F0F0FA'`, `position: 'center'`, `startFrame: 0`, `durationFrames: 300`) to `DEV_PROJECT.clips`.
  - The clip spans the full 300-frame (10s at 30fps) duration of the dev fixture, so the text is visible for the entire playback.
- All 129 existing tests continue to pass — this is a fixture-only change with no logic modifications.

**Notes:**
- No new tests were written — this is a data fixture update, not a logic change. The task spec explicitly states "No new tests required."
- The `TextOverlayLayer` renders pure text, so no asset upload or backend is needed for the preview to show content.
- Fixed UUIDs (`000...0010` for track, `000...0020` for clip) are used to keep the fixture deterministic across reloads.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add stub TextOverlayClip to DEV_PROJECT</summary>

In `apps/web-editor/src/store/project-store.ts`, update the `DEV_PROJECT` fixture to include at least one `TextOverlayClip` with `startFrame: 0` and `durationFrames: 300`, and a matching track entry in `tracks[]`.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-02] — EPIC 2 Deferral Note

### Task: EPIC 2 — Remotion Player Preview (closing note)
**Subtask:** Formally defer the timeline ruler sync criterion

**Deferral:**
The EPIC 2 acceptance criterion "Playhead frame synced bi-directionally with the timeline ruler" is **deferred to the Timeline Editor epic**.

The Timeline Editor surface does not yet exist — it belongs to a future epic. This criterion cannot be verified against the current application.

**Architecture status:**
The `ephemeral-store` (`setPlayheadFrame` in `apps/web-editor/src/store/ephemeral-store.ts`) is already pre-wired and ready to receive the timeline ruler's frame position when it is built. No code change is required; the architecture is prepared for the connection.

**No code change.** This is a documentation-only note to formally close EPIC 2 without leaving an ambiguous open criterion.

checked by code-reviewer - YES
checked by qa-reviewer - YES

---

## [2026-04-02]

### Task: Client Feedback — Frame counter, timecode, and scrub slider frozen during playback
**Subtask:** Fix rAF loop to drive frame counter, timecode, and scrub slider in real time during playback

**What was done:**
- Identified root cause in `apps/web-editor/src/features/preview/hooks/usePlaybackControls.ts`: the rAF `tick` function read the current frame and set the CSS custom property `--playhead-frame`, but never called `setCurrentFrameState(frame)`. As a result, the `currentFrame` React state remained at 0 during playback — only updating when the video stopped (via the `!stillPlaying` branch).
- Added `setCurrentFrameState(frame)` call inside the `tick` function, immediately after the CSS property mutation. The frame counter, timecode, and scrub slider are all derived from `currentFrame`, so this single line fix makes all three update in real time.
- Updated the JSDoc on `usePlaybackControls` to accurately describe that the rAF loop now calls `setCurrentFrameState` on each tick alongside the CSS property mutation.
- Added 4 new tests in a `rAF loop — live frame updates during playback` describe block in `apps/web-editor/src/features/preview/hooks/usePlaybackControls.test.ts`:
  - `updates currentFrame on each rAF tick while playing` — verifies `currentFrame` matches the player frame after one tick.
  - `updates timecode on each rAF tick while playing` — verifies timecode advances to match the tick frame (30 frames → `00:00:01:00`).
  - `sets currentFrame to finalFrame when player stops itself` — verifies `currentFrame` and `isPlaying` are correctly set when the player auto-stops at end of clip.
  - `preserves --playhead-frame CSS custom property alongside React state update` — verifies both the CSS custom property AND React state are updated on the same tick.
- All 135 tests pass.

**Notes:**
- The `--playhead-frame` CSS custom property is preserved unchanged — it will be used by the future timeline ruler component.
- The new tests use a synchronous fake rAF: `vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { capturedCallback = cb; return 1; }))`. The tick callback is fired manually inside `act()` to ensure `isPlayingRef.current` is `true` (synced via useEffect) before the tick runs.
- Pre-existing rAF stub in `beforeEach` still applies to all other tests — the new tests override it locally with `vi.stubGlobal` inside each `it` block.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Frame counter, timecode, and scrub slider must update during playback</summary>

During playback, the frame counter, timecode, and scrub slider position should update in real time to reflect the frame the Remotion Player is currently on. The existing rAF loop already reads the current frame from the player on every tick. That frame value needs to also drive the visible counter, timecode, and slider — not just the CSS custom property that's reserved for the future timeline ruler.

</details>

checked by code-reviewer - YES (resolved in "Review fix" entry below)
checked by qa-reviewer - YES
---

## [2026-04-02] — Review fix

### Task: Client Feedback — Frame counter, timecode, and scrub slider frozen during playback
**Subtask:** Fix code-reviewer comments on the rAF loop fix

**What was done:**
- Created `apps/web-editor/src/features/preview/hooks/usePlaybackControls.fixtures.ts`:
  - Extracted `makePlayerRef` and `makeProjectDoc` fixture helpers from both test files into a single shared module.
  - Both helpers are exported with JSDoc comments per §9.
- Moved the `rAF loop — live frame updates during playback` describe block out of `usePlaybackControls.test.ts` and into a new `apps/web-editor/src/features/preview/hooks/usePlaybackControls.raf.test.ts`:
  - All 4 rAF tests retained verbatim; no test logic changed.
  - `usePlaybackControls.test.ts` reduced from 366 lines → 194 lines (well under the 300-line limit from §9).
- Updated `apps/web-editor/src/features/preview/hooks/usePlaybackControls.test.ts`:
  - Removed local `makePlayerRef` and `makeProjectDoc` definitions.
  - Added import from `./usePlaybackControls.fixtures.js`.
- Updated `apps/web-editor/src/features/preview/hooks/usePlaybackControls.seek.test.ts`:
  - Removed local `makePlayerRef` and `makeProjectDoc` definitions.
  - Added import from `./usePlaybackControls.fixtures.js`.
  - File is 247 lines — under the 300-line limit.
- Updated `docs/architecture-rules.md` §9 "File length" section:
  - Added "Split test file naming convention" subsection documenting the multi-part suffix pattern (`.seek.test.ts`, `.raf.test.ts`, etc.) and the requirement to extract shared fixtures to a co-located `.fixtures.ts` file.
- All 135 tests pass.

**Notes:**
- The `.raf.test.ts` suffix was chosen over merging into `.seek.test.ts` because rAF loop tests are thematically distinct from seek/navigation tests, and the seek file at 247 lines has limited headroom.
- `usePlaybackControls.fixtures.ts` does not import from the hook itself — it only provides test data factories and a mock PlayerRef builder. No circular dependencies introduced.

checked by code-reviewer - YES
checked by qa-reviewer - YES

---
## Release Snapshot — 2026-04-02 21:47 UTC

# Development Log (compacted — 2026-03-29 to 2026-04-02)

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
- fixed: `usePlaybackControls.ts` rAF `tick` was missing `setCurrentFrameState(frame)` call — frame counter, timecode, scrub slider all frozen during playback; added single call after CSS property mutation
- updated: JSDoc on `usePlaybackControls` to reflect both CSS and state update
- added: `usePlaybackControls.raf.test.ts` (4 tests), `usePlaybackControls.seek.test.ts` refactored
- added: `usePlaybackControls.fixtures.ts` — shared `makePlayerRef` / `makeProjectDoc` factories extracted from both test files
- updated: `docs/architecture-rules.md` §9 — documented multi-part test suffix convention and `.fixtures.ts` co-location rule

## EPIC 2 — Dev Fixture: Visible Preview Content
- updated: `apps/web-editor/src/store/project-store.ts` — added `TextOverlayClip` (`text: 'ClipTale'`, fontSize 64, color `#F0F0FA`, center, 0–300 frames) + matching overlay track to `DEV_PROJECT`

## EPIC 2 — Deferral Note
- deferred: "Playhead frame synced bi-directionally with the timeline ruler" — deferred to Timeline Editor epic; `ephemeral-store.setPlayheadFrame` is pre-wired and ready

## Known Issues / TODOs
- ACL middleware is a stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` is a stub — typed API client deferred until OpenAPI spec exists
- `getTypeLabel` duplicated in FE — extract to `src/shared/utils/` if a third consumer appears
- Presigned download URL (`GET /assets/:id/download-url`) deferred to a later epic; `storage_uri` used directly for now
- Timeline ruler bi-directional sync deferred to Timeline Editor epic
