# Development Log (compacted — 2026-03-29 to 2026-04-29)

## Monorepo + DB Migrations
- added: root config, apps/packages scaffold; migrations 001–036 (projects, assets, captions, versions, render_jobs, clips, users/auth, ai_generation_jobs, files/pivots, soft-delete, thumbnails, storyboard tables, scene_templates/media)
- fixed: APP_ env prefix; Zod startup validation; workspace→file paths; in-process migration runner + sha256

## Infrastructure
- added: Redis healthcheck, BullMQ error handlers, graceful shutdown, S3 stream + Range endpoint, `@/` alias + tsc-alias

## Asset Upload + Browser UI
- added: S3 ingest pipeline (FFprobe→thumbnail→waveform); CRUD endpoints; presign + stream
- added: `features/asset-manager/` — AssetCard, AssetDetailPanel, UploadDropzone, UploadProgressList, AssetBrowserPanel
- added: asset rename, soft-delete/restore (30-day TTL, GoneError 410), `files` root table + pivots, paginated envelope + keyset cursor
- fixed: S3 CORS authoritative; `buildAuthenticatedUrl` on all media elements

## VideoComposition + Preview + Stores
- added: `VideoComposition.tsx`, `project-store.ts` (Immer patches), `ephemeral-store.ts`, `history-store.ts` (undo/redo)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `PlaybackControls.tsx`, `VolumeControl.tsx`, `usePrefetchAssets.ts`
- fixed: rAF tick; waitUntilDone(); playhead freezing

## Timeline Editor
- added: clip repo/service/routes (PATCH + POST); TimelineRuler, TrackHeader, ClipBlock, WaveformSvg, ClipLane, ClipContextMenu, TrackList, TimelinePanel, ScrollbarStrip
- added: useSnapping, useClipDrag, useClipTrim, useClipDeleteShortcut, useScrollbarThumbDrag, useTrackReorder, useTimelineWheel
- fixed: float→Math.round; split edge case; passive wheel; context menu portal; clip scroll sync; ruler seek

## Captions + Version History + Background Render
- added: `POST /assets/:id/transcribe` (202); transcribe job; `CaptionEditorPanel.tsx`, `CaptionLayer.tsx`, `useAddCaptionsToTimeline.ts`
- added: version CRUD + restore; `useAutosave.ts`; VersionHistoryPanel, RestoreModal, TopBar, SaveStatusBadge
- added: render CRUD (2-concurrent limit); `render.job.ts` (Remotion→S3); render-worker Docker; ExportModal, RendersQueueModal
- fixed: REMOTION_ENTRY_POINT; black screen (presigned URLs); download URLs

## Authentication
- added: session auth (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12); rate limiting; auth routes; password-reset + email-verify; OAuth (Google/GitHub); Bearer injection + 401 interceptor; `APP_DEV_AUTH_BYPASS`
- added FE: LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; AuthProvider, ProtectedRoute

## AI Platform + Video Generation Wizard
- added: `fal-models.ts` (9 models), `elevenlabs-models.ts`, unified AI_MODELS (13); `ai-generate-audio.handler.ts`; `GET /ai/models`, `GET /ai/voices`
- added FE: CapabilityTabs, ModelCard, AssetPickerField, SchemaFieldInput; 28 unit tests
- added: `generationDraft.*` (5 routes); generate-wizard features — PromptEditor, WizardStepper, MediaGalleryPanel, AssetPickerModal, EnhancePromptModal; enhance rate-limit 10/hr
- added: `features/home/` — HomePage, HomeSidebar, ProjectCard, StoryboardCard

## Backlog Batch (2026-04-20)
- added: `userProjectUiState.*`; GET/PUT /projects/:id/ui-state; `useProjectUiState.ts` (800ms debounce)
- added: soft-delete/restore for assets/projects/drafts; trash cursor + TrashPanel
- added: ffmpeg thumbnail → S3 in ingest job; `AssetDetailPanel` → `shared/asset-detail/`
- added: scope toggle (general/project/draft) in AssetBrowserPanel + MediaGallery; `getPanelStyle(compact)` factory

## Storyboard Editor — Parts A/B/C
- added: migrations 031–036; storyboard repo/service/controller/routes (5 endpoints); 5 OpenAPI paths + 8 schemas
- added: StartNode, EndNode, SceneBlockNode, CanvasToolbar, GhostDragPortal, StoryboardPage, ZoomToolbar
- added: `useStoryboardCanvas.ts`, `useAddBlock.ts`, `useStoryboardDrag.ts`, `useStoryboardKeyboard.ts`, `useStoryboardAutosave.ts` (30s→5s debounce)
- added: `storyboard-store.ts`, `storyboard-history-store.ts` (MAX=50, 1s debounce)
- added: SceneTemplate (6 routes, 73 tests); SceneModal (6-file split); LibraryPanel (4-file split); EffectsPanel; StoryboardAssetPanel
- added: `restoreFromSnapshot` in storyboard-store; `useStoryboardHistoryFetch.ts`; `StoryboardHistoryPanel.tsx` (restore via window.confirm); StoryboardTopBar extracted
- fixed: `pool.execute→pool.query` for LIMIT params; `nativeEvent.clientX` → raw DOM event; `positions?` optional in CanvasSnapshot

## Storyboard Bug Fixes (2026-04-24–25)
- fixed ST-FIX-1: Home button (`onNavigateHome` prop) in StoryboardPage.topBar
- fixed ST-FIX-2: `draggable: false→true` for START/END sentinels in blockToNode, restoreFromSnapshot, applySnapshot
- fixed ST-FIX-3: `useStoryboardAutosave` signature `(draftId, nodes, edges)`; removed store subscription
- fixed ST-FIX-4: block IDs → `crypto.randomUUID()`; `handleAddBlock` → `useHandleAddBlock.ts`
- fixed ST-FIX-5: `useHandleRestore.ts` re-wires onRemove + setNodes/setEdges/pushSnapshot/saveNow
- fixed SB-BUG-A: `insertSentinelsAtomically` — `SELECT COUNT(*) FOR UPDATE` + deadlock retry; `dedupSentinels()` client-side
- fixed SB-BUG-B: `setTimeout(() => void saveNow(), 0)` on drag-end, connect, structural edge change
- fixed ST-BUG2c: `updateDraftStatus('step2')` moved to `loadStoryboard` GET; removed dead `POST /:draftId/initialize`
- fixed runtime: sentinel durationS 0→5; real draftId in useAddBlock; edge IDs → UUID; useSceneModal saveNow + TDZ fix; mediaItem IDs → UUID; BlockInsert mediaItems INSERT loop
- fixed ST-SB-BUG5: useSceneModal syncs `node.data.block` in-place; `useStoryboardHistorySeed.ts` auto-restores on load with `skipSave:true`

## Storyboard UI Bug Fixes + Cleanup (2026-04-27)
- fixed SB-UI-BUG-1: LibraryPanel `addBlockNode` (store-only) → canvas didn't re-render; lifted API call to `StoryboardPage.handleAddFromLibrary`; `setNodes` + deferred `saveNow`
- fixed SB-UI-BUG-2: `handleNodesChange` applied all position events → node frozen during drag; filter `nonDraggingChanges` (strips `{type:'position', dragging:true}`)
- removed SB-CLEAN-1: `StoryboardAssetPanel.tsx` + orphaned test; canvas now full-width
- added SB-HIST-2: `SnapshotMinimap` in StoryboardHistoryPanel — 160×90 SVG; START=#10B981, END=#F59E0B, SCENE=#7C3AED
- added SB-UPLOAD-1: optional `uploadTarget?: UploadTarget` prop on AssetPickerModal; extracted `AssetPickerUploadAffordance.tsx`
- added SB-UPLOAD-2: threaded `uploadDraftId?: string` through SceneModalBlockProps → SceneModal → SceneModalMediaSection → AssetPickerModal

## E2E Infrastructure + Coverage (2026-04-25–28)
- extracted: `e2e/helpers/cors-workaround.ts` (installCorsWorkaround), `e2e/helpers/storyboard.ts` (readBearerToken, createTempDraft, initializeDraft, cleanupDraft, waitForCanvas)
- added: installCorsWorkaround + readBearerToken to app-shell, asset-manager, preview specs; 19/19 previously-failing tests pass
- added: `e2e/storyboard-fixes.spec.ts` — 16 tests (ST-FIX-1..5, SB-BUG-B, Test 7–9, SB-UI-BUG-1/2, SB-CLEAN-1, SB-HIST-2, SB-UPLOAD-1/2, SB-HIST-THUMB); all pass
- seeded: e2e test user `e2e@cliptale.test` in DB
- fixed E2E: auth-state.json origin mismatch — must run with `E2E_BASE_URL` + `E2E_API_URL` env vars

## Storyboard History Thumbnail Fix (2026-04-28)
- fixed SB-HIST-THUMB: `captureCanvasThumbnail.ts` — added `imagePlaceholder` (1×1 transparent GIF); cross-origin image fetch failures fall back to placeholder
- fixed SB-HIST-THUMB: `SceneBlockNode.tsx` `MediaThumbnail` — added `crossOrigin="anonymous"` to `<img>`
- added: `captureCanvasThumbnail.test.ts` — 6/6 pass; `SceneBlockNode.thumbnails.test.tsx` — 27/27 pass
- added: E2E SB-HIST-THUMB — intercepts POST /history, asserts `snapshot.thumbnail` matches `/^data:image/`

## Storyboard Polish — SB-POLISH-1 (2026-04-29)

### SB-POLISH-1a — Diagnose black-thumbnail JPEG (diagnosis only)
- diagnosed: 3 root causes — (1) no `backgroundColor` → JPEG flattens transparency to black; (2) `width/height: 320×180` is destination crop not scale-down — nodes outside top-left 320×180 window; (3) `clientWidth/clientHeight = 0` in jsdom masked bug in unit tests
- fix contract: `getBoundingClientRect()` for source size, `canvasWidth/canvasHeight` for output, `backgroundColor: SURFACE`

### SB-POLISH-1b — Fix captureCanvasThumbnail
- fixed: `captureCanvasThumbnail.ts` — uses `getBoundingClientRect()` for `width/height` (full viewport), `canvasWidth: 320, canvasHeight: 180` for output scale, `backgroundColor: SURFACE` (imported from `storyboardPageStyles.ts`)
- added fallback chain: `rect.width || clientWidth || 1200` / `rect.height || clientHeight || 800`
- updated: `captureCanvasThumbnail.test.ts` — 9 tests; stubs `getBoundingClientRect`; asserts new options shape
- extended: E2E SB-HIST-THUMB — pixel-brightness assertion (25 sampled centre pixels, ≥5 with any channel > 8)

### SB-POLISH-1c — Drag autosave + history
- fixed: `useStoryboardDrag.ts` — `handleNodeDragStop` now calls `pushSnapshot(updatedNodes, edges)` + `setTimeout(() => void saveNow(), 0)` directly; drag-stop is single authoritative save path
- fixed: `StoryboardPage.tsx` — `handleNodesChange` filters ALL position changes (not just `dragging:true`); eliminates double-snapshot race; hook call order reordered (`useStoryboardHistoryPush` before `useStoryboardDrag`)
- added: `useStoryboardDrag.drag-save.test.ts` — 6 tests (saveNow once, pushSnapshot once, non-scene-block no-op, position correct, opacity restored)
- updated: `useStoryboardDrag.test.ts`, `useStoryboardDrag.auto-insert.test.ts`, `StoryboardPage.drag-filter.test.tsx` to add required `pushSnapshot`/`saveNow` mocks
- extended: E2E SB-POLISH-1c — drag block ≥80px, await PUT, assert positionX/Y changed

### SB-POLISH-1d — useStoryboardKnifeTool hook
- added: `useStoryboardKnifeTool.ts` — exports `{ isKnifeActive, cutEdge }`; `isKnifeActive` true while Ctrl/Meta held alone (any non-modifier key exits immediately so Ctrl+Z unaffected); `cutEdge` calls `setEdges`, `pushSnapshot`, `setTimeout(saveNow, 0)`; listeners removed on unmount
- added: `useStoryboardKnifeTool.test.ts` (9 tests), `useStoryboardKnifeTool.keyboard.test.ts` (2 tests), `useStoryboardKnifeTool.fixtures.ts` (shared helpers)

### SB-POLISH-1e — Wire knife tool into canvas
- updated: `StoryboardCanvas.tsx` — `KNIFE_CURSOR_STYLE` constant; `cursorMode?: 'grab' | 'knife'` + `onCutEdge?` props; knife mode: cursor=crosshair (inline style merge), `panOnDrag={false}`, `nodesDraggable={false}`, `onNodeClick` suppressed, `onEdgeClick→onCutEdge`
- updated: `StoryboardPage.tsx` — calls `useStoryboardKnifeTool`; threads `cursorMode` + `onCutEdge` to Canvas; line count 351 (≤354 cap)
- added: `StoryboardCanvas.knife.test.tsx` (7 tests), `StoryboardPage.knife.test.tsx` (5 tests)
- extended: E2E SB-POLISH-1e — hold Ctrl, assert cursor=crosshair, click edge, assert edge count−1, PUT body excludes cut edge; edge click uses `{ force: true }` (React Flow SVG `isVisible()=false` in Playwright)

### SB-POLISH-1f — Line-cap verification
- verified: `StoryboardPage.tsx` = 351 lines (≤354 cap); 2610 tests pass across 239 files

---

## Architectural Decisions
- §9.7 300-line cap exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L), `useProjectInit.test.ts` (318L), `StoryboardCard.tsx` (319L), `storyboard-store.ts` (307L), `StoryboardPage.tsx` (351L approved); e2e/*.spec.ts exempt
- Worker env: only `index.ts` reads config keys; handlers receive secrets via `deps`
- Migration runner: in-process + sha256; DDL non-transactional; INSERT after DDL
- Vitest: `pool: 'forks' + singleFork: true`; each split file has own `vi.hoisted()`
- Files-as-root: `files` user-scoped; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file)
- Soft-delete: `deleted_at IS NULL`; `*IncludingDeleted` helpers; 30-day TTL → GoneError 410
- mysql2: `pool.query` (not `execute`) for LIMIT params; JSON cols need `typeof==='string'` guard
- Auth: `buildAuthenticatedUrl()` required on all `/assets/:id/{thumbnail,stream}` media elements
- Store reset: `resetProjectStore + resetHistoryStore` BEFORE `fetchLatestVersion`
- `CanvasSnapshot.positions` optional — falls back to `block.positionX/Y`
- Typography §3: 14/400 body, 12/500 label, 16/600 heading-3; 4px grid; radius-md 8px
- Per-file styles: hex constants at top of `.styles.ts`; no CSS custom properties in web-editor
- E2E CORS: `page.route()` proxy; PUT requests use `page.request.put`; must run with `E2E_BASE_URL` + `E2E_API_URL` env vars
- Storyboard autosave: reads React state via params+refs, NOT external store subscription
- Storyboard IDs: always `crypto.randomUUID()` — server schema requires UUID
- Immediate save: `setTimeout(() => void saveNow(), 0)` defers until after React re-render
- Sentinel init: `loadStoryboard` auto-initializes atomically; `dedupSentinels()` client-side safety net
- Auto-restore skip-save: `handleRestore({ skipSave: true })` in seed path; manual restore calls saveNow
- React Flow two-state rule: `setNodes` must always be called — external store alone does not update canvas
- Drag position filter: ALL position changes stripped from `handleNodesChange`; `handleNodeDragStop` is sole save path
- Knife mode: `useStoryboardKnifeTool` — Ctrl/Meta alone activates; any non-modifier key deactivates; `cutEdge` is atomic (setEdges + pushSnapshot + saveNow)
- AssetPickerModal upload: opt-in via `uploadTarget?: UploadTarget`; absent = unchanged behavior
- html-to-image: `imagePlaceholder` prevents CORS rejection; `crossOrigin="anonymous"` on `<img>` enables canvas serialization; `getBoundingClientRect()` for source size + `canvasWidth/canvasHeight` for output scale
- E2E history panel: React Query caches history GET 30s; must reload after POST /history before asserting panel

## Known Issues / TODOs
- ACL middleware stub — real ownership check deferred
- `bytes` NULL after ingest (HeadObject needs worker bucket config)
- Lint fails — ESLint v9 config-migration error workspace-wide
- Pre-existing TS errors in `App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile, secondary screens, spacing echo)
- Infinite scroll: BE pagination shipped; FE `fetchNextAssetsPage()` unwired
- `parseStorageUri` duplicated across asset.service + file.service
- `linkFileToProject` duplicated across timeline/api.ts + shared/file-upload/api.ts
- Hard-purge cron for soft-deleted rows past 30 days not implemented
- E2E image/audio timeline-drop tests skip when no assets linked to test project
- **ST-B5 TS2305**: `STORYBOARD_STYLES` import fails in container (stale api-contracts dist); fix: rebuild Docker image
- **Keyboard undo/redo broken**: storyboard-history-store calls storyboard-store but React Flow renders from useState
- `initializeStoryboard` service function orphaned — remove or deprecate
- `e2e/storyboard-canvas.spec.ts` + `e2e/storyboard-drag.spec.ts` — should use `e2e/helpers/cors-workaround.ts`
- SB-HIST-THUMB crossOrigin risk: if `APP_CORS_ORIGIN` mismatches app origin, images may fail; revert `crossOrigin` on SceneBlockNode if so
