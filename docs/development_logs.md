# Development Log (compacted — 2026-03-29 to 2026-04-04)

## Monorepo Scaffold (Epic 1)
- added: `package.json`, `turbo.json` — npm workspaces, Turborepo pipeline
- added: root `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` (MySQL 8 + Redis 7)
- added: `apps/api/` — Express + helmet + cors + rate-limit; BullMQ queue stubs
- added: `apps/web-editor/` — React 18 + Vite; `apps/media-worker/`, `apps/render-worker/` — BullMQ stubs
- added: `packages/project-schema/` — Zod schemas: `ProjectDoc`, `Track`, `Clip` union
- added: `packages/remotion-comps/` — `VideoComposition` + layer components
- tested: `clip.schema.test.ts` (14), `project-doc.schema.test.ts` (7)
- fixed: `APP_` env prefix; Zod startup validation; `VITE_PUBLIC_API_BASE_URL`; `workspace:*` → `file:` paths

## DB Migrations
- added: `001_project_assets_current.sql` — `project_assets_current` table; tested `migration-001.test.ts`
- added: `002_caption_tracks.sql` — `caption_tracks` table; tested `migration-002.test.ts`
- added: `003_project_versions.sql` — `projects`, `project_versions`, `project_version_patches`, `project_audit_log` tables; tested `migration-003.test.ts` + `migration-003.patches-audit.test.ts`

## Redis + BullMQ Infrastructure (Epic 1)
- updated: `docker-compose.yml` Redis healthcheck; `bullmq.ts` error handlers
- updated: media-worker + render-worker — error handlers, graceful shutdown, concurrency settings
- fixed: `@/` alias + `tsc-alias` in api tsconfig

## Asset Upload Pipeline (Epic 1)
- added: `apps/api/src/lib/errors.ts` — `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`
- added: `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: `asset.repository.ts`, `asset.service.ts`, `assets.controller.ts`, `assets.routes.ts`
- added: `POST /projects/:id/assets/upload-url`, `GET /assets/:id`, `GET /projects/:id/assets`
- added: `enqueue-ingest.ts` — idempotency, 3 retries, exponential backoff
- added: `POST /assets/:id/finalize` with `aclMiddleware('editor')`
- tested: `asset.service.test.ts` (13), `assets-endpoints.test.ts`, `asset.finalize.service.test.ts` (7), `assets-finalize-endpoint.test.ts` (6)

## Media Worker — Ingest Job (Epic 1)
- added: `MediaIngestJobPayload` single source of truth in `job-payloads.ts`
- added: `media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform → S3 upload → DB ready
- added: `media-worker/Dockerfile` — node:20-alpine + ffmpeg; updated `docker-compose.yml`
- tested: `ingest.job.test.ts` (11)

## Asset Browser Panel + Upload UI (Epic 1)
- added: `features/asset-manager/` — `types.ts`, `api.ts`, `useAssetUpload.ts`, `useAssetPolling.ts`, `AssetCard.tsx`, `AssetDetailPanel.tsx`, `UploadDropzone.tsx`, `UploadProgressList.tsx`, `AssetBrowserPanel.tsx`
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6)

## VideoComposition + Storybook (Epic 2)
- updated: `VideoComposition.tsx` — z-order sort, muted filtering, `trimInFrame`→`startFrom`/`trimOutFrame`→`endAt`
- extracted: `VideoComposition.utils.ts` (`prepareClipsForComposition`)
- added: Storybook `.storybook/` config + `VideoComposition.stories.tsx` (5 stories)
- tested: `VideoComposition.test.tsx` (15), `VideoComposition.utils.test.ts` (7)

## Stores (Epic 2)
- added: `project-store.ts` — `useSyncExternalStore` singleton; `getSnapshot`, `subscribe`, `setProject`; dev fixture
- added: `ephemeral-store.ts` — `playheadFrame`, `selectedClipIds`, `zoom`; no-op skip on unchanged
- tested: `project-store.test.ts` (9), `ephemeral-store.test.ts` (14)

## PreviewPanel + PlaybackControls (Epic 2)
- added: `useRemotionPlayer.ts` — subscribes stores; `useQueries` for asset URLs (staleTime 5min)
- added: `PreviewPanel.tsx` — memoized inputProps, Remotion `<Player>`
- added: `usePlaybackControls.ts` — rAF loop, play/pause/rewind/step/seek, keyboard listeners
- added: `PlaybackControls.tsx` — toolbar, SVG icons, scrub slider, timecode
- added: `formatTimecode.ts` — `HH:MM:SS:FF` formatter
- fixed: rAF tick missing `setCurrentFrameState` — frame counter frozen during playback
- tested: `useRemotionPlayer.test.ts` (11), `PlaybackControls.test.tsx` (18), `usePlaybackControls.test.ts` (44)

## Dev Auth Bypass + App Shell (Epic 2)
- updated: `auth.middleware.ts`, `acl.middleware.ts` — `NODE_ENV=development` early-return with `DEV_USER`
- added: `App.tsx` — two-column shell: `AssetBrowserPanel` + `PreviewSection` + conditional `RightSidebar`
- updated: `architecture-rules.md` §3 (App.tsx location), §9 (multi-part test suffix + fixtures rule)
- tested: `App.test.tsx` (10)
- fixed: `docker-compose.yml` tsx watch order; `NODE_ENV: development` missing; `serializeAsset()` mapping

## Playwright E2E (Epic 2)
- added: `@playwright/test` (^1.59.1); `e2e` task in `turbo.json`; `playwright.config.ts`
- added: `e2e/app-shell.spec.ts` (3), `e2e/preview.spec.ts` (6), `e2e/asset-manager.spec.ts` (10)

## Captions / Transcription (Epic 3)
- added: `TranscriptionJobPayload` to `job-payloads.ts`; `enqueue-transcription.ts`
- added: `caption.repository.ts`, `caption.service.ts`, `captions.controller.ts`, `captions.routes.ts`
- added: `POST /assets/:id/transcribe` (202), `GET /assets/:id/captions` (200/404)
- added: `openai ^4.0.0`; `transcribe.job.ts` — S3 download → Whisper → `INSERT IGNORE` → DB ready
- updated: `media-worker/src/index.ts` — `transcriptionWorker` (concurrency 1), parallel shutdown
- added: `features/captions/types.ts`, `api.ts`, `useTranscriptionStatus.ts`
- added: `TranscribeButton.tsx` — 7-state machine; detects existing captions on mount
- added: `useAddCaptionsToTimeline.ts` — frame math, idempotency guard
- added: `CaptionEditorPanel.tsx` — text, frames, font size, color, position
- added: `useCaptionEditor.ts` — per-field handlers, `patchClip` via `getSnapshot()`/`setProject()`
- tested: `caption.service.test.ts` (8), `captions-endpoints.test.ts`, `transcribe.job.test.ts` (12), `useTranscriptionStatus.test.ts` (7), `TranscribeButton.test.tsx`, `CaptionEditorPanel.test.tsx` (20)

## Version History & Rollback — BE (Epic 4)
- added: `version.repository.ts` — `insertVersionTransaction`, `getLatestVersionId`, `getVersionById`, `listVersions`, `restoreVersionTransaction`, `getConnection`
- added: `version.service.ts` — schema version validation (422), optimistic lock (409), transaction lifecycle
- added: `versions.controller.ts` — `saveVersion`, `listVersions`, `restoreVersion` handlers
- added: `versions.routes.ts` — `POST /projects/:id/versions`, `GET /projects/:id/versions`, `POST /projects/:id/versions/:versionId/restore`
- updated: `index.ts` — mounts versionsRouter; `errors.ts` — added `UnprocessableEntityError` (422)
- tested: `version.service.test.ts` (21 unit), `versions-persist-endpoint.test.ts` (10 integration), `versions-list-restore-endpoint.test.ts` (14 integration)

## Version History & Rollback — FE (Epic 4)
- updated: `project-store.ts` — `enablePatches()`, `produceWithPatches`, `pushPatches` to history-store, `getCurrentVersionId`/`setCurrentVersionId`
- added: `history-store.ts` — `pushPatches`, `undo`, `redo`, `drainPatches`, `hasPendingPatches`, `_resetForTesting`
- added: `features/version-history/api.ts` — `saveVersion`, `listVersions`, `restoreVersion` fetch calls; 409 throws with `status: 409`
- added: `useAutosave.ts` — debounce 2s, drainPatches, POST to API, `beforeunload` flush, `saveStatus`, `lastSavedAt`, `hasEverEdited`
- added: `useVersionHistory.ts` — React Query list (staleTime 30s); `restoreToVersion` → setProject + setCurrentVersionId + invalidate
- added: `VersionHistoryPanel.tsx` — 320px aside, version list, current highlight, RestoreModal trigger
- added: `RestoreModal.tsx` — fixed overlay dialog, accessible (role/aria), disabled during restore
- added: `TopBar.tsx`, `SaveStatusBadge.tsx` — save state display (idle/saving/saved/conflict/not-yet-saved)
- updated: `App.tsx` — column layout, TopBar, history toggle button, `isHistoryOpen` state
- tested: `history-store.test.ts` (29), `useAutosave.test.ts` (18), `useVersionHistory.test.ts` (9), `VersionHistoryPanel.test.tsx` (22), `RestoreModal.test.tsx` (20); App.test.tsx updated (23 total)

## Known Issues / TODOs
- ACL middleware is a stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` is a stub — deferred until OpenAPI spec exists
- Presigned download URL (`GET /assets/:id/download-url`) deferred
- Timeline ruler bi-directional sync deferred to Timeline Editor epic
- S3 CORS policy must be configured on bucket for browser-direct PUT
- Assets stay in `processing` until media-worker is running
- Pre-existing TypeScript errors in `PlaybackControls.tsx`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `config.ts`
- Two pre-existing integration test failures in `assets-endpoints.test.ts`, `assets-finalize-endpoint.test.ts`
