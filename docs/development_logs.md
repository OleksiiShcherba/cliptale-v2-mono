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

---

## [2026-04-05]

### Task: Fix S3 URL exposure in Remotion preview player
**Subtask:** Replace raw s3:// URIs with API proxy streaming endpoint so the browser never receives S3 URLs

**What was done:**
- Added `GET /assets/:id/stream` route to `apps/api/src/routes/assets.routes.ts`
- Added `streamAsset` controller to `apps/api/src/controllers/assets.controller.ts` — fetches the S3 object using `GetObjectCommand`, forwards the browser's `Range` header for video seeking, pipes the binary body to the Express response with correct `Content-Type`, `Content-Length`, `Content-Range`, and `Accept-Ranges` headers; returns 206 for partial content, 204 when S3 returns no body
- Updated `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts` — removed use of `result.data.storageUri` (which was an `s3://` URI); now constructs `${config.apiBaseUrl}/assets/${assetId}/stream` for each asset URL
- Added `import { config } from '@/lib/config.js'` to `useRemotionPlayer.ts`
- Updated `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.test.ts` — added `vi.mock('@/lib/config.js', ...)`, renamed existing test to reflect new behavior, added three new tests verifying the API stream URL is used and `s3://` is never present
- Created `apps/api/src/__tests__/integration/assets-stream-endpoint.test.ts` — 8 integration tests covering: 401 auth, 404 missing asset, 200 full-file stream, 206 byte-range, Range header forwarding to S3, `s3://` not present in response, 204 empty body

**Notes:**
- The `<video>` element in the Remotion Player browser context doesn't send cookies; in `NODE_ENV=development` the `authMiddleware` auto-authenticates all requests (hardcoded `DEV_USER`), so the stream endpoint works in the Docker dev environment without credentials. Production will need signed URL tokens or cookie-based auth on the video element.
- `getAsset` is still called per assetId in `useRemotionPlayer` to confirm the asset exists in the DB before constructing the stream URL — this guards against showing media that hasn't been ingested yet.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix S3 URL exposure in Remotion preview player</summary>

Fix video render broken in Remotion preview player: replace direct s3:// URIs with API proxy URLs.
Errors observed:
- GET s3://... net::ERR_UNKNOWN_URL_SCHEME (browser can't handle s3:// scheme)
- GET /assets/:id/captions 404 (expected — no captions yet, handled as null)
Coverage: automated tests for stream endpoint and useRemotionPlayer hook.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-05. All checks passed. This change is backend/hook-only: a new Express streaming endpoint and a URL construction change in useRemotionPlayer.ts. No JSX, no CSS, no design tokens, and no layout were modified. No visual or design regressions introduced. Code matches design guide and Figma spec.
checked by playwright-reviewer: YES
---

## [2026-04-05]

### Task: Fix UI issues and project init flow
**Subtask:** Resolve issue with video/image preview icon in AssetCard

**What was done:**
- Added `TypeIcon` component to `AssetCard.tsx` — returns a 24×24 SVG icon based on `contentType`: play triangle for video, music note for audio, mountain+sun for image, document for all other types
- Icons use `#8A8AA0` (text-secondary token) and are rendered centered in the 48×48 thumbnail placeholder when `thumbnailUri` is null
- When `thumbnailUri` is set, the existing `<img>` path is unchanged
- Each icon SVG carries a `data-testid` attribute (`type-icon-video`, `type-icon-audio`, `type-icon-image`, `type-icon-file`) for test targeting
- Added 5 new tests to `AssetCard.test.tsx` covering: video/audio/image/file icon rendering when thumbnailUri is null, and absence of icon when thumbnailUri is set

**Files modified:**
- `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` — added `TypeIcon` component, updated thumbnail placeholder
- `apps/web-editor/src/features/asset-manager/components/AssetCard.test.tsx` — 5 new icon rendering tests (27 total, all pass)

**Notes:**
- All icons are inline SVG — no icon library dependency introduced
- The `TypeIcon` component is file-private (not exported) per architecture §6 rules (single-use, keep inline)
- Dark theme color `#8A8AA0` used per design guide Section 3

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Resolve issue with video/image preview icon</summary>

Resolve issue with video / image - preview icon in AssetCard thumbnail area.
When thumbnailUri is null, show a type-appropriate SVG icon (video/audio/image/file) as placeholder.

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-05. All checks passed. #8A8AA0 is the correct text-secondary token per design guide Section 3. Icon size 24×24px and container 48×48px are both on the 4px grid. Container background #16161F = surface-alt token, borderRadius 4px = radius-sm token. Icon centered via flexbox with no arbitrary offsets. Figma node 15:2 (Asset Browser/Desktop) shows THUMB blocks as schematic placeholders with no icon-state specification; the TypeIcon addition is a valid unspecified-state UX extension fully consistent with design tokens. No design violations found.
checked by playwright-reviewer: YES
---

## [2026-04-05]

### Task: Fix UI issues and project init flow
**Subtask:** Move from hardcoded DEV_PROJECT_ID to dynamic temporary project creation on editor page open

**What was done:**
- **API — `POST /projects` endpoint:**
  - Added `apps/api/src/repositories/project.repository.ts` — `createProject(projectId)` inserts a row into the `projects` table
  - Added `apps/api/src/services/project.service.ts` — `createProject()` generates a UUID, calls repository, returns `{ projectId }`
  - Added `apps/api/src/controllers/projects.controller.ts` — thin controller; parses nothing, calls service, returns 201
  - Added `apps/api/src/routes/projects.routes.ts` — `POST /projects` behind `authMiddleware`
  - Updated `apps/api/src/index.ts` — registers `projectsRouter`
- **Frontend — `useProjectInit` hook:**
  - Added `apps/web-editor/src/features/project/api.ts` — `createProject()` calls `POST /projects`
  - Added `apps/web-editor/src/features/project/hooks/useProjectInit.ts` — discriminated-union hook: if `?projectId=` is in the URL, returns `status: ready` immediately; otherwise calls the API, writes the new UUID back to the URL via `history.replaceState`, then returns `status: ready`
- **Removed `DEV_PROJECT_ID` from runtime code:**
  - `useAutosave(projectId)`, `useVersionHistory(projectId)`, `useExportRender(versionId, projectId)` all now accept `projectId` as a parameter (removed `@/lib/constants` import from each)
  - `TopBar` — added `projectId` prop, passes to `useAutosave`
  - `VersionHistoryPanel` — added `projectId` prop, passes to `useVersionHistory`
  - `ExportModal` — added `projectId` prop, passes to `useExportRender`
  - `App.tsx` — calls `useProjectInit()`, renders loading/error states while the project is resolving, then passes dynamic `projectId` to all downstream components; removed `DEV_PROJECT_ID` import and re-export
- **Tests written/updated:**
  - `apps/web-editor/src/features/project/hooks/useProjectInit.test.ts` — 9 tests: URL read path, API-call path, error path, URL-update assertion, no-duplicate-call guarantee
  - `apps/api/src/services/project.service.test.ts` — 4 tests: UUID v4 format, repository called with correct ID, distinct IDs per call, error propagation
  - Updated `useAutosave.test.ts` + 3 variants, `useVersionHistory.test.ts`, `useExportRender.test.ts` — passed projectId as parameter
  - Updated `TopBar.test.tsx`, `VersionHistoryPanel.test.tsx`, `ExportModal.test.tsx` — added `projectId` prop to render calls
  - Updated `App.test.tsx` and `App.RightSidebar.test.tsx` — mocked `useProjectInit`, updated assertion to check dynamic projectId

**Files created:**
- `apps/api/src/repositories/project.repository.ts`
- `apps/api/src/services/project.service.ts`
- `apps/api/src/services/project.service.test.ts`
- `apps/api/src/controllers/projects.controller.ts`
- `apps/api/src/routes/projects.routes.ts`
- `apps/web-editor/src/features/project/api.ts`
- `apps/web-editor/src/features/project/hooks/useProjectInit.ts`
- `apps/web-editor/src/features/project/hooks/useProjectInit.test.ts`

**Files modified:**
- `apps/api/src/index.ts`
- `apps/web-editor/src/features/version-history/hooks/useAutosave.ts`
- `apps/web-editor/src/features/version-history/hooks/useVersionHistory.ts`
- `apps/web-editor/src/features/export/hooks/useExportRender.ts`
- `apps/web-editor/src/TopBar.tsx`
- `apps/web-editor/src/features/version-history/components/VersionHistoryPanel.tsx`
- `apps/web-editor/src/features/export/components/ExportModal.tsx`
- `apps/web-editor/src/App.tsx`
- All associated test files

**Notes:**
- `DEV_PROJECT_ID` constant remains in `apps/web-editor/src/lib/constants.ts` but is no longer imported by any runtime code. Test files that previously mocked it still mock `@/lib/constants` but now the hooks no longer import it — those mocks became no-ops; left them in to avoid noise in the diff and because they do no harm
- `history.replaceState` is called after creation so refreshing the page returns to the same project rather than creating another
- The 2 pre-existing API integration test failures (`assets-endpoints.test.ts` and `assets-finalize-endpoint.test.ts`) are unrelated to this feature — they were failing before this change (documented in `apps/api/.claude/agent-memory/qa-engineer/pre-existing-failures.md`)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Move from default project id to dynamic project creation</summary>

Move from DEV_PROJECT_ID hardcoded constant to logic that creates a new temporary project each time the editor page opens if no projectId is present in the URL.

</details>

checked by code-reviewer - COMMENTED
> ❌ Dead code — 6 test files retain stale `vi.mock('@/lib/constants', ...)` whose mocked module is no longer imported by the hooks under test; violates §9 (no dead code/debug artifacts): `useExportRender.test.ts:20`, `useVersionHistory.test.ts:28`, `useAutosave.test.ts:26`, `useAutosave.save.test.ts:24`, `useAutosave.conflict.test.ts:24`, `useAutosave.timing.test.ts:24`
checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-05. All checks passed. Loading state uses TEXT_PRIMARY (#F0F0FA = text-primary token) on SURFACE (#0D0D14 = surface token) background — both correct. Error state uses #EF4444 = error token — correct. Font family Inter, sans-serif matches design guide Section 3. Font size 14px matches the body token (14px / 400 Regular). Named token constants are used throughout, consistent with the inline-styles pattern of this file. No layout, spacing, or component structure violations. Code matches design guide spec.
checked by playwright-reviewer: YES
