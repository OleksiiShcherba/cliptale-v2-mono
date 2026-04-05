# Development Log (compacted — 2026-03-29 to 2026-04-05)

## Monorepo Scaffold (Epic 1)
- added: `package.json`, `turbo.json`, root `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` (MySQL 8 + Redis 7)
- added: `apps/api/` — Express + helmet + cors + rate-limit; BullMQ queue stubs
- added: `apps/web-editor/` — React 18 + Vite; `apps/media-worker/`, `apps/render-worker/` — BullMQ stubs
- added: `packages/project-schema/` — Zod schemas: `ProjectDoc`, `Track`, `Clip` union
- added: `packages/remotion-comps/` — `VideoComposition` + layer components
- tested: `clip.schema.test.ts` (14), `project-doc.schema.test.ts` (7)
- fixed: `APP_` env prefix; Zod startup validation; `VITE_PUBLIC_API_BASE_URL`; `workspace:*` → `file:` paths

## DB Migrations
- added: `001_project_assets_current.sql` — `project_assets_current` table
- added: `002_caption_tracks.sql` — `caption_tracks` table
- added: `003_project_versions.sql` — `projects`, `project_versions`, `project_version_patches`, `project_audit_log`
- added: `004_render_jobs.sql` — `render_jobs` (status ENUM, progress_pct, preset_json, output_uri); 4 indexes
- added: `005_project_clips_current.sql` — `project_clips_current` (clip_id, track_id, type, frame fields, transform_json, layer); 3 indexes
- added: `006_seed_dev.sql` — dev seed; updated to remove default text-overlay clip

## Redis + BullMQ Infrastructure (Epic 1)
- updated: `docker-compose.yml` Redis healthcheck; `bullmq.ts` error handlers
- updated: media-worker + render-worker — error handlers, graceful shutdown, concurrency
- fixed: `@/` alias + `tsc-alias` in api tsconfig

## Asset Upload Pipeline (Epic 1)
- added: `errors.ts` — `ValidationError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `OptimisticLockError`, `UnprocessableEntityError`
- added: `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: `asset.repository.ts`, `asset.service.ts`, `assets.controller.ts`, `assets.routes.ts`
- added: `POST /projects/:id/assets/upload-url`, `GET /assets/:id`, `GET /projects/:id/assets`, `POST /assets/:id/finalize`, `DELETE /assets/:id`
- added: `enqueue-ingest.ts` — idempotency, 3 retries, exponential backoff
- tested: `asset.service.test.ts` (13+deleteAsset), `assets-endpoints.test.ts`, `asset.finalize.service.test.ts` (7), `assets-delete-endpoint.test.ts` (7)

## Media Worker — Ingest Job (Epic 1)
- added: `MediaIngestJobPayload` in `job-payloads.ts`
- added: `media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform → S3 upload → DB ready
- added: `media-worker/Dockerfile` — node:20-alpine + ffmpeg
- tested: `ingest.job.test.ts` (11)

## Asset Browser Panel + Upload UI (Epic 1)
- added: `features/asset-manager/` — `types.ts`, `api.ts`, `useAssetUpload.ts`, `useAssetPolling.ts`, `AssetCard.tsx`, `AssetDetailPanel.tsx`, `UploadDropzone.tsx`, `UploadProgressList.tsx`, `AssetBrowserPanel.tsx`
- updated: `AssetDetailPanel.tsx` — "Add to Timeline" button (`#7C3AED`, enabled when ready); `TranscribeButton` for video/audio; helper fns extracted to `utils.ts`
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6), `AssetDetailPanel.test.tsx` (14)

## VideoComposition + Storybook (Epic 2)
- updated: `VideoComposition.tsx` — z-order sort, muted filtering, `trimInFrame`→`startFrom`/`trimOutFrame`→`endAt`
- extracted: `VideoComposition.utils.ts` (`prepareClipsForComposition`)
- added: Storybook config + `VideoComposition.stories.tsx` (5 stories)
- tested: `VideoComposition.test.tsx` (15), `VideoComposition.utils.test.ts` (7)

## Stores (Epic 2)
- added: `project-store.ts` — `useSyncExternalStore` singleton; `enablePatches()`, `produceWithPatches`, `getCurrentVersionId`/`setCurrentVersionId`; `setProject()` auto-derives `durationFrames` via `computeProjectDuration`
- added: `ephemeral-store.ts` — `playheadFrame`, `selectedClipIds`, `zoom`, `pxPerFrame` (1–100), `scrollOffsetX`
- added: `history-store.ts` — `pushPatches`, `undo`, `redo`, `drainPatches`, `hasPendingPatches`
- tested: `project-store.test.ts` (9+derivation tests), `ephemeral-store.test.ts` (14+9 clamp tests), `history-store.test.ts` (29)

## PreviewPanel + PlaybackControls (Epic 2)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `PlaybackControls.tsx`, `formatTimecode.ts`
- fixed: rAF tick missing `setCurrentFrameState` — frame counter frozen during playback
- tested: `useRemotionPlayer.test.ts` (11), `PlaybackControls.test.tsx` (18), `usePlaybackControls.test.ts` (44)

## Dev Auth Bypass + App Shell (Epic 2)
- updated: `auth.middleware.ts`, `acl.middleware.ts` — `NODE_ENV=development` early-return with `DEV_USER`
- added: `App.tsx` — two-column shell; `TopBar`, `AssetBrowserPanel`, `PreviewSection`, `TimelinePanel`, `RightSidebar`
- tested: `App.test.tsx`, `App.RightSidebar.test.tsx`
- fixed: `docker-compose.yml` tsx watch order; `NODE_ENV: development` missing

## Playwright E2E (Epic 2)
- added: `@playwright/test` (^1.59.1); `e2e/app-shell.spec.ts` (3), `e2e/preview.spec.ts` (6), `e2e/asset-manager.spec.ts` (10)

## Captions / Transcription (Epic 3)
- added: `TranscriptionJobPayload`; `enqueue-transcription.ts`; `caption.repository.ts`, `caption.service.ts`, `captions.controller.ts`, `captions.routes.ts`
- added: `POST /assets/:id/transcribe` (202), `GET /assets/:id/captions` (200/404)
- added: `openai ^4.0.0`; `transcribe.job.ts` — S3 → Whisper → DB
- added: FE `features/captions/` — `TranscribeButton.tsx` (with `pollingEnabled` gate), `useAddCaptionsToTimeline.ts`, `CaptionEditorPanel.tsx`, `useCaptionEditor.ts`
- fixed: `useTranscriptionStatus.ts` — `pollingEnabled` param; `TranscribeButton.tsx` — poll only after user triggers
- tested: `caption.service.test.ts` (8), `transcribe.job.test.ts` (12), `useTranscriptionStatus.test.ts` (7), `TranscribeButton.test.tsx`, `CaptionEditorPanel.test.tsx` (20)

## Version History & Rollback (Epic 4)
- added: `version.repository.ts`, `version.service.ts`, `versions.controller.ts`, `versions.routes.ts`
- added: `POST /projects/:id/versions`, `GET /projects/:id/versions`, `POST .../restore`
- added: `useAutosave.ts` — debounce 2s, drainPatches, POST to API, `beforeunload` flush
- added: `useVersionHistory.ts`, `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`
- tested: `version.service.test.ts` (21), `useAutosave.test.ts` (18), `useVersionHistory.test.ts` (9), `VersionHistoryPanel.test.tsx` (22), `RestoreModal.test.tsx` (20)
- fixed: `DEV_PROJECT_ID` → UUID; `doc_json` → `docJson`; added `docSchemaVersion` to save request

## Background Render Pipeline (Epic 5)
- added: `RenderPresetKey`, `RenderPreset`, `RenderVideoJobPayload` in `job-payloads.ts`
- added: `render.repository.ts`, `render.service.ts` (per-user 2-concurrent limit), `enqueue-render.ts`, `renders.controller.ts`, `renders.routes.ts`
- added: `POST /projects/:id/renders` (202), `GET /renders/:jobId`, `GET /projects/:id/renders`
- added: `render-worker/src/jobs/render.job.ts` — fetch doc_json → Remotion render → S3 → mark complete; 5% progress throttle
- added: FE `features/export/` — `useExportRender.ts`, `RenderProgressBar.tsx`, `ExportModal.tsx` (4 phases)
- updated: `TopBar.tsx` — `canExport` prop; disabled when `currentVersionId` is null
- tested: `render.service.test.ts` (12+7 presets), `render.job.test.ts` (10), `RenderProgressBar.test.tsx` (14), `ExportModal.test.tsx` (18+12 phases), `useExportRender.test.ts` (10)

## Timeline Editor — Clip PATCH Endpoint (Epic 6)
- added: `clip.repository.ts` — `getClipByIdAndProject`, `patchClip` (dynamic SET), `insertClip`
- added: `clip.service.ts` — `patchClip` (404/403), `createClip`
- added: `clips.controller.ts`, `clips.routes.ts` — `PATCH /projects/:id/clips/:clipId` (rate-limit 60 req/s keyed by project), `POST /projects/:id/clips`
- added: `packages/api-contracts/src/openapi.ts` — OpenAPI 3.1 PATCH spec
- tested: `clip.service.test.ts` (7+createClip), `clip-patch-endpoint.test.ts` (12)

## Timeline Editor — FE (Epic 6)
- added: `features/timeline/types.ts`, `features/timeline/api.ts` (`patchClip`, `createClip`)
- added: `TimelineRuler.tsx` — canvas; tick algorithm; click-to-seek; wheel-to-zoom (native listener, passive:false)
- added: `TrackHeader.tsx` — inline rename, mute/lock toggles
- added: `ClipBlock.tsx` — absolutely-positioned; selection border; thumbnail/waveform; ghost/drag/trim props; `WaveformSvg.tsx` extracted
- added: `ClipLane.tsx` — clip rendering; single/shift-click selection; context menu; split/delete/duplicate via `clipContextMenuActions.ts`; `projectId` prop for `createClip`
- added: `ClipContextMenu.tsx` — fixed-position; keyboard accessible (ArrowUp/Down, Enter, Escape)
- added: `TrackList.tsx` — `react-window FixedSizeList` (v1.8.10), overscanCount=5; threads all timeline props
- added: `TimelinePanel.tsx` — 232px panel; toolbar; ruler; track list; scrollbar; `useClipDeleteShortcut()`
- added: `ScrollbarStrip.tsx` (8px), `useScrollbarThumbDrag.ts` — pointer-capture thumb drag
- added hooks: `useSnapping.ts`, `useClipDrag.ts`, `useClipTrim.ts` (`TRIM_HANDLE_PX=8`), `useClipDeleteShortcut.ts`
- added: `clipTrimMath.ts`, `clipContextMenuActions.ts` — extracted logic
- fixed: float frame values → `Math.round()` before PATCH; split playhead-at-exact-start → `> startFrame`; passive wheel listener; duplicate calls `createClip`
- tested: all hooks + components; 648+ tests total

## packages/editor-core
- added: `computeProjectDuration(clips, fps, minSeconds?)` — `max(startFrame + durationFrames)` floored at `fps * minSeconds` (default 5s)
- integrated into `setProject()` in `project-store.ts` — all mutations auto-derive duration
- tested: `index.test.ts` (10)

## packages/project-schema — ImageClip
- added: `imageClipSchema` — `id`, `type:'image'`, `assetId`, `trackId`, `startFrame`, `durationFrames`, `opacity`; no trim/volume fields
- extended `clipSchema` discriminated union; exported `ImageClip` type
- added: `image: '#0EA5E9'` to `CLIP_COLORS` in `ClipBlock.tsx`
- extracted: `WaveformSvg.tsx` to keep `ClipBlock.tsx` under 300-line limit

## useAddAssetToTimeline
- added: `features/asset-manager/hooks/useAddAssetToTimeline.ts` — maps contentType → clip type; finds/creates track; computes startFrame from existing clips; calls `setProject()`; image assets → "Image 1" (video-type track)
- tested: `useAddAssetToTimeline.test.ts` (10)

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` — only PATCH clip in OpenAPI spec; full spec deferred
- Presigned download URL (`GET /assets/:id/download-url`) deferred
- S3 CORS policy must be configured on bucket for browser-direct PUT
- Assets stay in `processing` until media-worker is running
- `deleteAsset` service function lacks unit test (only integration coverage) — §10 violation noted by reviewer
- `deleteAssetById` JSDoc missing no-op behaviour description — noted by reviewer
- `useAddAssetToTimeline.ts` import ordering violations — noted and fixed in subtask 4
- PATCH failures in drag/trim are fire-and-forget (`Promise.allSettled`) — production hardening deferred

there is correct playwrite tests that do cover all 6 epic tasks, we need to cover all of the<:
checked by playwright-reviewer: YES
---

## [2026-04-05]

### Task: Fix Three Timeline Sync Bugs
**Subtask:** Fix all three timeline synchronization bugs (scroll, playhead during playback, ruler click seek)

**What was done:**
- **Bug 1 — Clip scroll sync:** Added `scrollOffsetX` prop to `ClipBlock`, `ClipLane`, and `TrackList`. `ClipBlock` now subtracts `scrollOffsetX` from the computed `left` position (both for normal clips and ghost blocks during drag/trim). `ClipLane` forwards `scrollOffsetX` to each `ClipBlock`. `TrackList` adds `scrollOffsetX` to `TrackRowData` and passes it down. `TimelinePanel` passes `scrollOffsetX` from the ephemeral store to `TrackList`.
- **Bug 1 — Scroll max clamping:** `TimelinePanel` wheel handler now clamps the new offset to `[0, Math.max(0, totalContentWidth - laneWidth)]` using refs (`laneWidthRef`, `totalContentWidthRef`) so the closure always reads current values.
- **Bug 2 — Playhead needle during playback:** Added `store/timeline-refs.ts` — module-level bridge (`registerTimelinePlayheadUpdater` / `unregisterTimelinePlayheadUpdater` / `updateTimelinePlayheadFrame`). `usePlaybackControls` rAF tick now calls `updateTimelinePlayheadFrame(frame)` (direct DOM mutation, architecture §7) instead of `setPlayheadFrame`. `TimelinePanel` registers a closure on mount that reads `pxPerFrameRef`, `scrollOffsetXRef`, `laneWidthRef` and sets `el.style.left` and `el.style.display` directly on the needle DOM node. `setPlayheadFrame` is only called on auto-stop / pause / seek (correct per §7).
- **Bug 2 — Playhead needle render:** Added a 1px `PLAYHEAD_COLOR` (#EF4444) absolutely-positioned div (always mounted, `needleRef`) to `TimelinePanel` inside the `trackListWrapper`. React controls `left`/`display` on re-renders; the rAF bridge mutates them between renders. `overflow: hidden` on `trackListWrapper` clips the needle when outside lane bounds.
- **Bug 3 — Ruler click seeks player:** Added `useEffect` in `PreviewSection` (`App.tsx`) that watches `playheadFrame` from `useEphemeralStore()` and calls `playerRef.current.seekTo(playheadFrame)` when the player is not playing.
- **Tests updated:** `ClipBlock.test.tsx` — added `scrollOffsetX: 0` to `defaultProps`, added tests for scroll-offset position shifting and ghostLeft with scroll offset. `ClipLane.test.tsx` — added `scrollOffsetX: 0` to `defaultProps`, added two tests verifying clip left position shifts with scroll offset. `TrackList.test.tsx` — added `scrollOffsetX: 0` to `defaultProps`.

**Files modified:**
- `apps/web-editor/src/features/timeline/components/ClipBlock.tsx`
- `apps/web-editor/src/features/timeline/components/ClipBlock.test.tsx`
- `apps/web-editor/src/features/timeline/components/ClipLane.tsx`
- `apps/web-editor/src/features/timeline/components/ClipLane.test.tsx`
- `apps/web-editor/src/features/timeline/components/TrackList.tsx`
- `apps/web-editor/src/features/timeline/components/TrackList.test.tsx`
- `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx`
- `apps/web-editor/src/features/preview/hooks/usePlaybackControls.ts`
- `apps/web-editor/src/App.tsx`

**Notes:**
- The `PlayerRef` type from `@remotion/player` does not expose `isPlaying()` in all versions; the `App.tsx` usage uses a local type intersection to avoid casting to `unknown`.
- Ghost drag blocks in `ClipLane` pass `ghostLeftPx * pxPerFrame` as `ghostLeft`; `ClipBlock` subtracts `scrollOffsetX` from that automatically.
- The needle in `TimelinePanel` is positioned relative to the `trackListWrapper` div (which spans header + lanes), so `TRACK_HEADER_WIDTH` is added to align it with the lane area only.
- All 657 tests pass after changes.

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-05. All checks passed. All four previously flagged issues are confirmed fixed: TRACK_HEADER_WIDTH=64 in TrackHeader.tsx and TrackList.tsx (matches Figma node 13:69), TOOLBAR_HEIGHT=36 in TimelinePanel.styles.ts (matches Figma node 13:67), playhead needle width=2 in TimelinePanel.tsx (matches Figma nodes 13:79/88/97/106), and default clip opacity=0.75 in ClipBlock.tsx (matches Figma opacity-75 on all clip nodes). Code matches design guide and Figma spec.
checked by playwright-reviewer: YES
