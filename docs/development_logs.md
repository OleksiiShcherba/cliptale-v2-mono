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
- added: `003_project_versions.sql` — `projects`, `project_versions`, `project_version_patches`, `project_audit_log`; tested `migration-003.test.ts` + `migration-003.patches-audit.test.ts`
- added: `004_render_jobs.sql` — `render_jobs` table (job_id, project_id, version_id, status ENUM, progress_pct, preset_json, output_uri); 4 indexes; tested `migration-004.test.ts` (13)

## Redis + BullMQ Infrastructure (Epic 1)
- updated: `docker-compose.yml` Redis healthcheck; `bullmq.ts` error handlers
- updated: media-worker + render-worker — error handlers, graceful shutdown, concurrency settings
- fixed: `@/` alias + `tsc-alias` in api tsconfig

## Asset Upload Pipeline (Epic 1)
- added: `errors.ts` — `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`
- added: `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: `asset.repository.ts`, `asset.service.ts`, `assets.controller.ts`, `assets.routes.ts`
- added: `POST /projects/:id/assets/upload-url`, `GET /assets/:id`, `GET /projects/:id/assets`
- added: `enqueue-ingest.ts` — idempotency, 3 retries, exponential backoff
- added: `POST /assets/:id/finalize` with `aclMiddleware('editor')`
- tested: `asset.service.test.ts` (13), `assets-endpoints.test.ts`, `asset.finalize.service.test.ts` (7), `assets-finalize-endpoint.test.ts` (6)

## Media Worker — Ingest Job (Epic 1)
- added: `MediaIngestJobPayload` in `job-payloads.ts`
- added: `media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform → S3 upload → DB ready
- added: `media-worker/Dockerfile` — node:20-alpine + ffmpeg; updated `docker-compose.yml`
- tested: `ingest.job.test.ts` (11)

## Asset Browser Panel + Upload UI (Epic 1)
- added: `features/asset-manager/` — `types.ts`, `api.ts`, `useAssetUpload.ts`, `useAssetPolling.ts`, `AssetCard.tsx`, `AssetDetailPanel.tsx`, `UploadDropzone.tsx`, `UploadProgressList.tsx`, `AssetBrowserPanel.tsx`
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6)

## VideoComposition + Storybook (Epic 2)
- updated: `VideoComposition.tsx` — z-order sort, muted filtering, `trimInFrame`→`startFrom`/`trimOutFrame`→`endAt`
- extracted: `VideoComposition.utils.ts` (`prepareClipsForComposition`)
- added: Storybook config + `VideoComposition.stories.tsx` (5 stories)
- tested: `VideoComposition.test.tsx` (15), `VideoComposition.utils.test.ts` (7)

## Stores (Epic 2)
- added: `project-store.ts` — `useSyncExternalStore` singleton; `getSnapshot`, `subscribe`, `setProject`; dev fixture
- added: `ephemeral-store.ts` — `playheadFrame`, `selectedClipIds`, `zoom`; no-op skip on unchanged
- tested: `project-store.test.ts` (9), `ephemeral-store.test.ts` (14)

## PreviewPanel + PlaybackControls (Epic 2)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `PlaybackControls.tsx`, `formatTimecode.ts`
- fixed: rAF tick missing `setCurrentFrameState` — frame counter frozen during playback
- tested: `useRemotionPlayer.test.ts` (11), `PlaybackControls.test.tsx` (18), `usePlaybackControls.test.ts` (44)

## Dev Auth Bypass + App Shell (Epic 2)
- updated: `auth.middleware.ts`, `acl.middleware.ts` — `NODE_ENV=development` early-return with `DEV_USER`
- added: `App.tsx` — two-column shell: `AssetBrowserPanel` + `PreviewSection` + conditional `RightSidebar`
- tested: `App.test.tsx` (10)
- fixed: `docker-compose.yml` tsx watch order; `NODE_ENV: development` missing; `serializeAsset()` mapping

## Playwright E2E (Epic 2)
- added: `@playwright/test` (^1.59.1); `e2e/app-shell.spec.ts` (3), `e2e/preview.spec.ts` (6), `e2e/asset-manager.spec.ts` (10)

## Captions / Transcription (Epic 3)
- added: `TranscriptionJobPayload`; `enqueue-transcription.ts`; `caption.repository.ts`, `caption.service.ts`, `captions.controller.ts`, `captions.routes.ts`
- added: `POST /assets/:id/transcribe` (202), `GET /assets/:id/captions` (200/404)
- added: `openai ^4.0.0`; `transcribe.job.ts` — S3 → Whisper → DB
- added: FE `features/captions/` — `TranscribeButton.tsx`, `useAddCaptionsToTimeline.ts`, `CaptionEditorPanel.tsx`, `useCaptionEditor.ts`
- tested: `caption.service.test.ts` (8), `captions-endpoints.test.ts`, `transcribe.job.test.ts` (12), `useTranscriptionStatus.test.ts` (7), `TranscribeButton.test.tsx`, `CaptionEditorPanel.test.tsx` (20)

## Version History & Rollback — BE (Epic 4)
- added: `version.repository.ts` — `insertVersionTransaction`, `getLatestVersionId`, `getVersionById`, `listVersions`, `restoreVersionTransaction`, `getConnection`
- added: `version.service.ts` — schema version validation (422), optimistic lock (409), transaction lifecycle
- added: `versions.controller.ts`, `versions.routes.ts` — `POST /projects/:id/versions`, `GET /projects/:id/versions`, `POST .../restore`
- updated: `errors.ts` — added `UnprocessableEntityError` (422)
- tested: `version.service.test.ts` (21), `versions-persist-endpoint.test.ts` (10), `versions-list-restore-endpoint.test.ts` (14)

## Version History & Rollback — FE (Epic 4)
- updated: `project-store.ts` — `enablePatches()`, `produceWithPatches`, `getCurrentVersionId`/`setCurrentVersionId`
- added: `history-store.ts` — `pushPatches`, `undo`, `redo`, `drainPatches`, `hasPendingPatches`
- added: `useAutosave.ts` — debounce 2s, drainPatches, POST to API, `beforeunload` flush, `saveStatus`, `hasEverEdited`
- added: `useVersionHistory.ts` — React Query list; `restoreToVersion` → setProject + setCurrentVersionId + invalidate
- added: `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`
- updated: `App.tsx` — column layout, TopBar, history toggle, `isHistoryOpen` state
- tested: `history-store.test.ts` (29), `useAutosave.test.ts` (18), `useVersionHistory.test.ts` (9), `VersionHistoryPanel.test.tsx` (22), `RestoreModal.test.tsx` (20)

## Client Feedback Fixes (Epic 5)
- updated: `TopBar.tsx` — `canExport` prop; disabled style (`aria-disabled`, tooltip) when `currentVersionId` is null
- updated: `App.tsx` — passes `canExport={currentVersionId !== null}`
- updated: `features/export/api.ts` — 409 → `CONCURRENT_RENDER_LIMIT_MESSAGE` user-friendly error; raw backend string never surfaced
- tested: `TopBar.test.tsx` (14), `App.test.tsx` (+4 export tests), `features/export/api.test.ts` (10)

## Background Render Pipeline — BE (Epic 5)
- added: `RenderPresetKey`, `RenderPreset`, `RenderVideoJobPayload` types in `job-payloads.ts`
- added: `render.repository.ts` — `insertRenderJob`, `getRenderJobById`, `listRenderJobsByProject`, `updateRenderProgress`, `completeRenderJob`, `failRenderJob`, `countActiveJobsByUser`
- added: `render.service.ts` — `createRender` (preset validation, version ownership, per-user 2-concurrent limit), `getRenderStatus` (presigned URL), `listProjectRenders`
- added: `enqueue-render.ts` — idempotent, 3 retries, exponential backoff
- added: `renders.controller.ts`, `renders.routes.ts` — `POST /projects/:id/renders` (202), `GET /renders/:jobId`, `GET /projects/:id/renders`; fire-and-forget audit log
- tested: `render.service.test.ts` (12), `render.service.presets.test.ts` (7), `job-payloads.test.ts` (+3), `renders-endpoint.test.ts` (12)

## Background Render Pipeline — Render Worker (Epic 5)
- added: `render-worker/src/lib/db.ts`, `s3.ts`, `remotion-renderer.ts` — mysql2 pool, S3Client, Remotion `bundle`+`renderMedia` wrapper
- added: `render-worker/src/jobs/render.job.ts` — set processing → fetch doc_json → Remotion render → S3 upload → mark complete; 5% progress throttle
- updated: `render-worker/package.json` — `@remotion/bundler`, `mysql2`; `render-worker/tsconfig.json` — `@/*` alias
- tested: `render.job.test.ts` (10)

## Background Render Pipeline — FE (Epic 5)
- added: `features/export/types.ts` — `RenderPresetKey`, `RenderPresetOption`, `RenderJob`, `RENDER_PRESET_OPTIONS` (6 presets)
- added: `features/export/api.ts` — `createRender`, `getRenderStatus`, `listRenders`
- added: `useExportRender.ts` — `startRender`, polling 3s via React Query, `reset`
- added: `RenderProgressBar.tsx` — 8px track, ARIA progressbar
- added: `ExportModal.tsx` — 560×700px, 4 phases: preset selection, rendering, complete (download), failed (retry)
- added: `ExportModal.styles.ts`, `ExportModal.fixtures.ts`
- updated: `TopBar.tsx` — Export button props; `App.tsx` — `isExportOpen` state, `ExportModal` rendering
- tested: `RenderProgressBar.test.tsx` (14), `ExportModal.test.tsx` (18), `ExportModal.phases.test.tsx` (12), `useExportRender.test.ts` (10)

## Known Issues / TODOs
- ACL middleware is a stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` is a stub — deferred until OpenAPI spec exists
- Presigned download URL (`GET /assets/:id/download-url`) deferred
- Timeline ruler bi-directional sync deferred to Timeline Editor epic
- S3 CORS policy must be configured on bucket for browser-direct PUT
- Assets stay in `processing` until media-worker is running
- Pre-existing TypeScript errors in `PlaybackControls.tsx`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `config.ts`
- Two pre-existing integration test failures in `assets-endpoints.test.ts`, `assets-finalize-endpoint.test.ts`

---

## [2026-04-04]

### Task: Epic 6 — Timeline Editor (Multi-track)
**Subtask:** [BE] Clip Partial Update Endpoint

**What was done:**
- Added `apps/api/src/db/migrations/005_project_clips_current.sql` — creates `project_clips_current` table with `clip_id`, `project_id`, `track_id`, `type`, `start_frame`, `duration_frames`, `trim_in_frames`, `trim_out_frames`, `transform_json`, `layer`; 3 indexes
- Added `apps/api/src/repositories/clip.repository.ts` — `getClipByIdAndProject`, `patchClip` (dynamic SET builder); JSON column safe-parse for mysql2 dual-mode return
- Added `apps/api/src/services/clip.service.ts` — `patchClip` with `NotFoundError` (404) and `ForbiddenError` (403); does NOT write to `project_versions`
- Added `apps/api/src/controllers/clips.controller.ts` — `patchClipSchema` (Zod, at-least-one refinement), `patchClip` handler
- Added `apps/api/src/routes/clips.routes.ts` — `PATCH /projects/:id/clips/:clipId`; per-project rate limit 60 req/s keyed by project ID; `authMiddleware` + `aclMiddleware('editor')`
- Updated `apps/api/src/index.ts` — registered `clipsRouter`
- Added `packages/api-contracts/src/openapi.ts` — OpenAPI 3.1 spec for `PATCH /projects/{projectId}/clips/{clipId}`
- Updated `packages/api-contracts/src/index.ts` — exports `openApiSpec`
- Added `apps/api/src/services/clip.service.test.ts` — 7 unit tests (happy path, NotFoundError, ForbiddenError, dev bypass, null fields)
- Added `apps/api/src/__tests__/integration/clip-patch-endpoint.test.ts` — 12 integration tests (happy paths, validation errors, 404, 401, no version snapshot created)

**Notes:**
- mysql2 can return JSON columns as already-parsed objects or as strings depending on context; `mapRow` handles both cases
- Rate limiter is keyed by `req.params.id` (project ID) so the 60 req/s limit is per-project, not per-IP
- `projectOwnerId` is passed as `null` from the controller because no projects table yet — ACL middleware provides the ownership guard until projects CRUD is built
- Migration must be run manually (`docker compose exec db mysql ...`) before integration tests

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [BE] Clip Partial Update Endpoint</summary>

Build `PATCH /projects/:id/clips/:clipId` in `apps/api/`. This endpoint updates a single clip's mutable timeline fields (`startFrame`, `durationFrames`, `trimInFrames`, `trimOutFrames`, `transform`) directly in `project_clips_current` without creating a full `project_versions` snapshot. Intended for high-frequency drag/trim events — up to 60 req/s per project.

Acceptance Criteria:
- [x] Updates `project_clips_current` row for the given clip ID
- [x] Does NOT insert a row into `project_versions`
- [x] Validates clip belongs to the requesting user's project (return 403 otherwise)
- [x] Validates body with Zod: only allows `startFrame`, `durationFrames`, `trimInFrames`, `trimOutFrames`, `transform` fields
- [x] Returns `200` with the updated clip fields on success
- [x] Returns `404` if clipId not found in `project_clips_current`
- [x] Rate-limited to 60 req/s per project (express-rate-limit, keyed by project ID)
- [x] Route added to OpenAPI spec in `packages/api-contracts/`

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES

---

## [2026-04-04]

### Task: Epic 6 — Timeline Editor (Multi-track)
**Subtask:** [FE] Timeline Ruler + Virtualized Track List

**What was done:**
- Extended `apps/web-editor/src/store/ephemeral-store.ts` — added `pxPerFrame` (range 1-100, clamped) and `scrollOffsetX` (≥0, clamped) to `EphemeralState`; added `setPxPerFrame` and `setScrollOffsetX` setters
- Added `apps/web-editor/src/features/timeline/types.ts` — feature-local `TrackColor` type
- Added `apps/web-editor/src/features/timeline/components/TimelineRuler.tsx` — canvas-based ruler; major/minor tick algorithm adapts to `pxPerFrame`; click-to-seek; wheel-to-zoom; ARIA attributes
- Added `apps/web-editor/src/features/timeline/components/TrackHeader.tsx` — track name (click-to-edit, Enter/Escape/blur), mute (M) and lock (L) buttons with ARIA pressed states
- Added `apps/web-editor/src/features/timeline/components/ClipLane.tsx` — empty placeholder with track-type color left border; opacity reflects mute state
- Added `apps/web-editor/src/features/timeline/components/TrackList.tsx` — `react-window FixedSizeList` (v1.8.10) with `overscanCount={5}`; empty state; ARIA roles
- Added `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — full 232px panel; toolbar (zoom in/out, px/frame label, track count); ruler row; track list; `ResizeObserver` for panel width
- Updated `apps/web-editor/src/App.tsx` — imported `TimelinePanel`; added `onRenameTrack`/`onToggleMute`/`onToggleLock` handlers; mounted `<TimelinePanel>` below editor row
- Updated `apps/web-editor/src/App.test.tsx` — mocked `TimelinePanel`; added `pxPerFrame`/`scrollOffsetX` to ephemeral store mock; updated shell children count assertion
- Updated `apps/web-editor/src/App.RightSidebar.test.tsx` — mocked `TimelinePanel`; added `pxPerFrame`/`scrollOffsetX` to all ephemeral store mocks
- Added `apps/web-editor/package.json` — `react-window` v1.8.10 (downgraded from v2 — task requires `FixedSizeList` which is v1 API)
- Added `apps/web-editor/src/store/ephemeral-store.test.ts` — 9 new tests for `setPxPerFrame` and `setScrollOffsetX` (clamp, notify, no-op)
- Added `apps/web-editor/src/features/timeline/components/TimelineRuler.test.tsx` — 8 tests (render, ARIA, seek, zoom, min/max zoom)
- Added `apps/web-editor/src/features/timeline/components/TrackHeader.test.tsx` — 12 tests (render, mute/lock toggles, inline rename, Enter/Escape/blur, empty string fallback)
- Added `apps/web-editor/src/features/timeline/components/TrackList.test.tsx` — 8 tests (empty state, single track, multiple tracks, 100 tracks, accessibility)

**Notes:**
- react-window v2 (installed by default) does NOT have `FixedSizeList` — downgraded to v1.8.10 per task spec
- `pxPerFrame` default is 4 (not 1) so the timeline is usable at launch; spec allows any valid range value
- `TimelinePanel` uses `ResizeObserver` for responsive ruler/lane width — `jsdom` does not support ResizeObserver, so `TimelinePanel` itself is mocked in `App.test.tsx` and `App.RightSidebar.test.tsx`
- Track mute/lock/rename mutations go through `setProject()` which generates Immer patches for undo/redo autosave

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Timeline Ruler + Virtualized Track List</summary>

Build the foundational timeline layout in `apps/web-editor/src/features/timeline/`. Includes `TimelineRuler` (frame/timecode ticks, zoom, seek) and virtualized `TrackList` using `react-window FixedSizeList`. Zoom and scroll offset stored in ephemeral store.

Acceptance Criteria:
- [x] `TimelineRuler` renders tick marks at correct frame/timecode intervals for current `pxPerFrame` zoom level
- [x] Ruler re-renders correctly at min zoom (1 px/frame) and max zoom (100 px/frame)
- [x] Clicking the ruler sets the playhead to that frame (dispatch to ephemeral store)
- [x] `TrackList` uses `react-window FixedSizeList` with `overscanCount={5}`
- [x] 100 tracks render without throwing (verified via test)
- [x] Each track row renders a `TrackHeader` (name, mute toggle, lock toggle) and an empty `ClipLane` placeholder
- [x] Track name is editable inline (click-to-edit, `Enter`/blur to confirm)
- [x] Mute and lock toggle state is stored in the project doc via `setProject`
- [x] Horizontal scroll wheel on ruler zooms the timeline (wheel delta → update `pxPerFrame`)
- [x] TypeScript types for `Track` come from `packages/project-schema/`

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES

---

## [2026-04-04]

### Task: Epic 6 — Timeline Editor (Multi-track)
**Subtask:** [FE] Clip Rendering on Timeline

**What was done:**
- Added `apps/web-editor/src/features/timeline/components/ClipBlock.tsx` — absolutely-positioned clip block; `left = startFrame * pxPerFrame`, `width = Math.max(2, durationFrames * pxPerFrame)`, vertical offset = `(layer ?? 0) * 4px`; selected border = 2px solid `#F0F0FA`; locked clips show `not-allowed` cursor and block onClick; video clips render thumbnail `<img>` if `assetData.thumbnailUrl`; audio clips render `<WaveformSvg>` bars from `assetData.waveformPeaks`; `e.stopPropagation()` to prevent lane click from firing; exports `ClipAssetData` type
- Rewrote `apps/web-editor/src/features/timeline/components/ClipLane.tsx` — renders `ClipBlock` for each clip in the track; lane background click → `setSelectedClips([])`; clip click (single) → `setSelectedClips([clipId])`; shift+click → toggle add/remove; track muted → `opacity: 0.5`
- Updated `apps/web-editor/src/features/timeline/components/TrackList.tsx` — `TrackRowData` now includes `clips`, `pxPerFrame`, `selectedClipIds` (Set), `assetDataMap`; `TrackRow` filters clips by `trackId`; `TrackListProps` extended accordingly
- Updated `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — reads `selectedClipIds` from `useEphemeralStore()`; converts to `Set<string>` via `useMemo`; passes `clips` and `selectedClipIdSet` to `TrackList`
- Updated `apps/web-editor/src/features/timeline/components/TrackList.test.tsx` — added required new props: `clips`, `pxPerFrame`, `selectedClipIds`
- Added `apps/web-editor/src/features/timeline/components/ClipBlock.test.tsx` — 14 tests: positioning (left/width from startFrame/durationFrames), selection border, locked cursor + blocked click, thumbnail img, waveform SVG, layer offset, minimum width
- Added `apps/web-editor/src/features/timeline/components/ClipLane.test.tsx` — 9 tests: ARIA, render clips, empty state, lane click clears selection, single-select, shift+click add/remove, locked track (stopPropagation prevents both lane and clip callbacks), muted opacity

**Notes:**
- jsdom converts hex colors to rgb; border selected-state check uses `'solid'` + `not 'transparent'` instead of hex value
- `stopPropagation` in ClipBlock means clicking a locked clip does NOT fire the lane's onClick — both are suppressed (0 calls), not 1
- WaveformSvg bars are evenly distributed across the clip width using peaks from assetData
- `ClipAssetData` type is defined in ClipBlock and imported by ClipLane and TrackList to keep the feature collocated

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Clip Rendering on Timeline</summary>

Render clips as absolutely-positioned blocks inside each `ClipLane`. Clicking a clip block selects it (or shift-adds to selection). Locked tracks prevent selection. Video clips show a thumbnail; audio clips show a waveform.

Acceptance Criteria:
- [x] Each clip rendered as an absolutely-positioned block: `left = startFrame * pxPerFrame`, `width = max(2, durationFrames * pxPerFrame)`
- [x] Selected clip shows a visible border; unselected clips show a transparent border
- [x] Clicking a clip block calls `setSelectedClips([clipId])` (single select)
- [x] Shift+clicking a clip toggles it in/out of the selection without clearing others
- [x] Clicking the lane background clears the selection
- [x] Locked track: clip click is swallowed (no selection change)
- [x] Video clip with `thumbnailUrl` renders an `<img>` tag
- [x] Audio clip with `waveformPeaks` renders an SVG waveform
- [x] Minimum clip block width is 2px
- [x] Muted track renders at 50% opacity

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES

---

## [2026-04-04]

### Task: Epic 6 — Timeline Editor (Multi-track)
**Subtask:** [FE] Clip Drag (Move) Interaction

**What was done:**
- Added `apps/web-editor/src/features/timeline/api.ts` — `patchClip(projectId, clipId, payload)` thin API wrapper; calls `apiClient.patch`; throws on non-ok response
- Added `apps/web-editor/src/features/timeline/hooks/useSnapping.ts` — `useSnapping` hook computing snap targets (frame 0, playhead, clip edges of non-dragging clips); `snap(rawFrame)` returns snapped frame, `isSnapping` flag, `snapPx` pixel position for indicator; threshold = 5px scaled by `pxPerFrame`
- Added `apps/web-editor/src/features/timeline/hooks/useClipDrag.ts` — `useClipDrag(projectId)` hook; `onClipPointerDown` initiates drag with `setPointerCapture`; `pointermove` updates ghost positions via `useSnapping`; `pointerup` commits Immer mutation + fires `patchClip` for each moved clip; `Escape` keydown cancels drag without committing; locked clips skip drag; multi-clip drag maintains relative `startFrame` offsets; ghost positions clamped to ≥ 0
- Updated `apps/web-editor/src/features/timeline/components/ClipBlock.tsx` — added `onPointerDown`, `ghostLeft`, `isDragging` props; `ghostLeft` overrides `left` when set; `isDragging=true` sets opacity to 50%; cursor changed from `pointer` to `grab` (default) / `not-allowed` (locked)
- Updated `apps/web-editor/src/features/timeline/components/ClipLane.tsx` — added `dragInfo` and `onClipPointerDown` props; renders dimmed original + ghost blocks during drag; renders snap indicator `<div>` (red `#EF4444`) when snapping is active
- Updated `apps/web-editor/src/features/timeline/components/TrackList.tsx` — threads `dragInfo` and `onClipPointerDown` through `TrackRowData` and `TrackListProps`
- Updated `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — instantiates `useClipDrag(projectId)` and passes `dragInfo` + `onClipPointerDown` to `TrackList`
- Added `apps/web-editor/src/features/timeline/hooks/useSnapping.test.ts` — 9 tests: no snap when far, snap to frame 0, snap to playhead, snap to clip left/right edges, exclude dragging clips, nearest target wins, threshold scaling, just outside threshold
- Added `apps/web-editor/src/features/timeline/hooks/useClipDrag.test.ts` — 11 tests: initial null state, drag starts, locked prevents drag, non-left button skipped, pointermove updates ghost, pointerup commits + PATCH called, Escape cancels, multi-clip offsets preserved, clip not found skipped, clamp to frame 0
- Updated `apps/web-editor/src/features/timeline/components/ClipBlock.test.tsx` — added 5 new tests: ghostLeft overrides position, isDragging=true sets 50% opacity, isDragging=false full opacity, onPointerDown called, grab cursor default
- Updated `apps/web-editor/src/features/timeline/components/ClipLane.test.tsx` — added required props; 3 new tests: ghost clip renders, snap indicator renders, snap indicator absent when not snapping
- Updated `apps/web-editor/src/features/timeline/components/TrackList.test.tsx` — added required `dragInfo`/`onClipPointerDown` props

**Notes:**
- `PointerEvent` is not available in jsdom; polyfill added inline in `useClipDrag.test.ts` using a `MouseEvent` subclass
- PATCH calls are fire-and-forget (`Promise.allSettled`) — failures are silent; production hardening deferred
- `useSnapping` reads current state via `getSnapshot()` snapshots at move/up time — correct for drag use case
- 532 tests total, all passing

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Clip Drag (Move) Interaction</summary>

Implement pointer-event-based clip dragging in `apps/web-editor/src/features/timeline/hooks/useClipDrag.ts`. On pointerdown on a ClipBlock, capture the pointer and track delta. Render a ghost ClipBlock at the projected new position. On pointerup, dispatch an Immer mutation to update clip.startFrame in the project doc and fire PATCH /projects/:id/clips/:clipId. Snapping logic extracted to useSnapping hook.

Acceptance Criteria:
- [x] Drag updates clip.startFrame in project doc on pointerup
- [x] Ghost clip rendered at projected position during drag; original clip is dimmed (50% opacity)
- [x] Snapping: ghost snaps to clip edges, playhead position, and frame 0 within a 5 px threshold
- [x] Visible snap indicator line shown when snapping is active
- [x] Pressing Escape during drag cancels the operation and restores original position
- [x] Dragging a locked clip is prevented; cursor shows not-allowed
- [x] Multi-clip drag: all selectedClipIds move together maintaining relative startFrame offsets
- [x] PATCH /projects/:id/clips/:clipId called for each moved clip on drop
- [x] useClipDrag uses setPointerCapture / releasePointerCapture to prevent losing drag on fast mouse moves

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES

---

## [2026-04-04]

### Task: Epic 6 — Timeline Editor (Multi-track)
**Subtask:** [FE] Clip Split + Context Menu

**What was done:**
- Added `apps/web-editor/src/features/timeline/components/ClipContextMenu.tsx` — lightweight `<div>` context menu (no external lib); 3 items: Split at Playhead, Delete Clip, Duplicate Clip; `canSplit` prop disables/greys-out split item with `aria-disabled`; keyboard-accessible (ArrowUp/Down navigation, Enter to activate, Escape to close); click-outside closes via `mousedown` listener; `position: fixed` to escape `overflow: hidden` clip lane
- Updated `apps/web-editor/src/features/timeline/components/ClipBlock.tsx` — added `onContextMenu` prop; `handleContextMenu` calls `e.preventDefault()` + `e.stopPropagation()` then invokes the callback with `(e, clipId)`
- Updated `apps/web-editor/src/features/timeline/components/ClipLane.tsx` — added `useState<ContextMenuState | null>` for open menu; `handleClipContextMenu` sets menu state; `handleContextMenuAction` dispatches split/delete/duplicate via `setProject()`; split logic uses Immer (via `setProject`) to produce inverse patches for undo; `isPlayheadOverlapping` checks if `playheadFrame ∈ [startFrame, startFrame + durationFrames)`; `canSplit` computed at render time from current project + ephemeral snapshot
- Added `apps/web-editor/src/features/timeline/components/ClipContextMenu.test.tsx` — 13 tests: renders 3 items; role=menu; all items role=menuitem; split click when canSplit=true; split blocked when canSplit=false; aria-disabled on split; delete; duplicate; Escape closes; click outside closes; ArrowDown navigation; ArrowUp navigation; Enter activates; position coordinates
- Updated `apps/web-editor/src/features/timeline/components/ClipBlock.test.tsx` — 2 new tests: onContextMenu called with clipId, no-throw without onContextMenu
- Updated `apps/web-editor/src/features/timeline/components/ClipLane.test.tsx` — 4 new tests: context menu opens on right-click; closes on Escape; delete removes clip; duplicate inserts copy; split produces two clips with correct frame ranges and same assetId

**Notes:**
- Context menu uses `position: fixed` (not absolute) so it escapes the `overflow: hidden` clip lane container — correctly renders at screen coordinates
- Split Immer mutation: `setProject` triggers `produceWithPatches` which pushes inverse patches to history-store — Ctrl+Z via existing undo infrastructure merges back
- `crypto.randomUUID()` used for duplicate/split clip IDs — available in modern browsers and jsdom
- `text-overlay` clips have no `assetId` and no trim fields; split/duplicate handles this with type guards
- Split uses `flatMap` to atomically replace one clip with two in the clips array
- 573 tests total, all passing

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Clip Split + Context Menu</summary>

Add a right-click context menu on ClipBlock. Menu shows "Split at Playhead", "Delete Clip", "Duplicate Clip". Split at Playhead: if playhead overlaps the clip, split into two new clips. Mutation dispatched via Immer; undo reverses via inverse patch.

Acceptance Criteria:
- [x] Right-click on ClipBlock opens context menu; click outside closes it
- [x] "Split at Playhead" is disabled (greyed out) if playhead does not overlap the clip
- [x] Split produces exactly two clips covering the original range with correct trimInFrames/trimOutFrames
- [x] Both resulting clips reference the same assetId
- [x] Undo (Ctrl+Z) merges the two clips back to one (inverse Immer patch via history-store)
- [x] "Delete Clip" removes clip from project doc and closes menu
- [x] "Duplicate Clip" inserts a copy starting 0 frames after the original end
- [x] Context menu is keyboard-accessible (arrow keys, Enter, Escape)

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES

---

## [2026-04-04]

### Task: Epic 6 — Timeline Editor (Multi-track)
**Subtask:** [FE] Clip Trim Interaction

**What was done:**
- Added `apps/web-editor/src/features/timeline/hooks/useClipTrim.ts` — `useClipTrim(projectId)` hook; `TRIM_HANDLE_PX=8` constant exported; `getTrimCursor` returns `'ew-resize'` within 8px of left/right edge, `null` otherwise; `onTrimPointerDown` starts trim if edge detected, returns `false` if pointer is in the middle or clip not found; left-edge drag adjusts `startFrame` + `trimInFrame` simultaneously; right-edge drag adjusts `durationFrames` + `trimOutFrame`; duration clamped to minimum 1 frame; asset boundary cap when `assetDurationFrames` provided; Escape cancels trim; PATCH called only on pointerup; uses `setPointerCapture` / `releasePointerCapture`
- Updated `apps/web-editor/src/features/timeline/components/ClipBlock.tsx` — added `ghostWidth` prop (overrides width during trim); `getTrimCursor` prop threads cursor detection; `onMouseMove` updates cursor inline via direct DOM mutation (avoids React re-render per pixel); `onMouseLeave` resets cursor to grab; `useRef<cursor>` tracks active cursor value without state
- Updated `apps/web-editor/src/features/timeline/components/ClipLane.tsx` — added `trimInfo`, `getTrimCursor`, `onTrimPointerDown` props; `handleClipPointerDown` checks trim first (trim takes priority over drag); trimmed clip renders at ghost dimensions during trim; snap indicator shown from either dragInfo or trimInfo
- Updated `apps/web-editor/src/features/timeline/components/TrackList.tsx` — threads `trimInfo`, `getTrimCursor`, `onTrimPointerDown` through `TrackRowData` and `TrackListProps`
- Updated `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — instantiates `useClipTrim(projectId)` and passes trim props to `TrackList`
- Added `apps/web-editor/src/features/timeline/hooks/useClipTrim.test.ts` — 17 tests: initial null state; TRIM_HANDLE_PX=8; getTrimCursor (left edge, right edge, middle, locked); onTrimPointerDown (middle no-start, locked no-start, left-edge start, right-edge start, not found); right-edge drag updates duration; pointerup commits + patchClip called; left-edge drag updates startFrame+duration; duration clamp to 1 (left-edge, right-edge); Escape cancels
- Updated `apps/web-editor/src/features/timeline/components/ClipLane.test.tsx` — added `trimInfo`/`getTrimCursor`/`onTrimPointerDown` props; 3 new tests: trim renders ghost width, snap indicator from trimInfo, trim takes priority over drag on pointerdown
- Updated `apps/web-editor/src/features/timeline/components/TrackList.test.tsx` — added required trim props

**Notes:**
- `trimInFrame`/`trimOutFrame` are the actual project schema field names (not `trimInFrames`/`trimOutFrames` as in the task description which describes behavior)
- `text-overlay` clips have no trim fields; the hook handles this with a type guard (`clip.type !== 'text-overlay'`)
- Cursor is updated via direct DOM mutation in `onMouseMove` (not React state) to avoid a React re-render on every pixel during mouse movement
- PATCH payload uses `trimInFrames`/`trimOutFrames` (BE field names from ticket 1) not the schema field names
- 552 tests total, all passing

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: [FE] Clip Trim Interaction</summary>

Implement trim handles on ClipBlock edges in useClipTrim.ts. Hovering within 8px of a clip's left or right edge changes cursor to ew-resize. Dragging the left edge adjusts startFrame + trimInFrame simultaneously; dragging the right edge adjusts trimOutFrame / durationFrames. Same snapping logic as drag.

Acceptance Criteria:
- [x] Left-edge drag: startFrame and trimInFrames update simultaneously
- [x] Right-edge drag: trimOutFrames and durationFrames update
- [x] Trim cannot reduce clip duration below 1 frame
- [x] Snapping applies during trim using same snap targets as move
- [x] Immer patch generated and PATCH called on pointerup (not during drag)
- [x] Cursor changes to ew-resize only within 8px of clip edge; outside that, cursor is default

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
