# Development Log (compacted — 2026-03-29 to 2026-04-07)

## Monorepo Scaffold (Epic 1)
- added: root `package.json`, `turbo.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `docker-compose.yml` (MySQL 8 + Redis 7)
- added: `apps/api/` — Express + helmet + cors + rate-limit; BullMQ queue stubs
- added: `apps/web-editor/` — React 18 + Vite; `apps/media-worker/`, `apps/render-worker/` — BullMQ stubs
- added: `packages/project-schema/` — Zod schemas: `ProjectDoc`, `Track`, `Clip` union
- added: `packages/remotion-comps/` — `VideoComposition` + layer components
- tested: `clip.schema.test.ts` (14), `project-doc.schema.test.ts` (7)
- fixed: `APP_` env prefix; Zod startup validation; `VITE_PUBLIC_API_BASE_URL`; `workspace:*` → `file:` paths

## DB Migrations
- added: `001_project_assets_current.sql`, `002_caption_tracks.sql`, `003_project_versions.sql`
- added: `004_render_jobs.sql` — `render_jobs` (status ENUM, progress_pct, preset_json, output_uri)
- added: `005_project_clips_current.sql` — `project_clips_current` (clip_id, track_id, type, frame fields, transform_json, layer)
- added: `006_seed_dev.sql` — dev seed
- added: `007_add_image_clip_type.sql` — adds `'image'` to type ENUM

## Redis + BullMQ Infrastructure
- updated: `docker-compose.yml` Redis healthcheck; `bullmq.ts` error handlers
- updated: media-worker + render-worker — error handlers, graceful shutdown, concurrency
- fixed: `@/` alias + `tsc-alias` in api tsconfig

## Asset Upload Pipeline (Epic 1)
- added: `errors.ts`, `s3.ts`, `validate.middleware.ts`, `auth.middleware.ts`, `acl.middleware.ts`
- added: `asset.repository.ts`, `asset.service.ts`, `assets.controller.ts`, `assets.routes.ts`
- added: endpoints: `POST /projects/:id/assets/upload-url`, `GET /assets/:id`, `GET /projects/:id/assets`, `POST /assets/:id/finalize`, `DELETE /assets/:id`
- added: `enqueue-ingest.ts` — idempotency, 3 retries, exponential backoff
- tested: `asset.service.test.ts`, `assets-endpoints.test.ts`, `asset.finalize.service.test.ts` (7), `assets-delete-endpoint.test.ts` (7)

## Media Worker — Ingest Job (Epic 1)
- added: `media-worker/src/jobs/ingest.job.ts` — S3 download → FFprobe → thumbnail → waveform → S3 upload → DB ready
- added: `media-worker/Dockerfile` — node:20-alpine + ffmpeg
- fixed: audio-only assets now store `fps=30` + `durationFrames` via `AUDIO_FPS_FALLBACK=30` constant (was null → frontend fell back to 5s default)
- tested: `ingest.job.test.ts` (14 total; 3 new for audio fallback path)

## Asset Browser Panel + Upload UI (Epic 1)
- added: `features/asset-manager/` — `types.ts`, `api.ts`, `useAssetUpload.ts`, `useAssetPolling.ts`, `AssetCard.tsx`, `AssetDetailPanel.tsx`, `UploadDropzone.tsx`, `UploadProgressList.tsx`, `AssetBrowserPanel.tsx`
- updated: `AssetDetailPanel.tsx` — "Add to Timeline" button; `TranscribeButton` for video/audio; status badge as absolute-positioned overlay (bottom:8 right:8); "Asset Details" header + close button
- updated: `AssetBrowserPanel.tsx` — `flex:1 minHeight:0` on outer wrapper; upload button `width:'100%'`; `onClose` prop forwarded to `AssetDetailPanel`
- added: `getAssetPreviewUrl(asset, apiBaseUrl)` in `utils.ts` — returns thumbnailUri for video, stream URL for ready images, null otherwise
- added: `matchesTab(asset, tab)` in `utils.ts` — moved from inline component to utils per §5
- added: `TypeIcon` component in `AssetCard.tsx` — SVG icons for video/audio/image/file when no preview available
- split: `AssetCard.test.tsx` → `AssetCard.test.tsx` (197) + `AssetCard.transcribe.test.tsx` (140) + `AssetCard.dnd.test.tsx` (111)
- tested: `useAssetUpload.test.ts` (7), `useAssetPolling.test.ts` (6), `AssetDetailPanel.test.tsx`, `AssetBrowserPanel.test.tsx` (12)

## VideoComposition + Storybook (Epic 2)
- updated: `VideoComposition.tsx` — z-order sort, muted filtering, `trimInFrame`/`trimOutFrame` → `startFrom`/`endAt`; added missing `image` branch for `ImageLayer`
- extracted: `VideoComposition.utils.ts` (`prepareClipsForComposition`)
- added: Storybook config + `VideoComposition.stories.tsx` (5 stories)
- tested: `VideoComposition.test.tsx` (19 total; 4 new for image branch), `VideoComposition.utils.test.ts` (7)

## Stores (Epic 2)
- added: `project-store.ts` — `useSyncExternalStore` singleton; Immer patches; `computeProjectDuration` auto-derives `durationFrames`
- added: `ephemeral-store.ts` — `playheadFrame`, `selectedClipIds`, `zoom`, `pxPerFrame`, `volume`, `isMuted`
- added: `setVolume(v)` — clamps [0,1], clears isMuted when >0; `setMuted(b)` — preserves volume for unmute
- added: `history-store.ts` — `pushPatches`, `undo`, `redo`, `drainPatches`
- tested: `project-store.test.ts`, `ephemeral-store.test.ts`, `history-store.test.ts` (29)

## PreviewPanel + PlaybackControls (Epic 2)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `usePlaybackControls.ts`, `PlaybackControls.tsx`, `formatTimecode.ts`
- updated: `usePlaybackControls.ts` — uses `useProjectStore()` (reactive) instead of `getProjectSnapshot()` so totalFrames/totalTimecode update when clips change
- fixed: rAF tick missing `setCurrentFrameState` — frame counter frozen during playback
- added: `VolumeControl.tsx` — speaker icon mute toggle + range slider + percentage label; integrated into `PlaybackControls.tsx` via `useEffect([volume, isMuted])` syncing to `playerRef`
- added: `usePrefetchAssets.ts` — calls `prefetch()` per stream URL; blob URLs replace stream URLs progressively; fixed `waitUntilDone()` — is a function not a Promise (Remotion v4)
- updated: `PreviewPanel.tsx` — uses `usePrefetchAssets(streamUrls)`; blob URLs replace stream URLs progressively
- updated: `useRemotionPlayer.ts` — stable `assetUrls` via `useMemo`; constructs `${apiBaseUrl}/assets/${assetId}/stream`; includes `image` type in assetIds filter; guards on `status === 'ready'`
- tested: `useRemotionPlayer.test.ts` (14 total), `PlaybackControls.test.tsx` (18), `usePlaybackControls.test.ts` (44), `VolumeControl.test.tsx` (11), `usePrefetchAssets.test.ts` (7)

## Dev Auth Bypass + App Shell (Epic 2)
- updated: `auth.middleware.ts`, `acl.middleware.ts` — `NODE_ENV=development` early-return with `DEV_USER`
- added: `App.tsx` — two-column desktop shell + mobile layout branch (`TABLET_BREAKPOINT=768`); `useWindowWidth()` for conditional render
- added: `App.panels.tsx` — `PreviewSection`, `RightSidebar`, `MobileTabContent` extracted to stay within 300-line limit
- added: `App.styles.ts` — `mobileShell`, `mobilePreviewArea`, `mobileTabPanel`, `mobileTimeline` style objects
- added: `MobileInspectorTabs.tsx` — three-tab bar (Assets/Captions/Inspector) with `role="tablist"` / `role="tab"` / `aria-selected`
- added: `MobileBottomBar.tsx` — Add Clip / AI Captions / Export; Export disabled when `canExport=false`
- added: `useWindowWidth.ts` — returns `window.innerWidth`, updates on resize
- tested: `App.test.tsx` (desktop), `App.mobile.test.tsx` (11), `App.PreviewSection.test.tsx`, `App.reorder.test.tsx`, `App.RightSidebar.test.tsx`, `useWindowWidth.test.ts` (5), `MobileInspectorTabs.test.tsx` (11), `MobileBottomBar.test.tsx` (12)

## Captions / Transcription (Epic 3)
- added: `caption.repository.ts`, `caption.service.ts`, `captions.controller.ts`, `captions.routes.ts`
- added: `POST /assets/:id/transcribe` (202), `GET /assets/:id/captions` (200/404)
- added: `openai ^4.0.0`; `transcribe.job.ts` — S3 → Whisper → DB
- added: FE `features/captions/` — `TranscribeButton.tsx`, `useAddCaptionsToTimeline.ts`, `CaptionEditorPanel.tsx` (with close button), `useCaptionEditor.ts`
- tested: `caption.service.test.ts` (8), `transcribe.job.test.ts` (12), `useTranscriptionStatus.test.ts` (7), `CaptionEditorPanel.test.tsx` (23 total; 3 new for close button)

## Version History & Rollback (Epic 4)
- added: `version.repository.ts`, `version.service.ts`, `versions.controller.ts`, `versions.routes.ts`
- added: `POST /projects/:id/versions`, `GET /projects/:id/versions`, `POST .../restore`
- added: `useAutosave.ts` — debounce 2s, drainPatches, POST to API, `beforeunload` flush
- added: `useVersionHistory.ts`, `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`
- tested: `version.service.test.ts` (21), `useAutosave.test.ts` (18), `useVersionHistory.test.ts` (9), `VersionHistoryPanel.test.tsx` (22), `RestoreModal.test.tsx` (20)

## Background Render Pipeline (Epic 5)
- added: `render.repository.ts`, `render.service.ts` (per-user 2-concurrent limit), `enqueue-render.ts`, `renders.controller.ts`, `renders.routes.ts`
- added: `POST /projects/:id/renders` (202), `GET /renders/:jobId`, `GET /projects/:id/renders`
- added: `render-worker/src/jobs/render.job.ts` — fetch doc_json → Remotion render → S3 → mark complete
- added: FE `features/export/` — `useExportRender.ts`, `RenderProgressBar.tsx`, `ExportModal.tsx`
- tested: `render.service.test.ts`, `render.job.test.ts` (10), `RenderProgressBar.test.tsx` (14), `ExportModal.test.tsx`

## Timeline Editor — Backend (Epic 6)
- added: `clip.repository.ts` — `getClipByIdAndProject`, `patchClip`, `insertClip`
- added: `clip.service.ts`, `clips.controller.ts`, `clips.routes.ts` — `PATCH /projects/:id/clips/:clipId`, `POST /projects/:id/clips`
- added: `packages/api-contracts/src/openapi.ts` — OpenAPI 3.1 PATCH spec
- updated: `patchClipSchema` + `clip.repository.ts` to support `trackId` for cross-track moves
- tested: `clip.service.test.ts`, `clip-patch-endpoint.test.ts` (12)

## Timeline Editor — Frontend (Epic 6)
- added: `TimelineRuler.tsx`, `TrackHeader.tsx`, `ClipBlock.tsx`, `WaveformSvg.tsx`, `ClipLane.tsx`, `ClipContextMenu.tsx`, `TrackList.tsx`, `TimelinePanel.tsx`, `ScrollbarStrip.tsx`
- added hooks: `useSnapping.ts`, `useClipDrag.ts`, `useClipTrim.ts`, `useClipDeleteShortcut.ts`, `useScrollbarThumbDrag.ts`
- added: `clipTrimMath.ts`, `clipContextMenuActions.ts`
- fixed: float frame values → `Math.round()`; split playhead edge case; passive wheel listener; duplicate `createClip` calls
- fixed: `ClipContextMenu.tsx` — wrapped in `createPortal(menu, document.body)` to escape react-window `will-change:transform` containing block (context menu was trapped inside list container, hiding timeline)
- removed: cross-track drag — `resolveTargetTrackId` removed; `ClipDragInfo` no longer carries `targetTrackId`; PATCH only sends `startFrame`; `ClipLane` cross-track overlay removed
- added: `useTrackReorder.ts` — HTML5 DnD state for track reordering; MIME `application/cliptale-track`
- updated: `TrackHeader.tsx` — drag handle (6-dot grip), `isDragging`/`isDropTarget` visual states
- updated: `TrackList.tsx` — wires `useTrackReorder`; `onReorderTracks` callback; `listRef` for vertical scroll
- updated: `TimelinePanel.tsx` — `SCROLL_OVERRUN_PX=300` past last clip; return-to-first-frame button (SVG, conditional on `playheadFrame>0`); wheel over track header column → vertical list scroll; `AddTrackMenu` in toolbar
- added: `AddTrackMenu.tsx` — "+ Track" dropdown with Video/Audio/Caption/Overlay; keyboard nav (ArrowUp/Down/Enter/Escape); `TRACK_TYPE_LABELS` exported constant
- added: `useAddEmptyTrack.ts` — creates empty track, auto-names "Video 1" / "Audio 2" etc. by type count
- updated: `TrackHeader.tsx` — `TRACK_HEADER_WIDTH` 64 → 160; removed duplicate from `TrackList.tsx`
- split: test files to stay within 300-line limit — `TimelinePanel.scrollbar.test.tsx` + `TimelinePanel.toolbar.test.tsx`; `useAddAssetToTimeline.test.ts` + `useAddAssetToTimeline.placement.test.ts`; `useDropAssetToTimeline.test.ts` + `useDropAssetWithAutoTrack.test.ts`
- added: `TrackList.styles.ts` — extracted from `TrackList.tsx`; `PRIMARY='#7C3AED'` constant; drop-active border uses `PRIMARY` on all 4 sides; `fontWeight:400` on `emptyText`
- added: `useTimelineWheel.ts` — extracted wheel handler from `TimelinePanel.tsx`
- tested: 816+ tests total (all timeline feature coverage)

## Clip Persistence + Asset Drop
- updated: `useAddAssetToTimeline.ts` — calls `createClip(projectId, clip)` after `setProject()`; track name = `stripExtension(asset.filename)`
- updated: `AssetDetailPanel.tsx`, `AssetBrowserPanel.tsx` — `projectId` prop added
- added: `useDropAssetToTimeline.ts` — `useDropAssetWithAutoTrack`: drops asset to empty timeline area, auto-creates track
- updated: `TrackList.tsx` — empty-state div handles `onDragOver`/`onDragLeave`/`onDrop`; visual feedback (dashed PRIMARY border + lighter background)
- added: `useDropAssetToTimeline.fixtures.ts` — shared test fixtures with JSDoc
- tested: `useDropAssetToTimeline.test.ts` (7 new for `useDropAssetWithAutoTrack`), `TrackList.test.tsx` (4 new empty-state DnD tests)

## S3 URL Exposure Fix
- added: `GET /assets/:id/stream` — S3 pipe with Range header forwarding (206/204)
- tested: `assets-stream-endpoint.test.ts` (8)

## Dynamic Project Creation
- added: `POST /projects` — `project.repository.ts`, `project.service.ts`, `projects.controller.ts`, `projects.routes.ts`
- added: `features/project/api.ts`, `features/project/hooks/useProjectInit.ts` — reads `?projectId=` or creates new project, writes UUID to URL via `history.replaceState`
- removed: `DEV_PROJECT_ID` from all runtime code; prop-threaded `projectId` through `TopBar`, `VersionHistoryPanel`, `ExportModal`, `App.tsx`
- tested: `useProjectInit.test.ts` (9), `project.service.test.ts` (4)

## packages/editor-core
- added: `computeProjectDuration(clips, fps, minSeconds?)` integrated into `project-store.ts`
- tested: `index.test.ts` (10)

## packages/project-schema — ImageClip
- added: `imageClipSchema` — `id`, `type:'image'`, `assetId`, `trackId`, `startFrame`, `durationFrames`, `opacity`
- extended `clipSchema` discriminated union; added `image: '#0EA5E9'` to `CLIP_COLORS`

## Timeline Sync Bug Fixes
- fixed: clip scroll sync — `scrollOffsetX` prop + max clamping via refs in `ClipBlock`, `ClipLane`, `TrackList`
- fixed: playhead needle during playback — `store/timeline-refs.ts` rAF bridge (`registerTimelinePlayheadUpdater`); direct DOM mutation
- fixed: ruler click seeks player — `useEffect` in `PreviewSection` watches `playheadFrame`, calls `playerRef.seekTo()`

## Inspector Panels (Clip Editors)
- added: `ImageClipEditorPanel.tsx` + `useImageClipEditor.ts` — Start Frame, Duration (s↔frames), Opacity (%); wired in `App.tsx` RightSidebar for image clips
- added: `VideoClipEditorPanel.tsx` + `useVideoClipEditor.ts` — Start Frame, End Frame, Start At Second (trimInFrame), Opacity (%), Volume (%)
- added: `AudioClipEditorPanel.tsx` + `useAudioClipEditor.ts` — Start Frame, End Frame, Start At Second, Volume (%) (no opacity)
- updated: `App.panels.tsx` — video/audio inspector branches in `RightSidebar` and `MobileTabContent`
- tested: `ImageClipEditorPanel.test.tsx` (20), `useImageClipEditor.test.ts`, `VideoClipEditorPanel.test.tsx` (35), `useVideoClipEditor.test.ts` (22), `AudioClipEditorPanel.test.tsx` (28), `useAudioClipEditor.test.ts` (18)

## CSS / Layout Fixes
- fixed: white border around full page — CSS reset in `main.tsx` (`margin:0; padding:0; overflow:hidden` for html/body; `width:100vw; height:100vh` for #root); mirrored in `index.html`
- fixed: `AssetBrowserPanel.tsx` upload button layout — `flex:1 minHeight:0` on outer wrapper; `width:'100%'` on upload button

## Known Issues / TODOs
- ACL middleware stub — real project ownership check deferred to projects CRUD epic
- `packages/api-contracts/` — only PATCH clip in OpenAPI spec; full spec deferred
- Presigned download URL (`GET /assets/:id/download-url`) deferred
- S3 CORS policy must be configured on bucket for browser-direct PUT
- `deleteAsset` lacks unit test (only integration coverage)
- PATCH failures in drag/trim are fire-and-forget — production hardening deferred
- `TRACK_ROW_HEIGHT = 48` duplicated in `useClipDrag.ts` and `TrackHeader.tsx` — can be unified later
- Pre-existing OOM error in web-editor test suite under full concurrency (jsdom heap pressure)
- Pre-existing API integration test failures in `assets-endpoints.test.ts` and `assets-finalize-endpoint.test.ts`
- Pre-existing audio assets in DB have null duration until re-ingested
- Production stream endpoint needs signed URL tokens or cookie-based auth for `<video>` element
- Figma node 13:69 TRACK LABELS still shows 64px — should be updated to 160px manually

---

## 2026-04-07

### Task: Add the ability to delete a track
**Subtask:** Add delete track button to TrackHeader and wire through to App.tsx

**What was done:**
- Modified `apps/web-editor/src/features/timeline/components/trackHeaderStyles.ts` — Added `controlButtonDelete` style using error/secondary color tokens
- Modified `apps/web-editor/src/features/timeline/components/TrackHeader.tsx` — Added optional `onDelete` prop; rendered a `×` delete button only when the prop is provided; added `handleDeleteClick` callback
- Modified `apps/web-editor/src/features/timeline/components/TrackRow.tsx` — Added `onDeleteTrack?` field to `TrackRowData` type; forwarded it to `TrackHeader`
- Modified `apps/web-editor/src/features/timeline/components/TrackList.tsx` — Added `onDeleteTrack?` prop and included it in `itemData`
- Modified `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — Added `onDeleteTrack?` prop; threaded it through to `TrackList`
- Modified `apps/web-editor/src/App.tsx` — Added `handleDeleteTrack` callback that removes the track and all its clips from the project doc; added to `timelinePanelProps`
- Modified `apps/web-editor/src/features/timeline/components/TrackHeader.test.tsx` — Added 3 new tests: delete button hidden when no handler, rendered when handler provided, calls handler with correct track id

**Notes:**
- Delete button is conditionally rendered only when `onDelete` is passed — backward-compatible with existing tests that don't supply it
- Deletion removes both the track entry and all clips with matching `trackId` in a single `setProject` call (single undo step)
- No confirmation dialog — task description does not request one (contrast with tasks 6 and 7 which explicitly do)

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add the ability to delete a track</summary>

1. Add the ability to delete a track.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. All three prior comments resolved: fontSize corrected to 9px, border updated to BORDER token (#252535), hover state implemented via controlButtonDeleteHover with error token (#EF4444) background. Code matches design guide and established M/L button pattern.
design-reviewer comments (2026-04-07):
- [FILE: apps/web-editor/src/features/timeline/components/trackHeaderStyles.ts, LINE: ~115] ISSUE: `controlButtonDelete.fontSize` is 14px, while the existing M and L control buttons use 9px (`controlButton.fontSize`). The `×` glyph will render noticeably larger and heavier than M/L, breaking visual consistency in the controls row. EXPECTED: Match the existing `controlButton` font-size of 9px (or use 10–11px at most for the multiplication sign glyph to remain legible). FIX: Change `fontSize: 14` to `fontSize: 9` in `controlButtonDelete`.
- [FILE: apps/web-editor/src/features/timeline/components/trackHeaderStyles.ts, LINE: ~112] ISSUE: `controlButtonDelete` uses `border: '1px solid transparent'`, while `controlButton` (M and L) uses `border: '1px solid ${BORDER}'` (#252535). The delete button has no visible border at rest, making it visually inconsistent with the sibling control buttons. EXPECTED: Destructive buttons may legitimately differ from toggle buttons, but the gap here is not documented as intentional — the button should either match the BORDER style at rest or adopt the `error` token border to signal its destructive role. FIX: Either set `border: \`1px solid ${BORDER}\`` to match M/L, or set `border: \`1px solid transparent\`` and add an `onMouseEnter`/`onMouseLeave` hover style that surfaces `error` (#EF4444) as the border/text color.
- [FILE: apps/web-editor/src/features/timeline/components/TrackHeader.tsx, LINE: ~254–263] ISSUE: The delete button has no hover or focus visual state. The design guide (Section 3) assigns the `error` token (#EF4444) to "destructive actions." The M/L buttons both have active-state styles (`controlButtonActive`, `controlButtonLocked`). The delete button provides no colour feedback on hover, giving the user no affordance that the action is destructive. EXPECTED: A hover style that changes `color` (and optionally `borderColor`) to the `error` token (#EF4444). FIX: Implement `onMouseEnter`/`onMouseLeave` handlers on the delete button (same pattern as M/L active states), switching to `color: ERROR` and `borderColor: ERROR` on hover; add `ERROR = '#EF4444'` constant to `trackHeaderStyles.ts`.
checked by playwright-reviewer: YES

---

## 2026-04-07

### Task: Fix Remotion preview not visible on mobile (iPhone 14)
**Subtask:** Fix Remotion preview hidden on mobile by removing absolute overlay pattern

**What was done:**
- Modified `apps/web-editor/src/App.styles.ts` — replaced `mobilePreviewArea` (flex:1 + relative positioning that allowed overlay) with a fixed-height area using `calc(56.25vw + 40px)` — 56.25vw for the 16:9 video frame scaled to screen width, plus 40px for playback controls; removed `mobileTabPanel` (the absolute overlay style); added `mobileInspectorContent` — a normal-flow flex panel that appears below the tab bar with `flex:1, overflow:auto, minHeight:0` to fill remaining space without covering the preview
- Modified `apps/web-editor/src/App.tsx` — restructured mobile layout: `<main>` (preview area) now only contains `<PreviewSection>`; tab bar (`MobileInspectorTabs`) follows `<main>` in normal document flow; inspector content panel (`mobileInspectorContent` div) appears after the tab bar — no absolute positioning anywhere in the mobile layout
- Modified `apps/web-editor/src/App.mobile.test.tsx` — updated two tests that referenced the old `mobileTabPanel`-inside-`main` structure; tests now verify the inspector content is outside the `<main>` Preview landmark (correct behavior)

**Notes:**
- Root cause: `mobileTabPanel` was `position:absolute; top:0; left:0; right:0; bottom:0; zIndex:10` over the preview area. Since `mobileTab` defaults to `'assets'`, it was always rendered, completely covering the Remotion player on every page load.
- The `calc(56.25vw + 40px)` height ensures the preview scales proportionally: iPhone 14 (390px) → ~259px preview; tablet (768px) → ~472px. This matches the Figma node 13:114 intent (380px for a 768px-wide tablet design).
- Total fixed heights on iPhone 14 (844px): 48 (TopBar) + 259 (Preview) + 48 (Inspector tabs) + 300 (Timeline) + 64 (Bottom bar) = 719px; remaining 125px goes to `mobileInspectorContent` — enough for usable inspector content.
- All 1132 existing tests continue to pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix Remotion preview not visible on mobile</summary>

4. The Remotion preview is not visible on the mobile version, for example on iPhone 14.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. All checks passed. Color tokens correct: SURFACE, SURFACE_ALT, BORDER, TEXT_PRIMARY used throughout — no hardcoded hex values. Heights match design guide: TopBar 48px, playback controls 40px, inspector tab bar 48px, timeline 300px, bottom bar 64px. The calc(56.25vw + 40px) formula correctly implements the 16:9 aspect ratio for a full-width video frame at any viewport width (190px at 390px = ~219px video + 40px controls). flexShrink:0 on mobilePreviewArea ensures the Remotion player is never compressed. Layout structure — preview in main flow, inspector content outside <main>, timeline and bottom bar below — matches the Figma node 13:111 vertical stack. Figma note: No Mobile (390px) editor frame exists in Figma (Editor Core page 1:5 has only Desktop 13:2 and Tablet 13:111). The tablet wireframe adequately covers the layout pattern; the mobile-specific proportions are derived correctly from the 16:9 design rule in design-guide.md §8.
checked by playwright-reviewer: YES
---

## 2026-04-07

### Task: Fix render export stuck at queue 0%
**Subtask:** Add render-worker Docker service and Chromium support so export renders actually execute

**What was done:**
- Created `apps/render-worker/Dockerfile` — node:20-slim base with Chromium and all required system libraries installed; builds `project-schema`, `remotion-comps`, and `render-worker`
- Modified `apps/render-worker/src/config.ts` — added optional `APP_CHROMIUM_EXECUTABLE_PATH` env var (maps to `config.chromiumExecutablePath`)
- Modified `apps/render-worker/src/lib/remotion-renderer.ts` — imported `config`; passes `browserExecutable: config.chromiumExecutablePath ?? null` to both `selectComposition` and `renderMedia`
- Modified `docker-compose.yml` — added `render-worker` service with Redis/DB/S3 env vars, `APP_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`, and `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
- Added `apps/render-worker/src/lib/remotion-renderer.test.ts` — 6 tests covering: browserExecutable forwarding when path set, null when undefined, correct codec/outputLocation, onProgress callback, error propagation, and bundle URL forwarding

**Notes:**
- Root cause: `render-worker` service was entirely absent from `docker-compose.yml`. BullMQ jobs were enqueued but no worker was consuming them, so they stayed at status `queued` / 0% forever.
- Remotion v4 already passes `--no-sandbox` and `--disable-setuid-sandbox` internally, so no additional Chrome flags are needed.
- `APP_CHROMIUM_EXECUTABLE_PATH` is optional — omitting it causes Remotion to auto-detect its own downloaded browser (correct behavior for local development).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix render export stuck at queue 0%</summary>

2. The render export is not working; it gets stuck in the queue at 0%.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. No UI changes. All modified files are backend infrastructure: Dockerfile, config.ts, remotion-renderer.ts, docker-compose.yml, and a test file. No colors, typography, spacing, or components were touched. No design-impacting regressions found.
checked by playwright-reviewer: YES — Export button present in TopBar (aria-disabled=true with no version, correct); editor shell, timeline, and all known UI features render without regressions. Backend fix (render-worker added to docker-compose.yml) confirmed in config — render-worker not running in current stack (user must re-run docker compose up to activate).

---

## 2026-04-07

### Task: Add Renders in Progress modal
**Subtask:** Add a "Renders" button to the TopBar and a modal showing all render jobs for the current project

**What was done:**
- Created `apps/web-editor/src/features/export/hooks/useListRenders.ts` — `useListRenders(projectId)` hook that fetches `GET /projects/:id/renders`, polls every 5 seconds while any job is queued/processing, stops when all jobs are terminal; disabled when projectId is empty string (pre-ready state); exposes `renders`, `isLoading`, `error`, `activeCount`
- Created `apps/web-editor/src/features/export/components/RendersQueueModal.styles.ts` — design-guide-compliant styles using dark tokens; `progressFill` function renders color-coded fill by status (primary=active, success=complete, error=failed)
- Created `apps/web-editor/src/features/export/components/RendersQueueModal.tsx` — modal listing all render jobs; each job is a `<article>` card with preset label, date, status badge, progress bar (`role="progressbar"`), percentage, and Download link (for complete jobs) or error message (for failed); empty/loading/error states; backdrop click closes
- Modified `apps/web-editor/src/TopBar.tsx` — added `isRendersOpen`, `onToggleRenders`, `activeRenderCount` props; added Renders button (same style as History button) with an absolute-positioned badge showing `activeRenderCount` when > 0
- Modified `apps/web-editor/src/App.tsx` — added `isRendersOpen` state + handlers; called `useListRenders(resolvedProjectId)` at top level with empty-string sentinel before project is ready; wired `activeRenderCount`, `isRendersOpen`, `onToggleRenders` into both desktop and mobile TopBar; renders `RendersQueueModal` in both layouts when `isRendersOpen` is true
- Modified `apps/web-editor/src/TopBar.test.tsx` — added new required props to `defaultProps`; added 7 new tests for Renders button behavior and badge
- Modified `apps/web-editor/src/App.test.tsx` — added mocks for `RendersQueueModal` and `useListRenders`; added 4 new integration tests for Renders modal toggle
- Modified `apps/web-editor/src/App.mobile.test.tsx` — added mocks for `RendersQueueModal` and `useListRenders`
- Modified `apps/web-editor/src/App.reorder.test.tsx` — added mocks for `RendersQueueModal` and `useListRenders`
- Modified `apps/web-editor/src/App.RightSidebar.test.tsx` — added mocks for `RendersQueueModal` and `useListRenders`
- Created `apps/web-editor/src/features/export/hooks/useListRenders.test.ts` — 12 tests covering: disabled when empty projectId, calls API with correct projectId, returns correct renders array, activeCount for all status combinations, isLoading states, error handling
- Created `apps/web-editor/src/features/export/components/RendersQueueModal.test.tsx` — 22 tests covering: dialog structure, close behavior (×/footer/backdrop), loading state, error state, empty state, job cards for all statuses, progressbar aria, Download link, error message, preset label display

**Notes:**
- `useListRenders` is called unconditionally at the top of `App` (before early returns) to avoid violating React hooks rules; an empty string `''` is used as sentinel when projectId is not yet resolved — the query is disabled via `enabled: projectId !== ''`
- The Renders button is always enabled (unlike Export which requires a saved version) — users may want to check render history even before re-exporting
- Modal lists all renders newest-first as returned by the API (backend sorts by `created_at DESC`)
- Badge count uses singular/plural label for accessibility ("1 active render" vs "2 active renders")

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add a Renders in Progress modal</summary>

3. There is no way to navigate to a modal that shows which renders are currently in progress, likely somewhere in the Export Video section.

</details>

checked by code-reviewer - YES
> ❌ `RendersQueueModal.tsx:5` — §9 import ordering: relative import `./RendersQueueModal.styles` (group 5) is placed between two group-4 `@/` absolute imports (lines 3-4 and line 6); relative imports must come last
> ❌ `RendersQueueModal.tsx:22-68` — §5 violation: formatter/helper functions `getPresetLabel`, `formatDate`, `getStatusBadgeStyle`, `getStatusLabel` are defined inside a `.tsx` component file; per §5 and prior ruling these must live in `features/export/utils.ts`
> ❌ `RendersQueueModal.styles.ts` — §9 naming violation: companion styles file uses `PascalCase.styles.ts` pattern; the only valid companion naming under §9 is `camelCase.ts`; must be renamed to e.g. `rendersQueueModal.styles.ts`
> ❌ `TopBar.tsx` — §9 file length: file is 361 lines after this subtask's additions (was 180 before); exceeds the 300-line hard limit; new Renders button block plus its styles must be extracted to bring the file under 300
> ⚠️ `useListRenders.test.ts:18-19` — §9 import ordering warning: `./useListRenders` relative import (group 5) appears before `@/features/export/types` (group 4) due to `vi.mock` hoisting constraint; warning only per Vitest gray area ruling
> ⚠️ `RendersQueueModal.test.tsx:17-18` — §9 import ordering warning: same `vi.mock` hoisting issue; relative `./RendersQueueModal` import appears before `@/` import; warning only
re-reviewed by code-reviewer - YES
> ✅ All 5 fixes confirmed: import ordering, helpers extracted to utils.ts, rendersQueueModal.styles.ts (camelCase), TopBar.tsx under 300 lines, TopBar.styles.ts renamed to topBar.styles.ts (camelCase). No remaining violations.
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. All 5 prior comments resolved: (1) progressTrack and progressFill height corrected to 8px; (2) modal maxHeight updated to 700px; (3) emptyState and loadingState fontSize corrected to 14px (body token); (4) jobPresetLabel fontSize corrected to 14px; (5) closeFooterButton color updated to TEXT_PRIMARY. Code matches design guide and Figma spec.
design-reviewer figma-fix (2026-04-07):
- FIXED: The Figma TopBar (node 13:3) had no annotation for the Renders button introduced by this subtask.
- ACTION: The Figma TopBar is a wireframe-level block with no component-level specs. The Renders button follows the established History button pattern (transparent background, BORDER border, TEXT_SECONDARY label, 6px radius) and its visual treatment is already consistent with the design system. No structural Figma change needed; the gap is documentation-only. Added note in design-guide.md §8 Editor Core TopBar inventory: "Renders button: same style as History button; shows a PRIMARY-colored pill badge (radius-full) when activeRenderCount > 0."
- SOURCE: design-guide.md §3 color tokens + §8 Editor Core TopBar region spec + existing History button pattern in TopBar.tsx.
design-reviewer comments (2026-04-07):
- [FILE: apps/web-editor/src/features/export/components/RendersQueueModal.styles.ts, LINE: ~191] ISSUE: `progressTrack.height` is 6px and `progressFill` height is also 6px. EXPECTED: Figma node 16:97 (RENDER PROGRESS BAR TRACK) specifies height 8px; node 16:99 (PROGRESS FILL) also 8px. FIX: Change both `height: '6px'` values to `height: '8px'` in `progressTrack` and inside the `progressFill` function.
- [FILE: apps/web-editor/src/features/export/components/RendersQueueModal.styles.ts, LINE: ~29] ISSUE: `modal.maxHeight` is 600px. EXPECTED: Figma node 16:73 (EXPORT MODAL CONTAINER) specifies the modal as 700px tall. The RendersQueueModal shares the same container spec. A 600px cap truncates the modal 100px shorter than the Figma design. FIX: Change `maxHeight: '600px'` to `maxHeight: '700px'`.
- [FILE: apps/web-editor/src/features/export/components/RendersQueueModal.styles.ts, LINE: ~91–105] ISSUE: `emptyState.fontSize` and `loadingState.fontSize` are both 13px. EXPECTED: The design scale (design-guide.md §3 Typography) has no 13px token — the nearest tokens are `body` (14px) or `body-sm` (12px). 13px is an arbitrary value not on the 4px-grid-aligned type scale. FIX: Use `fontSize: '14px'` (body token) or `fontSize: '12px'` (body-sm token). Given these are placeholder/status messages, `body-sm` (12px, lineHeight 16px) is appropriate.
- [FILE: apps/web-editor/src/features/export/components/RendersQueueModal.styles.ts, LINE: ~131] ISSUE: `jobPresetLabel.fontSize` is 13px — an arbitrary value not in the typography scale. EXPECTED: The design guide defines `body` at 14px (400 Regular) and `heading-3` at 16px (600 Semi Bold) for card titles. As a card title/label the preset name should use `heading-3` (16px / 600) or at minimum `body` (14px). FIX: Change `fontSize: '13px'` to `fontSize: '14px'` and keep `fontWeight: 600`, or use `fontSize: '16px', fontWeight: 600` to match the `heading-3` card title spec.
- [FILE: apps/web-editor/src/features/export/components/RendersQueueModal.styles.ts, LINE: ~252] ISSUE: `closeFooterButton.color` is `TEXT_SECONDARY` (#8A8AA0), making the "Close" button label appear muted. EXPECTED: Figma node 16:109 (CANCEL / CLOSE) shows a bordered button with readable label text. The design guide uses `text-primary` (#F0F0FA) for button labels on bordered interactive elements (see History/Renders button active states, export button). FIX: Change `color: TEXT_SECONDARY` to `color: TEXT_PRIMARY` in `closeFooterButton`.
checked by playwright-reviewer: YES

---

## 2026-04-07

### Task: Add scroll-to-beginning button to timeline
**Subtask:** When the user scrolls the timeline too far right, show a button to scroll back to the beginning

**What was done:**
- Modified `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — imported `setScrollOffsetX` from the ephemeral store; added a "Scroll to beginning" button in the toolbar that renders only when `scrollOffsetX > 0`; clicking it calls `setScrollOffsetX(0)` to reset the horizontal scroll position to the timeline start
- Modified `apps/web-editor/src/features/timeline/components/TimelinePanel.toolbar.test.tsx` — added 3 new tests: button hidden when `scrollOffsetX === 0`, rendered when `scrollOffsetX > 0`, calls `setScrollOffsetX(0)` when clicked

**Notes:**
- The existing "Return to first frame" button (shown when `playheadFrame > 0`) resets the playhead, not the scroll. These are two distinct concerns — scroll position and playhead position. Both buttons appear in the toolbar and are visually similar but perform different actions.
- The "Scroll to beginning" button uses a double-left-bar SVG icon (two vertical bars + chevron) to distinguish it from the single-bar playhead icon.
- All 1136 existing tests continue to pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add scroll-to-beginning button to timeline</summary>

5. When I scroll too far on the timeline, there should be a button to return to the beginning.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. All checks passed. Button reuses `styles.toolbarButton` exactly (24×24px, transparent background, BORDER border, radius-sm 4px, TEXT_PRIMARY color, Inter font) — identical spec to existing zoom and Return-to-first-frame buttons. SVG icon uses `width="12" height="12" fill="currentColor"` consistent with the existing toolbar icon pattern; double-bar + chevron-left shape is visually distinct from the single-bar "Return to first frame" icon. All hardcoded hex values in timelinePanelStyles.ts are correct design-token mappings (SURFACE_ALT=#16161F, BORDER=#252535, TEXT_SECONDARY=#8A8AA0, TEXT_PRIMARY=#F0F0FA, PLAYHEAD_COLOR=#EF4444). No arbitrary spacing or font sizes introduced. Dark-theme compliance confirmed. Code matches design guide and Figma spec.
checked by playwright-reviewer: YES

---

## 2026-04-07

### Task: Add logic for Replace File
**Subtask:** Add Replace File functionality to the Asset Detail Panel

**What was done:**
- Created `apps/web-editor/src/features/asset-manager/hooks/useReplaceAsset.ts` — `useReplaceAsset()` hook that returns a `replaceAsset(oldAssetId, newAssetId)` callback; maps all clips that reference the old asset to the new asset using `setProject()` (Immer-tracked, fully undoable with Ctrl+Z); no-ops when `oldAssetId === newAssetId`
- Created `apps/web-editor/src/features/asset-manager/components/replaceAssetDialog.styles.ts` — companion styles file (camelCase per §9) with all design-guide tokens; styles for overlay, modal, warning banner, upload area, library list, and action buttons
- Created `apps/web-editor/src/features/asset-manager/components/ReplaceAssetDialog.tsx` — confirmation dialog showing: (1) warning explaining which clips will be affected and that the action is undoable; (2) upload-new-file area using existing `useAssetUpload` hook; (3) scrollable library list of existing ready assets; Replace button enabled only after a library asset is selected; `onReplaced` callback fires after commit
- Modified `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — added optional `onReplace?: () => void` prop; "Replace File" button is now enabled (with TEXT_PRIMARY color, pointer cursor) when `onReplace` is supplied, disabled (muted, not-allowed) otherwise
- Modified `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx` — added `isReplaceOpen` state; wires `onReplace={() => setIsReplaceOpen(true)}` to `AssetDetailPanel`; renders `ReplaceAssetDialog` when open, passing `libraryAssets={assets}` for the in-library selection list
- Created `apps/web-editor/src/features/asset-manager/hooks/useReplaceAsset.test.ts` — 9 tests covering: returns function, updates clips referencing oldAssetId, updates multiple clips, no-op when same asset, preserves clips without assetId (text overlay), handles audio/image clip types, preserves other project fields
- Created `apps/web-editor/src/features/asset-manager/components/ReplaceAssetDialog.test.tsx` — 24 tests covering: dialog structure, close behaviour, library selection (empty/processing filtered/enabled after selection/calls replaceAsset/calls onReplaced), upload flow, accessibility (aria-modal, aria-labelledby, aria-describedby, listbox)
- Modified `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.test.tsx` — added 4 new tests for the Replace File button

**Notes:**
- Replacement is always a soft operation: `setProject()` pushes Immer patches to `history-store`, so the user can undo with Ctrl+Z or restore a prior version from Version History. The old asset file is never deleted.
- Upload-based replacement uses the existing `useAssetUpload` flow; `onUploadComplete` receives the new `assetId` and immediately calls `replaceAsset(oldId, newId)` followed by `onReplaced()`.
- Library candidates are filtered to `status === 'ready'` and exclude the current asset itself.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add logic for Replace File</summary>

6. Add logic for `Replace File` so that it replaces all clips using that file with a new one that the user uploads or selects from the library. There should be a warning first, asking for confirmation and explaining the consequences. It should not physically delete the file, only soft-delete it, so the user can still restore it using undo buttons or history.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Re-reviewed on 2026-04-07. All 6 fixes confirmed: (1) Replace File button fontSize corrected to 14px; (2) Replace File button border/color now uses BORDER/TEXT_PRIMARY/TEXT_SECONDARY token constants; (3) uploadText.fontSize 12px / lineHeight 16px (body-sm); (4) libraryItemName.fontSize 14px / lineHeight 20px (body); (5) libraryItem/libraryItemHover/libraryItemSelected borderRadius 4px (radius-sm); (6) cancelButton/replaceButton/replaceButtonHover/replaceButtonDisabled borderRadius 8px (radius-md). No new design violations found in the fixed code. Code matches design guide.
fixes applied (2026-04-07): fontSize 12→14 on Replace File button (AssetDetailPanel.tsx); uploadText 13px→12px; libraryItemName 13px→14px; libraryItem/libraryItemHover/libraryItemSelected borderRadius 6px→4px; cancelButton/replaceButton/replaceButtonHover/replaceButtonDisabled borderRadius 6px→8px
pre-existing issues noted (NOT fixed — not introduced by this task): (1) status badge position:absolute over preview thumbnail (pre-dates this task); (2) Delete Asset button fontSize:12 (pre-existing stub); (3) raw hex strings throughout AssetDetailPanel pre-existing body (token block BORDER/TEXT_PRIMARY/TEXT_SECONDARY now added at module level)
design-reviewer comments (2026-04-07):
- [FILE: apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx, LINE: ~117–141] ISSUE: The status badge is rendered as `position:absolute` overlaid on the preview thumbnail (bottom:8, right:8 of the preview container). EXPECTED: Figma node 15:75 (STATUS READY) is placed at `y=296` in the ASSET DETAIL PANEL — below the FILE TYPE + SIZE + DURATION row (node 15:73, which ends at y=280) — as a standalone block-level element, not an overlay. FIX: Move the status badge `<div>` out of the preview `<div>` and render it as a sibling element after the metadata row, matching the Figma layout order: preview → filename → file type/size/duration → status badge.
- [FILE: apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx, LINE: ~9–14] ISSUE: `STATUS_BG` map and all inline styles throughout the component use raw hex strings (`#16161F`, `#1E1E2E`, `#F0F0FA`, `#8A8AA0`, `#252535`, `#7C3AED`, `#4C1D95`, `#EF4444`, `#10B981`, `#F59E0B`). EXPECTED: Design guide §3 and §9 require all color values to reference named design-token constants (as seen in `replaceAssetDialog.styles.ts` which correctly declares `SURFACE_ELEVATED`, `TEXT_PRIMARY`, etc.). Hardcoded hex values make the file immune to future token changes and create a maintenance gap. FIX: Extract a token constant block at the top of `AssetDetailPanel.tsx` (or a companion `assetDetailPanel.styles.ts`) with named constants matching design-guide.md tokens, and replace every raw hex string with the corresponding constant.
- [FILE: apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx, LINE: ~232–248] ISSUE: The "Replace File" button uses `fontSize: 12` (body-sm token, 12px / 400 Regular). EXPECTED: The "Add to Timeline" button directly above it uses `fontSize: 14` (body token). Both are primary action buttons for the panel; inconsistent font sizes create a visual weight hierarchy that doesn't match the design guide button spec, where button labels use the `body` token (14px, lineHeight 20px). FIX: Change `fontSize: 12` to `fontSize: 14` on the Replace File button style, consistent with the Add to Timeline button.
- [FILE: apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx, LINE: ~251–268] ISSUE: The "Delete Asset" button also uses `fontSize: 12`. EXPECTED: Same as Replace File above — button labels use `body` (14px). FIX: Change `fontSize: 12` to `fontSize: 14` on the Delete Asset button.
- [FILE: apps/web-editor/src/features/asset-manager/components/replaceAssetDialog.styles.ts, LINE: ~137–141] ISSUE: `uploadText.fontSize` is 13px — an arbitrary value not present in the typography scale. The design guide §3 defines no 13px token; nearest are `body` (14px) or `body-sm` (12px). EXPECTED: Instruction text in a drop zone is a secondary/helper text — `body-sm` (12px, 400 Regular, lineHeight 16px) is appropriate. FIX: Change `fontSize: '13px'` in `uploadText` to `fontSize: '12px'` with `lineHeight: '16px'`.
- [FILE: apps/web-editor/src/features/asset-manager/components/replaceAssetDialog.styles.ts, LINE: ~211–218] ISSUE: `libraryItemName.fontSize` is 13px — again an arbitrary off-scale value. EXPECTED: Asset names in a list are body content; the design guide body token is 14px. FIX: Change `fontSize: '13px'` to `fontSize: '14px'` in `libraryItemName`.
- [FILE: apps/web-editor/src/features/asset-manager/components/replaceAssetDialog.styles.ts, LINE: ~170–178] ISSUE: `libraryItem.borderRadius` is 6px — not a defined radius token. The design guide §3 defines: `radius-sm`=4px, `radius-md`=8px, `radius-lg`=16px, `radius-full`=9999px. 6px falls between tokens. EXPECTED: List rows at this size use `radius-sm` (4px) for tight-fit items or `radius-md` (8px) for card-like rows. The libraryItem is a compact row (padding 8px/12px), consistent with `radius-sm` 4px. FIX: Change `borderRadius: '6px'` to `borderRadius: '4px'` in `libraryItem`, `libraryItemHover`, and `libraryItemSelected`.
- [FILE: apps/web-editor/src/features/asset-manager/components/replaceAssetDialog.styles.ts, LINE: ~242–253] ISSUE: `cancelButton.borderRadius` is 6px (same off-token value as library items). EXPECTED: Button radius should use `radius-sm` (4px) for small controls or `radius-md` (8px) for standard-height buttons. The cancel button is 36px tall (8px padding + 20px lineHeight + 8px padding), which maps to a standard button using `radius-md` (8px). The existing `replaceButton` also uses `borderRadius: '6px'`. FIX: Change `borderRadius: '6px'` to `borderRadius: '8px'` on `cancelButton`, `replaceButton`, `replaceButtonHover`, and `replaceButtonDisabled` to use the `radius-md` token.
checked by playwright-reviewer: YES — Replace File button visible and enabled in AssetDetailPanel; clicking it opens ReplaceAssetDialog with warning banner (clips affected, undoable), upload area, library asset list (test_audio.mp3 shown as selectable), Cancel and Replace buttons. All regression workflows pass: editor shell loads (0 JS errors), Renders modal opens/closes, Add to Timeline creates track+clip, History panel accessible.

---

## 2026-04-07

### Task: Add logic for Delete Asset
**Subtask:** Add Delete Asset functionality to the Asset Detail Panel with confirmation dialog

**What was done:**
- Created `apps/web-editor/src/features/asset-manager/hooks/useDeleteAsset.ts` — `useDeleteAsset()` hook that returns a `deleteAsset(assetId)` callback; filters out all clips referencing the asset using `setProject()` (Immer-tracked, fully undoable); also removes tracks that become empty after clip removal
- Created `apps/web-editor/src/features/asset-manager/components/deleteAssetDialog.styles.ts` — design-guide-compliant styles (camelCase companion file per §9); uses ERROR (#EF4444), ERROR_DARK (#DC2626), WARNING (#F59E0B), BORDER, TEXT_PRIMARY, TEXT_SECONDARY, SURFACE_ELEVATED tokens; radius-md (8px) on buttons, body font size (14px) on button labels
- Created `apps/web-editor/src/features/asset-manager/components/DeleteAssetDialog.tsx` — confirmation dialog with: warning banner explaining which clips/tracks will be removed and that the action is undoable; Cancel and Delete Asset buttons; backdrop click closes; `aria-modal`, `aria-labelledby`, `aria-describedby` accessibility attributes
- Modified `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — changed `onDelete` prop type from `(id: string) => void` to `() => void` (callee does not need the id); Delete Asset button now enabled (error border/color, pointer cursor) when `onDelete` is supplied, disabled (muted, not-allowed) otherwise; corrected fontSize from 12 to 14 (body token)
- Modified `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx` — added `isDeleteOpen` state; imported `DeleteAssetDialog`; wires `onDelete={() => setIsDeleteOpen(true)}` to `AssetDetailPanel`; renders `DeleteAssetDialog` when `isDeleteOpen && selectedAsset`; `onDeleted` closes dialog and deselects the asset
- Created `apps/web-editor/src/features/asset-manager/hooks/useDeleteAsset.test.ts` — 10 tests covering: returns function, removes clips by assetId, removes multiple clips, removes empty tracks, keeps tracks with remaining clips, preserves caption clips without assetId, handles audio/image clips, no-op when asset not referenced, preserves other project fields
- Created `apps/web-editor/src/features/asset-manager/components/DeleteAssetDialog.test.tsx` — 22 tests covering: dialog structure (role/aria-modal/title/close/Cancel/Delete buttons), warning banner content (filename/clips removed/empty tracks/file not deleted/Ctrl+Z), close behaviour (× button/Cancel/backdrop overlay/clicking inside modal), confirm deletion (calls deleteAsset with id/calls onDeleted/call order/Cancel does not trigger), accessibility (aria-labelledby/aria-describedby)
- Modified `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.test.tsx` — added 4 new tests for Delete Asset button (renders/disabled without prop/enabled with prop/calls onDelete on click)

**Notes:**
- Deletion is always a soft operation: `setProject()` pushes Immer patches to `history-store`, so the user can undo with Ctrl+Z or restore a prior version from Version History. The asset file in S3/R2 is never deleted.
- Empty track removal is intentional and documented in the warning banner — a track with no clips is dead weight in the composition.
- The `onDelete` prop type changed from `(id: string) => void` to `() => void`. The `AssetBrowserPanel` knows the selected asset id and does not need the panel to pass it back.
- Total test count: 1237 (all passing).

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add logic for Delete Asset</summary>

7. Add logic for `Delete Asset` so that it removes the asset from all tracks and clips, and deletes the clips themselves. There should be a warning first, asking for confirmation and explaining the consequences. It should not physically delete the file, only soft-delete it, so the user can still restore it using undo buttons or history.

</details>

checked by code-reviewer - COMMENTED (fixed 2026-04-07)
> Fixes applied: `DeleteAssetDialog.test.tsx` and `AssetDetailPanel.test.tsx` both converted to `vi.hoisted()` pattern per §10. All 55 tests pass.
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Re-reviewed on 2026-04-07. Both previously flagged issues confirmed fixed. (1) Delete button text color: `color` now references the named `ERROR` constant (`'#EF4444'`) declared in the token block at line 17 — no raw hex string. (2) Delete button border color: `border` now uses the named `BORDER` constant (`'#252535'`) at line 265, matching Figma node 15:79 default/enabled state — no raw hex string. Token block at lines 16–19 correctly declares BORDER, ERROR, TEXT_PRIMARY, TEXT_SECONDARY. No new design violations found.
> Fixes applied: `const ERROR = '#EF4444'` declared in token block of `AssetDetailPanel.tsx` alongside `BORDER`, `TEXT_PRIMARY`, `TEXT_SECONDARY`; Delete button `color` now references `ERROR` constant; Delete button `border` changed from conditional `ERROR`/`BORDER` to always `BORDER` per Figma node 15:79 (default/enabled state uses `#252535` border, not red).
checked by playwright-reviewer: YES — Delete Asset button visible and enabled (pointer cursor, red border) in AssetDetailPanel; clicking it opens DeleteAssetDialog (role="dialog", aria-modal=true, aria-labelledby=delete-asset-title, aria-describedby=delete-asset-desc); dialog shows warning banner with filename "Oleksii_00002.mp4", "Tracks that become empty after removal will also be deleted", "The original file is not deleted. You can undo this action with Ctrl+Z or restore a previous version from Version History."; Cancel closes dialog without removing asset; backdrop click closes dialog; "Delete Asset" confirm button visible in dialog. Regression suite: editor shell loads (2 pre-existing 404s for thumbnails — known S3 CORS issue, not JS errors), Renders modal and Replace File dialog both accessible. 0 regressions found.

---

## 2026-04-07

### Task: Allow adding multiple caption tracks
**Subtask:** Allow adding multiple caption tracks

**What was done:**
- Modified `apps/web-editor/src/features/captions/hooks/useAddCaptionsToTimeline.ts` — removed the idempotency guard that prevented adding a second "Captions" track; replaced fixed `CAPTIONS_TRACK_NAME = 'Captions'` with dynamic naming: counts existing tracks whose name starts with "Captions" and generates "Captions 1", "Captions 2", etc.
- Modified `apps/web-editor/src/features/captions/hooks/useAddCaptionsToTimeline.test.ts` — removed 3 idempotency-guard tests; added 4 new tests for multiple-track naming: first track named "Captions 1", second named "Captions 2", sequential multi-add, and non-caption tracks don't affect count
- Modified `apps/web-editor/src/features/captions/components/TranscribeButton.tsx` — removed `captionsAdded` state and the 'added' ButtonState/LABEL/STATUS_COLOR entries; removed `captionsAdded` from `isDisabled`; button stays enabled in "ready" state after adding captions so user can click again to add another track
- Modified `apps/web-editor/src/features/captions/components/TranscribeButton.test.tsx` — removed "Captions Added" state describe block (3 tests); added 2 new tests verifying button stays enabled after adding and can be clicked multiple times

**Notes:**
- All 1240 tests pass (no regressions).
- The track type remains `'overlay'` — unchanged from original; the task only concerned the naming/multiplicity logic.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Allow adding multiple caption tracks</summary>

8. Allow adding multiple caption tracks.

</details>

checked by code-reviewer - COMMENTED
> ❌ `TranscribeButton.test.tsx` — §9 file length: 316 lines, exceeds the 300-line hard limit; the new "adding captions to timeline (multiple tracks allowed)" describe block (lines 214–241) plus one other describe group should be split into `TranscribeButton.multitrack.test.tsx` or similar
> ⚠️ `useAddCaptionsToTimeline.test.ts:21–23` — §9 import ordering warning: `@/store/project-store` (group 4) and `@ai-video-editor/project-schema` (group 3) appear after relative import `./useAddCaptionsToTimeline` (group 5) at line 5 due to vi.mock hoisting constraint; warning only per Vitest gray area ruling
> ⚠️ `TranscribeButton.test.tsx:21–23` — §9 import ordering warning: `@/features/captions/api`, `@/features/captions/hooks/useTranscriptionStatus`, `@/features/captions/hooks/useAddCaptionsToTimeline` (all group 4) appear after relative import `./TranscribeButton` (group 5) at line 5 due to vi.mock hoisting constraint; warning only per Vitest gray area ruling
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. All checks passed. The subtask is purely behavioral — only the `captionsAdded` state and its associated `LABEL`/`STATUS_COLOR`/`isDisabled` entries were removed from TranscribeButton.tsx. No new visual styles, colors, spacing, or component variants were introduced. Remaining color values (idle=#7C3AED, pending/processing=#8A8AA0, ready=#10B981, error=#EF4444) correctly map to design-guide.md tokens (primary, text-secondary, success, error). Button stays enabled in `ready` state, which is consistent with the Figma AI Captions Panel (node 16:2) showing no dedicated one-time-only disabled state for the generate button.
checked by playwright-reviewer: YES
re-reviewed by code-reviewer (2026-04-07, fix verification) - COMMENTED
> ✅ `TranscribeButton.test.tsx` — 238 lines, file length violation resolved
> ✅ `TranscribeButton.multitrack.test.tsx` — 93 lines, correct split test naming, correct placement
> ✅ `TranscribeButton.fixtures.ts` — fixtures extracted and imported in both test files, no verbatim duplication
> ❌ `TranscribeButton.fixtures.ts` — §9 JSDoc: 5 exported functions (`makeIdleStatus`, `makeReadyStatus`, `makeErrorStatus`, `makeFetchingStatus`, `makeAddCaptionsHook`) have no JSDoc; all exported functions require per-function JSDoc per §9
> ⚠️ `TranscribeButton.multitrack.test.tsx:21–22` — §9 import ordering warning: `@/features/captions/hooks/useTranscriptionStatus` and `@/features/captions/hooks/useAddCaptionsToTimeline` (group 4) appear after relative import `./TranscribeButton` (group 5) at line 5 due to vi.mock hoisting constraint; warning only per Vitest gray area ruling
re-reviewed by code-reviewer (2026-04-07, JSDoc fix verification) - COMMENTED
> ✅ `TranscribeButton.fixtures.ts` — all 7 exported symbols (TEST_SEGMENTS + makeIdleStatus/makeReadyStatus/makeErrorStatus/makeFetchingStatus/makePendingStatus/makeProcessingStatus/makeAddCaptionsHook) now have per-function JSDoc; §9 JSDoc violation resolved
> ✅ `TranscribeButton.inprogress.test.tsx` — added by QA engineer; 110 lines, correctly placed, imports makePendingStatus/makeProcessingStatus from fixtures; no violations
> ❌ `useAddCaptionsToTimeline.test.ts:22` — §9 import ordering: `import type { ProjectDoc, Track, Clip } from '@ai-video-editor/project-schema'` (group 3) placed after `import * as projectStore from '@/store/project-store'` (group 4) at line 21; type-only import has no vi.mock hoisting constraint and must be moved to group 3 position before group 4 imports
> ❌ `TranscribeButton.tsx:8` — §9 JSDoc: exported `interface TranscribeButtonProps` has no JSDoc block; per §9 all exported functions and types require JSDoc
> ⚠️ `TranscribeButton.test.tsx:21–23` — §9 import ordering warning: group-4 @/ imports after relative ./TranscribeButton (group 5) due to vi.mock hoisting; warning only per Vitest gray area ruling
> ⚠️ `TranscribeButton.multitrack.test.tsx:21–22` — §9 import ordering warning: same vi.mock hoisting constraint; warning only
> ⚠️ `TranscribeButton.inprogress.test.tsx:21–22` — §9 import ordering warning: same vi.mock hoisting constraint; warning only
re-reviewed by code-reviewer (2026-04-07, final fix verification) - OK
> ✅ `useAddCaptionsToTimeline.test.ts:21` — group-3 `@ai-video-editor/project-schema` type import now precedes group-4 `@/store/project-store` import; §9 import ordering violation resolved
> ✅ `TranscribeButton.tsx:8–11` — `TranscribeButtonProps` interface now has JSDoc block with component description and `assetId` prop documentation; §9 JSDoc violation resolved
> ⚠️ Remaining vi.mock hoisting warnings in `TranscribeButton.test.tsx`, `TranscribeButton.multitrack.test.tsx`, `TranscribeButton.inprogress.test.tsx` — unchanged, accepted per Vitest constraint ruling

---

## 2026-04-07

### Task: Make timeline track height smaller
**Subtask:** Make the timeline track height a little smaller so that more tracks can be visible without scrolling

**What was done:**
- Modified `apps/web-editor/src/features/timeline/components/trackHeaderStyles.ts` — moved `TRACK_ROW_HEIGHT` constant definition here (was previously in `TrackHeader.tsx`); changed value from 48 → 36; used the constant for `styles.header.height` so there is a single source of truth (no circular dep: TrackHeader imports from this file, not vice versa)
- Modified `apps/web-editor/src/features/timeline/components/TrackHeader.tsx` — removed local `export const TRACK_ROW_HEIGHT = 48`; imports `TRACK_ROW_HEIGHT` from `./trackHeaderStyles` and re-exports it so all existing consumers (`ClipLane`, `TrackList`, `ClipLaneGhosts`) continue working unchanged
- Modified `apps/web-editor/src/features/timeline/hooks/useClipDrag.fixtures.ts` — updated local `TRACK_ROW_HEIGHT = 48` → `TRACK_ROW_HEIGHT = 36` to keep test fixtures in sync
- Modified `apps/web-editor/src/features/timeline/components/ClipBlock.test.tsx` — updated `laneHeight: 48` → `laneHeight: 36` in test props
- Modified `apps/web-editor/src/features/timeline/hooks/useClipTrim.test.ts` — updated mock bounding rect `bottom: 48, height: 48` → `bottom: 36, height: 36` to reflect new clip block height

**Notes:**
- Track rows go from 48px → 36px. With `TRACK_LIST_HEIGHT = 160px`, users now see 4 full rows (was 3) before scrolling.
- `TRACK_ROW_HEIGHT` is now the authoritative constant in `trackHeaderStyles.ts` and consumed via CSS `height: TRACK_ROW_HEIGHT` — no more hardcoded 48 in the styles file.
- All 1248 tests pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Make the timeline track height a little smaller</summary>

9. Make the timeline track height a little smaller so that more tracks can be visible without scrolling.

</details>

checked by code-reviewer - COMMENTED
> ❌ `useClipDrag.fixtures.ts:21` — §9 JSDoc: exported constant `TRACK_ROW_HEIGHT` has no JSDoc block; per §9 and the fixture-JSDoc ruling all exported symbols in `.fixtures.ts` files require per-symbol JSDoc
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer figma-fix (2026-04-07):
- FIXED: Track lane container nodes in Figma (13:71 VIDEO, 13:80 AUDIO, 13:89 CAPTION, 13:98 OVERLAY) still show h=48px; approved change reduces lane container to 36px. TRACK LABELS column (13:69) h=196px should become 144px (4×36). Lane y-positions should shift: AUDIO 85→73, CAPTION 134→110, OVERLAY 183→147. Clip block top inset (y=6) should become y=0 (clips fill the 36px lane). Playhead height inside each lane 48→36. Lane label text y=18→12.
- ACTION: Manual Figma update required — MCP does not expose node geometry write tools. Designer should update nodes 13:71, 13:80, 13:89, 13:98 heights to 36px and reposition accordingly.
- SOURCE: User-approved task (explicit request to reduce TRACK_ROW_HEIGHT 48→36); 36px is 4px-grid-aligned.
design-reviewer notes: Reviewed on 2026-04-07. Code implementation is correct and matches the approved change. TRACK_ROW_HEIGHT=36 is used as a single source of truth in trackHeaderStyles.ts; all consumers (TrackList itemSize, ClipLane laneHeight, ClipLaneGhosts laneHeight, styles.header.height) updated consistently. Value is 4px-grid-aligned. Design guide does not specify an exact track row height — only that the timeline area is 232px bottom. No color, typography, or spacing token violations introduced. Figma frames still show 48px lane containers and require a manual geometry update (see figma-fix note above).
checked by playwright-reviewer: YES

---

## 2026-04-07

### Task: "Add to Timeline" dropdown with track selection
**Subtask:** The Add to Timeline button should show two options: "To Existing Video Track" and "To New Video Track"

**What was done:**
- Rewrote `apps/web-editor/src/features/asset-manager/hooks/useAddAssetToTimeline.ts` — new API returns `{ addAssetToNewTrack, addAssetToExistingTrack }`. `addAssetToNewTrack` always creates a fresh track; `addAssetToExistingTrack` appends to the given trackId. Extracted `computeStartFrame` helper.
- Created `apps/web-editor/src/features/asset-manager/hooks/useTracksForAsset.ts` — uses `useSyncExternalStore(subscribe, getSnapshot)` to reactively return tracks filtered by asset content-type (video/* + image/* → video tracks; audio/* → audio tracks).
- Created `apps/web-editor/src/features/asset-manager/components/addToTimelineDropdown.styles.ts` — all design-guide-compliant styles extracted to a separate file.
- Created `apps/web-editor/src/features/asset-manager/components/AddToTimelineDropdown.tsx` — dropdown component with "To New [type] Track" + existing tracks section; outside-click closes via `useEffect`/`mousedown`.
- Modified `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — replaced the single "Add to Timeline" button with `<AddToTimelineDropdown>`.
- Rewrote `apps/web-editor/src/features/asset-manager/hooks/useAddAssetToTimeline.test.ts` — two describe blocks covering `addAssetToNewTrack` (7 tests) and `addAssetToExistingTrack` (6 tests) with the new API.
- Updated `apps/web-editor/src/features/asset-manager/hooks/useAddAssetToTimeline.placement.test.ts` — migrated all 8 tests to `addAssetToNewTrack`; updated the "same asset multiple times" test to reflect that new tracks are always created.
- Created `apps/web-editor/src/features/asset-manager/hooks/useTracksForAsset.test.ts` — 7 unit tests for the new hook (empty project, video/image/audio filtering, multiple tracks, unsupported types, caption tracks excluded).
- Created `apps/web-editor/src/features/asset-manager/components/AddToTimelineDropdown.test.tsx` — 18 component tests covering trigger state, dropdown open/close, aria-expanded, item labels, existing-tracks section, and action callbacks.
- Updated `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.test.tsx` — replaced `useAddAssetToTimeline` mock with `AddToTimelineDropdown` stub; updated "Add to Timeline" describe block to verify props passed to the dropdown (disabled state, projectId, assetId).

**Notes:**
- The hook split (addAssetToNewTrack / addAssetToExistingTrack) removes the old "find track by name" logic entirely. Track reuse is now always explicit via track ID.
- `useTracksForAsset` subscribes to the project store so the dropdown's existing-tracks list stays live without manual refresh.
- All 1276 tests pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Add to Timeline dropdown</summary>

10. The `Add to Timeline` button should show two options:
11. **To Existing Video Track** — add the video to the end of an existing video track.
12. **To New Video Track** — create a new video track.

</details>

checked by code-reviewer - COMMENTED
> ❌ §9 naming violation in `apps/web-editor/src/features/asset-manager/components/addToTimelineDropdown.styles.ts`: `.styles.ts` suffix is not a recognized §9 file-naming pattern; must be renamed to `addToTimelineDropdownStyles.ts`
> ❌ §5 violation in `apps/web-editor/src/features/asset-manager/components/AddToTimelineDropdown.tsx` line 30: `trackTypeLabel` is a pure data-transformation function (MIME → label) and must not live in a `.tsx` component file; move to `utils.ts` in the feature folder
> ⚠️ `apps/web-editor/src/features/asset-manager/hooks/useTracksForAsset.ts` lines 1–2: two separate `import { ... } from 'react'` statements should be merged into one; minor style issue
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer figma-fix (2026-04-07):
- FIXED: Figma node 15:67 (ASSET DETAIL PANEL) has no "Add to Timeline" button — the panel jumps from STATUS READY (top ~296px) directly to REPLACE FILE (508px), leaving ~212px of unspecified space. The dropdown component is a valid evolution of the previously implied single button.
- ACTION: Manual Figma update required — MCP does not expose node geometry write tools. Designer should add an "ADD TO TIMELINE" button region (h=36px, bg=#7C3AED, radius-md, w=248px) at approximately y=444px in node 15:67, above the REPLACE FILE button. Add a label "Add to Timeline ▾".
- SOURCE: Design guide primary token (#7C3AED) + radius-md (8px) + body typography (14px/500). Implementation correctly uses all established tokens.
design-reviewer notes: Reviewed on 2026-04-07. All color, typography, spacing, and component tokens verified against design-guide.md. PRIMARY (#7C3AED), PRIMARY_DARK (#5B21B6), PRIMARY_LIGHT (#4C1D95), SURFACE_ELEVATED (#1E1E2E), BORDER (#252535), TEXT_PRIMARY (#F0F0FA), TEXT_SECONDARY (#8A8AA0) all match design guide. Typography: trigger button 14px/500 and item rows 14px/400/lh:20px match body scale. Section label 11px/500 uppercase matches caption+label pattern. All spacing values (36px height, 8px/12px padding, 4px grid throughout) are compliant. Dropdown panel uses radius-md (8px), surface-elevated background, and border token — consistent with the panel/modal pattern. Figma frame 15:67 does not yet include the Add to Timeline button — manual Figma update required (see figma-fix note above).
checked by playwright-reviewer: YES — re-verified 2026-04-07 after commit 3bd8477 (useAddAssetToTimeline rewrite). Trigger button "Add to Timeline ▾" (aria-haspopup=listbox) renders in AssetDetailPanel, enabled for ready video asset, aria-expanded=false at rest. Click opens listbox with "To New Video Track" option; "Existing Video Tracks" section absent when 0 tracks exist. Clicking "To New Video Track" creates track+clip via POST /clips, dropdown closes, track row appears in timeline (1 track). Reopening dropdown shows "EXISTING VIDEO TRACKS" label and "To Existing: test_video" option. Clicking "To Existing:" appends clip to same track (count stays 1), dropdown closes. Outside mousedown (outside wrapperRef) closes dropdown without selection. 0 JS errors. All 6 test scenarios pass.

checked by code-reviewer - re-review (2026-04-07): all 4 flagged issues resolved — APPROVED
> ✅ §9 fix confirmed: `addToTimelineDropdown.styles.ts` renamed to `addToTimelineDropdownStyles.ts`
> ✅ §5 fix confirmed: `trackTypeLabel` moved to `utils.ts` (line 89); `AddToTimelineDropdown.tsx` imports via `@/features/asset-manager/utils`
> ✅ duplicate React imports merged into single `import { useMemo, useSyncExternalStore } from 'react'` in `useTracksForAsset.ts`
> ✅ JSDoc added to `AddToTimelineDropdownProps` interface with per-field documentation

---

## 2026-04-07

### Task: Resizable video preview block
**Subtask:** In the desktop version, the video preview block should be resizable in height so that more tracks can be visible

**What was done:**
- Created `apps/web-editor/src/features/timeline/hooks/useTimelineResize.ts` — hook that manages `timelineHeight` state (default `TIMELINE_PANEL_HEIGHT=232`), uses pointer capture on the drag handle for stable dragging; clamps between `MIN_TIMELINE_HEIGHT=80` and `MAX_TIMELINE_HEIGHT=600`
- Created `apps/web-editor/src/features/timeline/components/TimelineResizeHandle.tsx` — 4px horizontal separator with `cursor: ns-resize`; becomes slightly lighter on active drag; has `role="separator"` + `aria-orientation="horizontal"` + `aria-label` for accessibility
- Modified `apps/web-editor/src/features/timeline/components/TimelinePanel.tsx` — added optional `height` prop (defaults to `TIMELINE_PANEL_HEIGHT`); computes `trackListHeight` dynamically so `TrackList` receives the correct height; renders panel div with `{ ...styles.panel, height }` override
- Modified `apps/web-editor/src/App.tsx` — desktop layout only: uses `useTimelineResize`, renders `<TimelineResizeHandle>` between `editorRow` and `<TimelinePanel>`, passes `height={timelineHeight}` to `TimelinePanel`
- Updated `apps/web-editor/src/App.test.tsx` — updated shell children count assertion from 3 → 4 to account for the new resize handle element
- Created `apps/web-editor/src/features/timeline/hooks/useTimelineResize.test.ts` — 8 unit tests: initial height, drag up/down, min/max clamp, no-op without pointerdown, stop-after-pointerup
- Created `apps/web-editor/src/features/timeline/components/TimelineResizeHandle.test.tsx` — 6 component tests: aria attributes, event handler callbacks, cursor style, height

**Notes:**
- Mobile layout is untouched — resize is desktop-only as specified.
- `trackListHeight` was previously a module-level constant (`TRACK_LIST_HEIGHT`); it is now computed inline from the dynamic height in `TimelinePanel`. The constant is no longer used internally but remains exported for any external consumers (e.g. tests).
- All 1290 tests pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Resizable video preview block height</summary>

13. In the desktop version, the video preview block should be resizable in height so that more tracks can be visible.

</details>

checked by code-reviewer - COMMENTED
> ❌ §9 cross-directory relative import in `apps/web-editor/src/features/timeline/hooks/useTimelineResize.ts:4`: `import { TIMELINE_PANEL_HEIGHT } from '../components/timelinePanelStyles'` crosses directory boundary; must use `@/features/timeline/components/timelinePanelStyles`
> ❌ §9 cross-directory relative import in `apps/web-editor/src/features/timeline/hooks/useTimelineResize.test.ts:5`: same `../components/timelinePanelStyles` pattern; must use `@/features/timeline/components/timelinePanelStyles`
> ❌ §9 import ordering in `apps/web-editor/src/App.tsx:17-18`: `@/features/timeline/components/TimelineResizeHandle` and `@/features/timeline/hooks/useTimelineResize` are separated from the rest of group-4 (`@/`) imports by a blank line, splitting a single group into two; all `@/` imports must be in one contiguous group
> ⚠️ §9 unnamed return type in `apps/web-editor/src/features/timeline/hooks/useTimelineResize.ts:22-27`: hook return shape is an inline anonymous type; §9 requires the `type` keyword for domain types — extract to a named `type UseTimelineResizeResult = { ... }` and reference it as the return type
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Re-reviewed on 2026-04-07. Fix confirmed: HANDLE_ACTIVE changed from #3A3A4F to #1E1E2E (surface-elevated token, #1E1E2E). Both color constants in TimelineResizeHandle.tsx now map to approved design-guide.md tokens — BORDER (#252535, resting state) and HANDLE_ACTIVE (#1E1E2E surface-elevated, active/drag state). Handle height 4px is 4px-grid-aligned. No remaining design violations.
design-reviewer figma-fix (2026-04-07):
- FIXED: The Figma Main Editor Desktop frame (node 13:2) has no representation of the resize handle between the editor row and the timeline. The design shows a fixed static layout; the new drag-to-resize interaction is not reflected.
- ACTION: Cannot apply Figma fix automatically — no write tools are available in the current Figma MCP configuration. A Figma frame update is needed to add the resize handle as a 4px horizontal separator between PREVIEW AREA and TIMELINE AREA using the `border` color token (#252535).
- SOURCE: design-guide.md §3 color tokens + §9 implementation note "All spacing uses the 4px grid"

design-reviewer comments (2026-04-07):
- [FILE: apps/web-editor/src/features/timeline/components/TimelineResizeHandle.tsx, LINE: ~4] ISSUE: `HANDLE_ACTIVE = '#3A3A4F'` is a hardcoded hex value with no corresponding design system token. EXPECTED: The active/dragging state should use an approved token — the closest defined token is `surface-elevated` (#1E1E2E) or `border` (#252535); a slightly lighter active state would warrant a new token defined in the design guide before it can be used. FIX: Replace `#3A3A4F` with `#1E1E2E` (surface-elevated, the next step up from the resting border color) or request a new `border-active` token to be added to the design guide.
checked by playwright-reviewer: YES — handle present at y=664 spanning full 1440px width, 4px height, cursor:ns-resize; drag up 100px increases timeline from 232→332px; drag down 200px decreases to 132px; min clamp confirmed at 80px; max clamp confirmed at 600px; no resize handle on mobile viewport (390px), mobile layout unchanged. 10/10 checks pass.
checked by code-reviewer - re-review (2026-04-07): all 4 flagged issues resolved — APPROVED

---

## 2026-04-07

### Task: FPS and resolution controls
**Subtask:** Add FPS presets (task 14) and resolution presets (task 15) via a Project Settings modal

**What was done:**
- Created `apps/web-editor/src/features/project-settings/components/projectSettingsModalStyles.ts` — design-guide-compliant styles for backdrop, panel, header, preset buttons (active/inactive), section labels
- Created `apps/web-editor/src/features/project-settings/components/ProjectSettingsModal.tsx` — modal with two sections: FPS presets (24/25/30/50/60 fps) and resolution presets (1080p, 720p, 1440p, 4K, Vertical for Shorts/TikTok, Square for Instagram); each preset calls `setProject` immediately; active preset shown with `PRIMARY_LIGHT` highlight; backdrop click closes; `role="dialog"` + `aria-modal`
- Modified `apps/web-editor/src/topBar.styles.ts` — added `settingsButton` and `settingsButtonActive` styles
- Modified `apps/web-editor/src/TopBar.tsx` — added `isSettingsOpen` and `onToggleSettings` props; added "Settings" button before "History"
- Modified `apps/web-editor/src/App.tsx` — added `isSettingsOpen` state, `handleToggleSettings`/`handleCloseSettings`; passed new props to both mobile and desktop TopBar; renders `<ProjectSettingsModal>` in both mobile and desktop layouts
- Modified `apps/web-editor/src/TopBar.test.tsx` — added `isSettingsOpen`/`onToggleSettings` to `defaultProps`; added 4 Settings button tests
- Created `apps/web-editor/src/features/project-settings/components/ProjectSettingsModal.test.tsx` — 14 tests: dialog structure, FPS preset selection/highlighting, resolution preset selection/highlighting, platform labels

**Notes:**
- Changes apply immediately via `setProject` — the existing auto-save mechanism picks them up without a separate "Save" button.
- Both tasks 14 and 15 are implemented together in the same modal.
- All 1312 tests pass.

**Completed subtask from active_task.md:**
<details>
<summary>Subtasks: FPS and resolution controls</summary>

14. Add the ability to control the frames-per-second configuration, allowing only the most popular presets.
15. Add the ability to control resolution, allowing popular formats for YouTube videos, YouTube Shorts, Instagram, TikTok, and similar platforms.

</details>

checked by code-reviewer - COMMENTED
> ❌ Duplicate import from same module in `apps/web-editor/src/features/project-settings/components/ProjectSettingsModal.tsx` lines 3–4: `getSnapshot`/`setProject` and `useProjectStore` are both imported from `@/store/project-store` in separate statements. §9 requires one import statement per module; merge into a single statement.
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. All four previously commented issues confirmed fixed: `panelStyle.background` now uses `SURFACE_ELEVATED` (#1E1E2E), `panelStyle.borderRadius` is `16` (radius-lg), `bodyStyle.gap` is `24` (space-6), `presetButtonStyle.fontSize` is `14` (body token). Unused `SURFACE_ALT` constant removed. No remaining token violations. Code matches design guide.
design-reviewer figma-fix (2026-04-07):
- FIXED: The Figma Top Bar (node 13:3) has no "Settings" button — the frame only shows PROJECT TITLE, UNDO/REDO, SPACER, VERSION HISTORY, SHARE BUTTON, EXPORT BUTTON. No Project Settings modal frame exists anywhere in the Figma file.
- ACTION: Cannot apply Figma fix automatically — MCP does not expose write tools in the current configuration. A Figma update is needed to: (1) add a "Settings" button to the TOP BAR (node 13:3) between UNDO/REDO and VERSION HISTORY, styled to match the existing History/Renders pattern (transparent bg, BORDER border, radius=6px, 12px/500 TEXT_SECONDARY label); (2) create a new "Project Settings Modal/Desktop" frame (480×auto, surface-elevated bg #1E1E2E, radius-lg 16px) in the Editor Core page (1:5) showing two sections: FRAME RATE preset grid and RESOLUTION preset grid.
- SOURCE: design-guide.md §3 color tokens, §3 border-radius tokens, Export Modal pattern (node 16:73) for modal background + radius.
design-reviewer comments (2026-04-07):
- [FILE: apps/web-editor/src/features/project-settings/components/projectSettingsModalStyles.ts, LINE: ~24] ISSUE: `panelStyle.background` uses `SURFACE_ALT` (#16161F). EXPECTED: Modal panels use `surface-elevated` (#1E1E2E) — the Export Modal (Figma node 16:73) uses `#1E1E2E` as its panel container background, and design-guide.md §3 specifies `surface-elevated` for "Cards, modals, inspector panels". FIX: Change `background: SURFACE_ALT` to `background: SURFACE_ELEVATED` in `panelStyle`.
- [FILE: apps/web-editor/src/features/project-settings/components/projectSettingsModalStyles.ts, LINE: ~31] ISSUE: `panelStyle.borderRadius` is `12`. EXPECTED: The design guide defines only `radius-md = 8px` and `radius-lg = 16px` — 12px is not a token value. The Export Modal uses `radius-lg` (16px). FIX: Change `borderRadius: 12` to `borderRadius: 16` (radius-lg token) to match the modal pattern.
- [FILE: apps/web-editor/src/features/project-settings/components/projectSettingsModalStyles.ts, LINE: ~69] ISSUE: `bodyStyle.gap` is `20`. EXPECTED: The spacing system uses a 4px base unit with named tokens: space-4=16px and space-6=24px. 20px is not a defined token. FIX: Change `gap: 20` to `gap: 24` (space-6) or `gap: 16` (space-4) — space-6 is preferred given the two-section layout needs visual breathing room.
- [FILE: apps/web-editor/src/features/project-settings/components/projectSettingsModalStyles.ts, LINE: ~102] ISSUE: `presetButtonStyle.fontSize` is `13`. EXPECTED: The typography scale defines `body = 14px` and `body-sm = 12px`; 13px is not a token value. FIX: Change `fontSize: 13` to `fontSize: 14` (body token) for preset button labels.
checked by playwright-reviewer: YES — Settings button present in TopBar (aria-label="Toggle project settings", aria-pressed=false at rest, highlighted purple when open). Clicking opens ProjectSettingsModal (role="dialog", aria-modal=true, aria-labelledby=project-settings-title). Modal shows "Project Settings" title and X close button. FRAME RATE section: 5 presets (24/25/30/50/60 fps), active preset highlighted with PRIMARY_LIGHT (30 fps active by default, aria-pressed=true). Clicking 24 fps: aria-pressed flips to true, save status changes to "Unsaved changes" confirming setProject fired immediately. Clicking 60 fps: highlighted correctly. RESOLUTION section: 6 presets (1080p/720p/1440p/4K/Vertical/Square) with platform subtitles (YouTube 16:9, Shorts TikTok 9:16, Instagram 1:1); 1080p active by default; Vertical preset selection confirmed. Backdrop click closes modal (dialog count 0 after). Close button (aria-label="Close project settings") closes modal. Settings button aria-pressed=false after close. 0 JS errors. Preview player correctly adjusts aspect ratio when Vertical preset selected (portrait layout visible in screenshot). All checks pass.
checked by code-reviewer - re-review (2026-04-07): duplicate import resolved — APPROVED

---

## [2026-04-07]

### Task: Fix export ENOENT error
**Subtask:** Fix `ENOENT: no such file or directory, open '/app/apps/packages/remotion-comps/dist/index.js'`

**What was done:**
- Fixed `apps/render-worker/src/lib/remotion-renderer.ts`: changed `REMOTION_ENTRY_POINT` path from `../../../packages/remotion-comps/dist/index.js` to `../../../../packages/remotion-comps/dist/index.js`
- Root cause: at runtime `__dirname = /app/apps/render-worker/dist/lib`; three `../` steps only reached `/app/apps`, placing packages under the wrong subtree. Adding a fourth `../` correctly reaches the monorepo root `/app`.
- Added regression test: verifies `bundle()` is called with an entry point ending in `packages/remotion-comps/dist/index.js`

**Files created or modified:**
- `apps/render-worker/src/lib/remotion-renderer.ts` — corrected `REMOTION_ENTRY_POINT` path (line 21)
- `apps/render-worker/src/lib/remotion-renderer.test.ts` — added path regression test

**Notes:**
- Docker `WORKDIR=/app`; render-worker CMD is `node apps/render-worker/dist/index.js`; packages live at `/app/packages/`, not `/app/apps/packages/`

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix export ENOENT error</summary>

16. Export video show error: ENOENT: no such file or directory, open '/app/apps/packages/remotion-comps/dist/index.js'

</details>

checked by code-reviewer - COMMENTED
> ❌ `remotion-renderer.ts:7-8` — §9 import ordering/style: two separate `import type` statements from the same module `@ai-video-editor/project-schema`; §9 requires one import statement per module — merge into `import type { RenderPreset, ProjectDoc } from '@ai-video-editor/project-schema'`
> ❌ `remotion-renderer.test.ts:48` — §9 import ordering: `import type { RenderPreset, ProjectDoc } from '@ai-video-editor/project-schema'` (group 3) placed after `import { renderComposition } from './remotion-renderer.js'` (group 5) at line 47; type-only imports have no vi.mock hoisting constraint and must appear before relative imports
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. No UI changes in this subtask. Both modified files (`apps/render-worker/src/lib/remotion-renderer.ts` and `apps/render-worker/src/lib/remotion-renderer.test.ts`) are backend TypeScript — a path string correction and a regression test. No components, styles, colors, typography, spacing, or layout were touched. Design review not applicable; auto-approved.
checked by playwright-reviewer: YES
re-reviewed by code-reviewer (2026-04-07, fix verification) - OK

---

## [2026-04-07]

### Task: Fix renders queue — download link missing for completed renders
**Subtask:** Renders in Progress modal shows jobs but no download link for completed renders

**What was done:**
- Fixed `apps/api/src/services/render.service.ts`: `listProjectRenders` now generates presigned S3 download URLs for complete jobs (same logic as `getRenderStatus`). Added `RenderJobSummaryWithUrl` type.
- Fixed `apps/api/src/controllers/renders.controller.ts`: `listProjectRenders` handler now spreads `downloadUrl` into each job response when present.
- Fixed `packages/remotion-comps/src/remotion-entry.tsx` (created): Remotion bundle entry point that calls `registerRoot()`. Registers `VideoComposition` under id `"VideoComposition"` with `calculateMetadata` reading `fps`/`width`/`height`/`durationFrames` from `ProjectDoc` inputProps. Required because `bundle()` requires a file with `registerRoot()` — `index.ts` is a library barrel and cannot fill that role.
- Updated `apps/render-worker/src/lib/remotion-renderer.ts`: `REMOTION_ENTRY_POINT` now points at `dist/remotion-entry.js` instead of `dist/index.js`.
- Added 4 tests to `apps/api/src/services/render.service.test.ts` covering `listProjectRenders`: empty list, non-complete jobs (no URL), complete job gets URL, mixed statuses only generate URL for complete jobs.

**Files created or modified:**
- `packages/remotion-comps/src/remotion-entry.tsx` — created: Remotion bundle entry with `registerRoot()`
- `apps/render-worker/src/lib/remotion-renderer.ts` — updated `REMOTION_ENTRY_POINT` filename
- `apps/render-worker/src/lib/remotion-renderer.test.ts` — updated path assertion
- `apps/api/src/services/render.service.ts` — `listProjectRenders` now returns presigned URLs for complete jobs
- `apps/api/src/controllers/renders.controller.ts` — spreads `downloadUrl` into list response
- `apps/api/src/services/render.service.test.ts` — 4 new tests for `listProjectRenders`

**Notes:**
- `getRenderStatus` (single job) already generated presigned URLs; the list endpoint was simply missing the same step.
- `remotion-entry.tsx` uses `defaultProps` with a minimal valid `ProjectDoc` shape (required by Remotion's `<Composition>` type) — actual values are overridden by `calculateMetadata` at render time.

checked by code-reviewer - COMMENTED
> ❌ `apps/api/src/services/render.service.test.ts` — §9 file length: 315 lines, exceeds the 300-line hard limit; the `listProjectRenders` describe block (lines 248–314) must be split to `render.service.list.test.ts`
> ❌ `apps/api/src/services/render.service.fixtures.ts` — §9 JSDoc: exported constants `mockVersion` and `mockJob` have no per-symbol JSDoc; per §9 and fixture-JSDoc ruling all exported symbols in `.fixtures.ts` files require JSDoc
> ⚠️ `apps/render-worker/src/lib/remotion-renderer.test.ts:178` — test description says "dist/index.js" but the assertion checks for "remotion-entry.js"; misleading test name (dead description text)
re-reviewed by code-reviewer (2026-04-07, fix verification) - OK
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. No UI changes in this subtask. All modified files are backend TypeScript (service, controller, Remotion entry point, renderer path update, tests). The frontend `RendersQueueModal.tsx` was not touched — the Download link was already in the UI and simply lacked a URL to render. No components, styles, colors, typography, spacing, or layout were changed. Design review not applicable; auto-approved.
checked by playwright-reviewer: YES

## [2026-04-07]

### Task: Fix render black screen issue
**Subtask:** Render always produces black screen with correct length but no visible elements

**What was done:**
- Root cause: `remotion-entry.tsx` hardcoded `assetUrls={}` when passing props to `VideoComposition`, so all media clips (video/audio/image) had empty `src` and returned `null`
- Fixed `packages/remotion-comps/src/remotion-entry.tsx` — `VideoRoot` now extracts `assetUrls` from Remotion inputProps instead of hardcoding empty map
- Updated `apps/render-worker/src/lib/remotion-renderer.ts` — `renderComposition` now accepts `assetUrls` and merges it into inputProps passed to Remotion
- Updated `apps/render-worker/src/jobs/render.job.ts` — added `resolveAssetUrls()` that queries `project_assets_current` for clip asset storage URIs and generates presigned S3 URLs via `@aws-sdk/s3-request-presigner`
- Added `@aws-sdk/s3-request-presigner` dependency to render-worker
- Updated existing tests in `remotion-renderer.test.ts` and `render.job.test.ts` to include `assetUrls`
- Added 3 new tests: presigned URL generation, empty clips edge case, assetId deduplication

**Notes:**
- Browser preview already worked because `PreviewPanel` resolves asset URLs via `useRemotionPlayer` hook + API stream endpoints
- The SSR render path was missing this resolution step — assets were never passed to the composition
- Presigned URLs have 1-hour expiry, sufficient for render jobs

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: Fix render black screen</summary>

1. Issue, render alway do render black screen, with correct length but black screen, no elements on it.

</details>

checked by code-reviewer - COMMENTED
> ❌ `apps/render-worker/src/jobs/render.job.test.ts` — §9 file length: 330 lines, exceeds the 300-line hard limit; must be split (e.g. `render.job.test.ts` for core paths, `render.job.assets.test.ts` for the 3 new presigned URL / deduplication / empty-clips tests), with shared fixtures extracted to `render.job.fixtures.ts`
> ❌ `apps/render-worker/src/lib/remotion-renderer.test.ts:160-166` and `:174-181` — TypeScript strict violation (§2): two `renderComposition(...)` calls omit the required `assetUrls` field from `RenderCompositionOptions`; `assetUrls` is non-optional but these call sites pass no value, which would fail `tsc --strict`
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-07. No UI changes in this subtask. All three modified files are backend TypeScript — `packages/remotion-comps/src/remotion-entry.tsx` (prop extraction for assetUrls from inputProps), `apps/render-worker/src/lib/remotion-renderer.ts` (assetUrls parameter added to renderComposition), and `apps/render-worker/src/jobs/render.job.ts` (resolveAssetUrls asset URL resolution logic). No components, styles, colors, typography, spacing, or layout were touched. Design review not applicable; auto-approved.
checked by playwright-reviewer: YES - no UI changes; fix is entirely in the server-side Remotion render pipeline (render-worker SSR path). No browser-testable surface exists. Browser preview was unaffected before and after the fix. Auto-approved.

## [2026-04-07]

### Task: Fix render black screen — code review fixes
**Subtask:** Address code-quality-expert review comments from render black screen fix

**What was done:**
- Extracted shared test fixtures (`makeJob`, `makeDeps`, `setupSuccessMocks`, etc.) to `apps/render-worker/src/jobs/render.job.fixtures.ts` (87 lines) — eliminates verbatim duplication between test files per §9
- Refactored `apps/render-worker/src/jobs/render.job.test.ts` (330→182 lines, under 300-line limit) to import from fixtures
- Refactored `apps/render-worker/src/jobs/render.job.assets.test.ts` (119 lines) to import from fixtures
- Fixed TypeScript strict violation: added missing `assetUrls: {}` to two `renderComposition()` call sites in `apps/render-worker/src/lib/remotion-renderer.test.ts`

**Notes:**
- `vi.hoisted()` and `vi.mock()` calls remain in each test file (Vitest hoisting requirement)
- All 20 render-worker tests pass

checked by code-reviewer - YES (false positive on docJson JSDoc — line 15 already has `/** Default doc fixture with one video clip referencing asset-aaa. */`)
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

## [2026-04-07]

### Task: Fix render-worker Docker dev workflow
**Subtask:** Add volume mounts and tsx watch for render-worker in docker-compose

**What was done:**
- Added volume mounts to `render-worker` service in `docker-compose.yml`: source code (`apps/render-worker/src`), `packages/project-schema`, and `packages/remotion-comps`
- Added `command: npx tsx watch` override matching the pattern used by api and media-worker services
- Rebuilt `packages/remotion-comps/dist/` — the `remotion-entry.js` file was missing from dist, preventing Remotion's `bundle()` from working with the latest code

**Notes:**
- Previously the render-worker had no volume mounts and no tsx watch, unlike all other services — code changes required a full `docker compose build render-worker` to take effect
- Remotion's `bundle()` still needs compiled `remotion-comps/dist/`, so changes to composition code require `npm run build --workspace=packages/remotion-comps`

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES

## [2026-04-07]

### Task: Fix Export button not activating after autosave
**Subtask:** Export button only became active after pressing Renders button (or any other button that triggers re-render)

**What was done:**
- Root cause: `getCurrentVersionId()` in `App.tsx` was a plain function call, not a React subscription. After autosave set the version ID, the App component did not re-render — the Export button stayed disabled until an unrelated state change triggered a re-render.
- Added `notifyListeners()` call to `setCurrentVersionId()` in `apps/web-editor/src/store/project-store.ts` so subscribers are notified when the version ID changes
- Added `useCurrentVersionId()` hook using `useSyncExternalStore` for reactive subscription
- Updated `apps/web-editor/src/App.tsx` to use `useCurrentVersionId()` instead of `getCurrentVersionId()`
- Updated test mocks in 5 test files (`App.test.tsx`, `App.mobile.test.tsx`, `App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`, `App.reorder.test.tsx`) to include `useCurrentVersionId`
- Added test: `setCurrentVersionId` notifies listeners (in `project-store.test.ts`)

**Files created/modified:**
- `apps/web-editor/src/store/project-store.ts` — added `notifyListeners()` to `setCurrentVersionId`, added `useCurrentVersionId` hook
- `apps/web-editor/src/App.tsx` — import and use `useCurrentVersionId` instead of `getCurrentVersionId`
- `apps/web-editor/src/store/project-store.test.ts` — added listener notification test
- `apps/web-editor/src/App.test.tsx` — updated mock + 4 test cases
- `apps/web-editor/src/App.mobile.test.tsx` — updated mock + 2 test cases
- `apps/web-editor/src/App.PreviewSection.test.tsx` — updated mock
- `apps/web-editor/src/App.RightSidebar.test.tsx` — updated mock
- `apps/web-editor/src/App.reorder.test.tsx` — updated mock

**Notes:**
- `getCurrentVersionId()` is still exported and used by non-React code (e.g. `useAutosave`, `VersionHistoryPanel`) — no breaking changes
- `useSyncExternalStore` bails out when snapshot hasn't changed, so the extra `notifyListeners()` call does not cause unnecessary re-renders for `useProjectStore` subscribers

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES
