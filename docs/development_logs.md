# Development Log (compacted — 2026-03-29 to 2026-04-29)

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-1 (2026-05-25)
- changed: active scene illustration controls now show a loader-only status preview instead of falling back to `Ref` while the title is `Generating scene illustrations`.
- preserved: ready canonical reference thumbnails still render during scene generation, and failed/ready reference fallback behavior remains unchanged.
- changed: completed illustration generation now displays `Done`, matching the completed scene-planning status.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.plan StoryboardPlanControls` -> 1 file / 24 tests passed.
- active task: removed only `STB-ADJ-1` from `docs/active_task.md`; `STB-ADJ-2` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-2 (2026-05-25)
- changed: drag state and original-node dimming now apply to scene blocks, START, and END sentinels.
- changed: drag-stop opacity restoration now applies to all draggable storyboard node types while keeping scene-only edge auto-insert behavior unchanged.
- changed: `GhostDragPortal` now renders disabled full-size previews for scene, START, and END nodes instead of the compact `Moving...` clone.
- added: portal preview regression tests for scene and sentinel previews, plus hook coverage for START/END drag state and opacity restoration.
- tests: `npm --workspace apps/web-editor test -- useStoryboardDrag SceneBlockNode StoryboardCanvas StoryboardPage.drag-filter GhostDragPortal` -> 9 files / 72 tests passed.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "GhostDragPortal|useStoryboardDrag|SceneBlockNode|StoryboardCanvas|StoryboardPage.drag-filter" || true` -> no new touched-file errors; existing `StoryboardCanvas.knife.test.tsx` TS2454 mock assignment debt remains.
- active task: removed only `STB-ADJ-2` from `docs/active_task.md`; `STB-ADJ-3` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - COMMENTED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-3 (2026-05-25)
- changed: storyboard plan scenes now require non-empty `videoPrompt` alongside `prompt` and `visualPrompt`.
- changed: OpenAPI generation-draft storyboard schemas document `videoPrompt` as a required Image-to-Video motion prompt.
- changed: storyboard planning worker prompt now instructs OpenAI to return `videoPrompt` with subject motion, camera movement, depth cues, cinematic timing, continuity, and provider-neutral transitions.
- changed: storyboard plan fixtures across project-schema, API, and media-worker tests now include `videoPrompt`.
- build: `npm --workspace packages/project-schema run build` -> passed so media-worker tests consume the updated package export.
- tests: `npm --workspace packages/project-schema test -- storyboardPlan` -> 1 file / 15 tests passed.
- tests: `npm --workspace packages/api-contracts test -- generation-drafts` -> 2 files / 7 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardPlan` -> 2 files / 23 tests passed.
- changed: legacy persisted completed storyboard plans that predate `videoPrompt` are normalized on repository read by deriving `videoPrompt` from `visualPrompt`; new writes remain strict.
- tests: `npm --workspace apps/api test -- storyboardPlan` -> 3 files / 32 tests passed.
- active task: removed only `STB-ADJ-3` from `docs/active_task.md`; `STB-ADJ-4` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - COMMENTED
- checked by playwright-reviewer - COMMENTED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-4 (2026-05-25)
- added: `storyboard_blocks.video_prompt` nullable persistence and threaded `videoPrompt` through storyboard repository rows, insert/replace validation, OpenAPI contracts, and frontend block types.
- changed: applying completed storyboard plans now stores `visualPrompt` in the existing image `prompt` field and stores generated `videoPrompt` separately on each scene block; sentinels keep `videoPrompt: null`.
- changed: scene edit modal now labels the existing prompt as `Image Prompt *` and adds a nullable `Video Prompt` textarea that saves with block edits.
- preserved: image illustration generation, autosave, restore, history, and existing nullable/manual scene behavior continue using the existing image prompt path.
- covered: API PUT/GET, plan-apply response/DB/history, autosave payload, history snapshot push, and restore tests now assert non-null `videoPrompt` preservation.
- tests: `npm --workspace apps/api test -- storyboard storyboardPlanApply storyboardProjectDoc` -> 17 files / 176 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard` -> 2 files / 86 tests passed.
- tests: `npm --workspace apps/web-editor test -- SceneModal useSceneModal storyboard-api useStoryboardCanvas useStoryboardAutosave useStoryboardHistoryPush storyboard-store.restore` -> 9 files / 112 tests passed.
- typecheck scan: `npm --workspace apps/api run typecheck 2>&1 | rg "storyboard|Storyboard|videoPrompt|storyboardPlanJob" || true` -> no touched-file errors.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "SceneModal|useSceneModal|storyboard/api|storyboard/types|Storyboard|GhostDragPortal|useAddBlock|LibraryPanel|useStoryboardGenerationFlow|useStoryboardHistoryPush" || true` -> no new `videoPrompt`/modal errors; existing `StoryboardCanvas.knife.test.tsx` and autosave test TypeScript debt remains.
- hygiene: `git diff --check -- apps/api packages apps/web-editor/src/features/storyboard` -> passed.
- active task: removed only `STB-ADJ-4` from `docs/active_task.md`; `STB-ADJ-5` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-5 (2026-05-25)
- added: `storyboard_scene_video_jobs` mapping table for per-scene Image-to-Video jobs with active-job dedupe, model id, audio flag, status, output file, and error tracking.
- added: storyboard video repository/controller/routes for `GET /storyboards/:draftId/videos` and `POST /storyboards/:draftId/videos`.
- added: storyboard video orchestration service that validates draft ownership, Image-to-Video model capability, principal-image approval, non-empty scene `videoPrompt`, ready scene illustration outputs, and audio support before enqueueing.
- changed: video job submission reuses the unified `submitGeneration()` path with draft-scoped jobs, start image file ids, optional next-scene `end_image_url`, provider audio fields, and model duration fields.
- covered: service tests for option building, audio support, duration clamping, active-job dedupe including active-lock race loss, multi-scene missing prompt/image preflight, and completed/failed AI job status refresh.
- covered: endpoint integration tests for `GET/POST /storyboards/:draftId/videos`, persisted mapping rows, repeated-start dedupe, full status fields, and failed AI job error exposure.
- tests: `npm --workspace apps/api test -- storyboardVideo storyboard-video aiGeneration falOptions` -> 8 files / 76 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard` -> 2 files / 93 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- hygiene: `git diff --check -- apps/api packages/api-contracts` -> passed.
- active task: removed only `STB-ADJ-5` from `docs/active_task.md`; `STB-ADJ-6` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - COMMENTED
- checked by playwright-reviewer - COMMENTED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-6 (2026-05-25)
- changed: `POST /storyboards/:draftId/project` now accepts optional `{ mode: 'images' | 'videos' }`, defaulting to the existing image-only behavior for empty/missing bodies.
- changed: project assembly can now build `VideoClip` timelines from ready storyboard scene video outputs while preserving image clip assembly for skip mode.
- preserved: completed-draft idempotency still returns the existing project/version instead of creating a second project.
- added: transaction-scoped lookup of latest storyboard video jobs for video assembly readiness checks.
- covered: project-doc tests for valid video clips, volume/trim defaults, video file linking, duration ordering, and missing ready video failure.
- covered: service and integration tests for video mode project creation, video clip rows, project file links, idempotent video-mode retry, write rollback, version doc hydration, and 422 readiness failure.
- tests: `npm --workspace apps/api test -- storyboardProject storyboardProjectDoc storyboard-project` -> 3 files / 24 tests passed.
- tests: `npm --workspace packages/project-schema test -- project-doc clip` -> 2 files / 65 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard` -> 2 files / 94 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- hygiene: `git diff --check -- apps/api packages` -> passed.
- active task: removed only `STB-ADJ-6` from `docs/active_task.md`; `STB-ADJ-7` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - COMMENTED
- checked by playwright-reviewer - COMMENTED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-7 (2026-05-25)
- added: Step 3 modal for choosing Image-to-Video generation or skipping to the existing image-only project path.
- changed: `StoryboardPage.handleNext` opens the modal when Step 3 is enabled; skip routes to `/generate/road-map?draftId=<id>&mode=images`.
- added: modal model loading from the existing AI model catalog, filtered to `image_to_video`, with an audio checkbox only when the selected model exposes `generate_audio` or `generate_audio_switch`.
- added: frontend API helpers and types for `GET/POST /storyboards/:draftId/videos`, plus mode-aware storyboard project creation.
- changed: `GenerateProjectFromStoryboardPage` now dedupes by draft plus mode; `mode=images` assembles immediately, while `mode=videos` polls storyboard video status, surfaces failures with retry, and creates the project with video clips once all outputs are ready.
- changed: extracted Step 3 modal state/start logic into `useStep3Generation` so `StoryboardPage.tsx` remains under the 300-line architecture limit.
- changed: Step 3 modal close control now uses the storyboard SVG close icon pattern, and the generate CTA shows `Starting...` while busy.
- covered: queued/running video polling to ready, video-mode Strict Mode dedupe, skip routing, API payloads, and audio toggle support.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.navigation StoryboardPage.plan GenerateProjectFromStoryboardPage storyboard-api Step3GenerationModal` -> 5 files / 81 tests passed.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "StoryboardPage|GenerateProjectFromStoryboardPage|Step3|useStep3Generation|storyboard/api|storyboard/types" || true` -> no touched-file errors.
- e2e typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-project.spec.ts e2e/storyboard-illustrations.spec.ts e2e/helpers/storyboard.ts` -> passed.
- hygiene: `git diff --check -- apps/web-editor/src/features/storyboard apps/web-editor/src/features/generate-wizard e2e/storyboard-project.spec.ts` -> passed.
- active task: removed only `STB-ADJ-7` from `docs/active_task.md`; `STB-ADJ-8` remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - COMMENTED

## Storyboard UX, Prompt, and Step 3 Video Generation Adjustments — STB-ADJ-8 (2026-05-25)
- added: mocked Playwright coverage for the Step 3 modal skip path, asserting image-mode assembly and ordered image clips in the editor.
- added: mocked Playwright coverage for the Step 3 Image-to-Video model path, including audio-capable model selection, video job start payload, video-status polling/readiness gating, video-mode project assembly, and ordered video clips in the editor.
- added: mocked Playwright coverage for video generation failure retry before video-mode project assembly.
- updated: storyboard project E2E mocks now include storyboard video endpoints, Image-to-Video model catalog responses, video assets, and asset captions requests.
- fixed: scene illustration status badges are reapplied after storyboard reloads that add ready media, preserving failed/running retry UI after canvas hydration.
- validation prep: restored the local E2E user password hash in the target DB to match `apps/web-editor/e2e/seed-test-user.sql`.
- tests: `npm --workspace packages/project-schema test -- storyboardPlan project-doc clip` -> 3 files / 80 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 143 tests passed.
- tests: `npm --workspace apps/api test -- storyboard storyboardPlan storyboardIllustration storyboardVideo storyboardProject storyboard-project aiGeneration` -> 24 files / 248 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardPlan ai-generate` -> 7 files / 60 tests passed.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage GenerateProjectFromStoryboardPage SceneModal useStoryboardDrag storyboard-api` -> 15 files / 165 tests passed.
- focused tests: `npm --workspace apps/web-editor test -- StoryboardPage.plan StoryboardPage GenerateProjectFromStoryboardPage` -> 8 files / 73 tests passed after the reload-status fix.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "StoryboardPage|GenerateProjectFromStoryboardPage|Step3|useStep3Generation|useStoryboardGenerationFlow|storyboard/api|storyboard/types" || true` -> no touched-file errors.
- e2e typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-project.spec.ts e2e/storyboard-illustrations.spec.ts e2e/helpers/storyboard.ts` -> passed.
- e2e: `VITE_PUBLIC_API_BASE_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-project.spec.ts e2e/storyboard-illustrations.spec.ts --project=chromium` -> 8 tests passed.
- hygiene: `git diff --check` -> passed.
- active task: removed `STB-ADJ-8` from `docs/active_task.md`; no active subtasks remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - COMMENTED
- checked by playwright-reviewer - APPROVED

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

## Storyboard Add Block History — SB-HIST-ADD (2026-05-06)
- fixed: toolbar Add Block now persists a Storyboard history snapshot for the computed node list that includes the newly-added scene block
- fixed: library "Add to Storyboard" uses the same add/save/history path via `useHandleAddFromLibrary`
- changed: `storyboard-history-store.push()` supports immediate persistence for user actions that must be visible in History without waiting for the 1s debounce
- changed: StoryboardPage invalidates `['storyboard-history', draftId]` after immediate add-block history persistence so the History panel does not stay on a stale empty query
- refactored: moved library-add block insertion logic out of `StoryboardPage.tsx`; verified `StoryboardPage.tsx` = 334 lines
- tests: `docker compose exec -T -w /app/apps/web-editor web-editor npx vitest run src/features/storyboard` → 38 files / 355 tests passed
- typecheck: `docker compose exec -T -w /app/apps/web-editor web-editor npm run typecheck` still fails on pre-existing workspace-wide TypeScript debt outside this change (App/timeline/AI-generation/storyboard legacy tests); no new errors in changed Storyboard files after local filtering
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Storyboard Keyboard Undo/Redo Canvas Sync (2026-05-12)
- fixed: `storyboard-history-store.undo()` / `redo()` now return the applied React Flow nodes/edges while still syncing the external storyboard store.
- fixed: `useStoryboardKeyboard` forwards applied undo/redo snapshots back to `StoryboardPage`, which commits them through the shared restore path.
- changed: `useHandleRestore` supports `skipSnapshot` for undo/redo so applying an existing history entry does not push a new history entry, and `deferSave` so save runs after the restored graph is queued into React state.
- covered: keyboard tests now assert `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z` apply returned snapshots; restore tests assert `skipSnapshot` avoids `pushSnapshot`; history-store tests assert undo/redo return restored graph data.
- tests: `docker compose exec -T -w /app/apps/web-editor web-editor npx vitest run src/features/storyboard/hooks/useStoryboardKeyboard.test.ts src/features/storyboard/hooks/useHandleRestore.test.ts src/features/storyboard/store/storyboard-history-store.test.ts src/features/storyboard/store/storyboard-history-store.snapshot-payload.test.ts` -> 4 files / 47 tests passed.
- tests: `docker compose exec -T -w /app/apps/web-editor web-editor npx vitest run src/features/storyboard` -> 38 files / 361 tests passed; existing React act warnings remain in autosave tests.
- typecheck: `docker compose exec -T -w /app/apps/web-editor web-editor npm run typecheck` still fails on pre-existing workspace-wide TypeScript debt; filtered output shows no errors in the changed undo/redo files.
- playwright: seeded missing local E2E user with `apps/web-editor/e2e/seed-test-user.sql`, then ran `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-fixes.spec.ts e2e/storyboard-history-regression.spec.ts` -> 18 passed / 5 failed. First failure is existing `storyboard-fixes.spec.ts` history restore expectation selecting the newest add-block snapshot instead of the older sentinel-only seeded snapshot after SB-HIST-ADD; later failures are 429 rate-limit fallout from the same run.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - COMMENTED

## Stage 2 Draft Settings — STAGE2-DRAFT-1 (2026-05-12)
- added: shared `draftSettingsSchema` plus draft length/aspect/style enum schemas on `PromptDoc.settings`.
- exported: `DraftSettings`, `DraftVideoLengthSeconds`, `DraftAspectRatio`, and `DraftStyleKey` from `@ai-video-editor/project-schema`.
- covered: legacy PromptDoc documents without settings, valid settings parsing/type inference, and invalid setting values.
- tests: `npm --workspace packages/project-schema test -- promptDoc.schema.test.ts` -> 1 file / 13 tests passed.
- typecheck: `npm --workspace packages/project-schema run typecheck` -> passed. Documented command `npm --workspace packages/project-schema typecheck` is not accepted by this npm version.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Draft Settings — STAGE2-DRAFT-2 (2026-05-12)
- covered: API create/update validation accepts valid draft settings, rejects invalid settings enum values through the existing 422 service path, and preserves settings through repository JSON mapping.
- updated: OpenAPI now documents `PromptDoc`, `PromptBlock`, and `DraftSettings` components; generation draft request/response schemas reference `PromptDoc`.
- noted: `packages/project-schema` must be rebuilt before API tests because `@ai-video-editor/project-schema` resolves to `dist`.
- tests: `npm --workspace packages/project-schema run build` -> passed.
- tests: `npm --workspace apps/api test -- generationDraft.service.test.ts generationDraft.repository.test.ts` -> 2 files / 31 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 4 files / 94 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- broader test caveat: `npm --workspace apps/api test -- generationDraft` still fails only in pre-existing date-sensitive `generationDraft.restore.service.test.ts` cases because fixed January 2026 deletion dates are now older than the 30-day restore TTL on 2026-05-12.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Draft Settings — STAGE2-DRAFT-3 (2026-05-12)
- added: generate-wizard feature-local re-exports for draft settings types.
- added: `DEFAULT_DRAFT_SETTINGS` and `getDraftSettings(promptDoc)` so legacy drafts expose UI defaults without mutating or immediately resaving the server document.
- covered: settings-only changes autosave through `setDoc`, hydrated legacy drafts do not schedule saves, optional settings fields default for UI reads, and `flush()` persists pending settings-only changes after hydrate.
- tests: `npm --workspace apps/web-editor test -- useGenerationDraft` -> 3 files / 18 tests passed.
- typecheck: `npm --workspace apps/web-editor run typecheck` still fails on existing workspace-wide errors; filtered output for touched files shows no errors. Existing generate-wizard errors remain in `AssetPickerModal.test.tsx`, `EnhancePreviewModal.test.tsx`, `PromptEditor.drag.test.tsx`, and `useEnhancePrompt.ts`.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Draft Settings — STAGE2-DRAFT-4 (2026-05-12)
- added: compact Step 1 `DraftSettingsControls` for video length, aspect ratio, and style.
- wired: controls update `PromptDoc.settings` through `GenerateWizardPage`'s existing `setDoc` autosave path; `modelPreference` remains hidden and defaults to null.
- styled: dark-theme tokens, 8px radius, responsive auto-fit grid, select controls for length/style, segmented buttons for aspect ratio.
- covered: default legacy settings, hydrated settings, and settings update payloads in focused component tests.
- tests: `npm --workspace apps/web-editor test -- GenerateWizardPage DraftSettingsControls` -> 4 files / 30 tests passed.
- tests: `npm --workspace apps/web-editor test -- WizardFooter` -> 1 file / 17 tests passed.
- typecheck: `npm --workspace apps/web-editor run typecheck` still fails on existing workspace-wide errors; filtered output for `DraftSettingsControls`, `GenerateWizardPage`, and draft settings symbols shows no local errors.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Draft Settings — STAGE2-DRAFT-5 (2026-05-12)
- fixed: AI Enhance worker now preserves original `PromptDoc.settings` while rewriting prompt blocks.
- guarded: `useEnhancePrompt` merges source settings back into enhance results that omit settings before exposing them to the preview modal.
- covered: API enhance payload includes settings, worker preserves settings, modal accept passes proposed settings, and WizardFooter flushes a settings-bearing doc before navigating to storyboard.
- tests: `npm --workspace apps/api test -- generationDraft.enhance` -> 1 file / 12 tests passed.
- tests: `npm --workspace apps/media-worker test -- enhancePrompt.job` -> 1 file / 12 tests passed.
- tests: `npm --workspace apps/web-editor test -- EnhancePreviewModal useEnhancePrompt WizardFooter` -> 4 files / 36 tests passed.
- typecheck: `npm --workspace apps/media-worker run typecheck` -> passed.
- typecheck: filtered `npm --workspace apps/web-editor run typecheck` output for changed enhance/footer files -> no local errors; full web-editor typecheck remains blocked by existing workspace-wide failures.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Draft Settings — STAGE2-DRAFT-6 (2026-05-12)
- added: focused Playwright coverage for Step 1 draft settings persistence/resume and Next after a settings-only change.
- fixed: `DraftSettingsControls` now keeps an optimistic local settings snapshot so rapid length/aspect/style changes compose into one complete `PromptDoc.settings` payload instead of overwriting from a stale render.
- hardened: E2E waits for hydrated prompt content before interacting with resumed drafts and disables the Step 1 pro-tip overlay before app scripts run.
- tests: `npm --workspace apps/web-editor test -- DraftSettingsControls GenerateWizardPage` -> 4 files / 30 tests passed.
- e2e: reseeded local E2E user and restarted the local API container to clear the in-memory auth login limiter, then ran `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/generate-wizard-settings.spec.ts` -> 2 tests passed.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Illustrations — STAGE2-ILLUSTRATIONS-1 (2026-05-14)
- added: migration `038_storyboard_scene_illustration_jobs` with draft/block/job/file FKs, cascade cleanup for draft/block/job deletion, nullable output-file cleanup, latest-attempt indexes, and UI-facing statuses `queued | running | ready | failed`.
- added: `storyboardSceneIllustration.repository.ts` for mapping creation, draft listing, lookup by id/job, latest-by-block selection, status/error updates, output linkage, and AI job status projection.
- covered: repository tests for insertion scoping to scene blocks, latest attempt ordering, job lookup, output linkage, failure status, and status translation.
- covered: migration test for idempotency, required columns, status enum vocabulary, FK delete rules, and latest-attempt index shape.
- tests: `npm --workspace apps/api test -- storyboardSceneIllustration` -> 1 file / 9 tests passed.
- tests: `npm --workspace apps/api test -- migration-038` -> 1 file / 5 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STAGE2-ILLUSTRATIONS-1` from `docs/active_task.md`; remaining illustration subtasks stay queued.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Illustrations — STAGE2-ILLUSTRATIONS-2 (2026-05-14)
- added: storyboard illustration service/controller/routes for `GET /storyboards/:draftId/illustrations`, `POST /storyboards/:draftId/illustrations`, and `POST /storyboards/:draftId/blocks/:blockId/illustration`.
- wired: scene image generation reuses `submitGeneration`, sets `ai_generation_jobs.draft_id`, creates storyboard illustration mappings, skips active queued/running/ready jobs, and lets failed attempts be retried.
- added: centralized storyboard illustration defaults using `openai/gpt-image-2`, low quality, one PNG, async mode, and aspect-ratio-derived `image_size`; scene style is appended to the generation prompt.
- added: `openai/gpt-image-2` to the fal model catalog with `prompt`, `image_size`, `quality`, `num_images`, `output_format`, and `sync_mode` fields.
- updated: OpenAPI paths/schemas for storyboard illustration status responses and start/retry endpoints.
- covered: service tests for ownership/missing resources, no-prompt 422, duplicate active-job prevention, failed/ready retry behavior, status listing order, AI status projection, draft linking, and option builder defaults.
- covered: Supertest integration coverage for the three storyboard illustration endpoints, including auth, wrong-owner/missing resources, all-scene start, single-scene start, duplicate active-job prevention, all-scene no-partial-enqueue 422, and missing prompt 422.
- review fix: `submitGeneration` now creates the AI job row, sets optional `draft_id`, and runs a `beforeEnqueue` hook before adding the BullMQ job, so storyboard mappings are durable before a fast worker can complete.
- review fix: all-scene illustration start prevalidates target prompts before enqueuing any jobs, preventing partial queued work followed by a 422.
- review fix: worker storage keys no longer depend on removed `projectId`; generated fal/ElevenLabs outputs are stored under the user id path.
- review fix: `openai/gpt-image-2` catalog now matches fal.ai documented enum values for `image_size` and `quality`, while storyboard defaults remain centralized at low quality.
- build: `npm --workspace packages/api-contracts run build` -> passed; required so API tests resolve the updated workspace package dist.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 117 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi fal-models elevenlabs-models` -> 7 files / 151 tests passed.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboard-illustration-endpoints generation-draft-ai-generate` -> 3 files / 21 tests passed.
- tests: `npm --workspace apps/api test -- generation-draft-ai-generate` -> 1 file / 8 tests passed.
- tests: `npm --workspace apps/media-worker test -- ai-generate` -> 5 files / 37 tests passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace apps/media-worker run typecheck` -> passed.
- active task: removed only `STAGE2-ILLUSTRATIONS-2` from `docs/active_task.md`; remaining illustration subtasks stay queued.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Illustrations — STAGE2-ILLUSTRATIONS-3 (2026-05-14)
- added: storyboard illustration output reconciliation that marks mapped jobs `ready`, stores `output_file_id`, and inserts one `storyboard_block_media` image row after existing block media.
- hardened: block-media insertion is idempotent through a `NOT EXISTS` check on block/file/image, so repeated status polling or worker reconciliation does not duplicate generated thumbnails.
- wired: `listStoryboardIllustrations` reconciles completed AI jobs during polling so hydrated `GET /storyboards/:draftId` includes completed generated images even if the worker-side attachment needs a follow-up read.
- wired: `ai-generate` worker accepts an injected storyboard illustration repository; fal completion attaches mapped outputs to scene blocks, and failure marks mapped illustration jobs failed with the provider error.
- fixed: `ai-generate` and ElevenLabs worker storage keys use `ai-generations/{userId}/...` instead of the removed `projectId` payload field.
- review fix: migration `038` now adds an `active_lock` column plus unique `(draft_id, block_id, active_lock)` guard, backfills older/failed attempts to `NULL` before index creation, and prevents concurrent duplicate queued/running/ready mappings.
- review fix: `submitGeneration` marks the created AI job failed if pre-enqueue mapping work or BullMQ enqueue fails, avoiding stranded queued storyboard illustration mappings.
- review fix: storyboard illustration starts now treat ready as active in both all-scene and per-block paths; OpenAPI copy was updated to document that only failed scenes retry.
- covered: repository attach SQL, service ready reconciliation, endpoint completion -> storyboard media hydration/idempotency, worker success attachment, and worker failure mapping.
- tests: `npm --workspace apps/api test -- aiGeneration storyboardIllustration storyboard.service storyboard-illustration-endpoints` -> 10 files / 87 tests passed.
- tests: `npm --workspace apps/api test -- aiGeneration storyboardIllustration migration-038 storyboard-illustration-endpoints` -> 8 files / 72 tests passed.
- tests: `npm --workspace apps/media-worker test -- ai-generate` -> 5 files / 37 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard fal-models elevenlabs-models` -> 4 files / 102 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace apps/media-worker run typecheck` -> passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- active task: removed only `STAGE2-ILLUSTRATIONS-3` from `docs/active_task.md`; remaining UI/E2E illustration subtasks stay queued.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Illustrations — STAGE2-ILLUSTRATIONS-4 (2026-05-14)
- added: typed frontend storyboard illustration API helpers for listing status, starting all missing scene illustrations, and retrying one scene block.
- added: `useStoryboardIllustrations` hook with start/retry/status refresh, queued/running blocking lifecycle, polling to ready/failed, storyboard reload on newly attached output files, stale draft/request guards, and explicit polling/start/retry error handling.
- wired: Step 2 now has distinct illustration controls below scene-planning controls; completed illustrations show a disabled `Ready` action instead of advertising a no-op regenerate.
- wired: `SceneBlockNode` receives per-block illustration status and retry callback, renders compact queued/running/ready/failed badges, and exposes failed-scene retry without disturbing existing thumbnail rendering.
- guarded: Step 3 is disabled while scene illustrations are queued/running, while Back/Home remain available; manual add/connect/edit/library/keyboard changes remain disabled during plan or illustration blocking states.
- fixed: `useStoryboardCanvas.reload` now ignores stale/overlapping fetches through request-token and active-draft guards.
- covered: illustration hook start/poll/ready refresh/failure/retry/stale-draft behavior, SceneBlockNode all status labels and retry, page-level Step 3 gating, auto-start after plan apply, and node-data status injection.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan SceneBlockNode` -> 4 files / 47 tests passed.
- typecheck: `npm --workspace apps/web-editor run typecheck` -> failed on pre-existing workspace-wide errors outside touched Stage 4 files; touched-file filter for `api|types|useStoryboardIllustrations|useStoryboardCanvas|StoryboardPage|StoryboardPageWorkspace|StoryboardPageFooter|StoryboardPlanControls|SceneBlockNode|nodeStyles` produced no output.
- active task: removed only `STAGE2-ILLUSTRATIONS-4` from `docs/active_task.md`; E2E illustration subtask remains queued.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Illustrations — STAGE2-ILLUSTRATIONS-5 (2026-05-14)
- added: Playwright coverage in `e2e/storyboard-illustrations.spec.ts` for the Step 2 scene illustration lifecycle without live provider calls.
- covered: mocked storyboard plan/apply flow into scene blocks, mocked all-scene illustration start, running status and Step 3 gating, Back/Home availability, failed-scene retry, final ready statuses, and three generated thumbnails via mocked authenticated asset thumbnails.
- fixed: E2E run exposed that storyboard reloads after ready outputs could drop per-node illustration status; `StoryboardPage` now reinjects illustration data on node changes while returning previous state when unchanged to avoid render loops.
- fixed: migration `038` was restored to its original applied checksum shape; active-lock duplicate prevention moved into new migration `039_storyboard_scene_illustration_active_lock` with direct migration coverage.
- tests: `npm --workspace apps/api test -- migration-038 migration-039 storyboardIllustration storyboard-illustration-endpoints` -> 4 files / 23 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 117 tests passed.
- tests: `npm --workspace apps/api test -- storyboardIllustration` -> 1 file / 8 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan SceneBlockNode` -> 4 files / 47 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/helpers/storyboard.ts e2e/storyboard-illustrations.spec.ts` -> passed.
- playwright: `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-illustrations.spec.ts` -> failed in global setup because the existing local `localhost:3001` listener reset `POST /auth/login`.
- playwright: started a clean API on port 3002 with local test env, seeded `apps/web-editor/e2e/seed-test-user.sql`, and reran `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3002 npx playwright test e2e/storyboard-illustrations.spec.ts` -> 1 passed.
- active task: cleared `docs/active_task.md`; Stage 2 storyboard illustrations subtasks are complete.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Illustrations — Final Validation (2026-05-14)
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 117 tests passed.
- tests: `npm --workspace apps/api test -- migration-038 migration-039 storyboardIllustration storyboard-illustration-endpoints` -> 4 files / 23 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan SceneBlockNode` -> 4 files / 47 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: focused E2E compile `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/helpers/storyboard.ts e2e/storyboard-illustrations.spec.ts` -> passed.
- playwright: `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3002 npx playwright test e2e/storyboard-illustrations.spec.ts` -> 1 passed.
- typecheck caveat: `npm --workspace apps/web-editor run typecheck` remains blocked by pre-existing workspace-wide test/type errors outside touched Stage 4 files; the touched-file filter for the storyboard illustration files produced no output.
- environment note: local port 3001 had an existing listener that reset API connections, so the passing Playwright run used the clean API instance on port 3002 and the spec proxies app-origin `localhost:3001` requests to `E2E_API_URL`.
- active task: `docs/active_task.md` now records no active tasks.

## Stage 2 Draft Settings — Final Validation (2026-05-12)
- tests: `npm --workspace packages/project-schema test` -> 6 files / 117 tests passed.
- tests: `npm --workspace packages/api-contracts test` -> 7 files / 134 tests passed.
- tests: `npm --workspace apps/web-editor test -- generate-wizard` -> 29 files / 215 tests passed.
- caveat: `npm --workspace apps/api test -- generationDraft` -> 6 files passed, 84/86 tests passed; the only failures are the known date-sensitive `generationDraft.restore.service.test.ts` happy-path cases now returning 410 because their fixed January 2026 `deletedAt` fixture is outside the 30-day restore TTL on 2026-05-12.
- active task: cleared `docs/active_task.md`; Stage 2 draft settings work is complete.

## Stage 2 Draft Settings — Custom Video Length (2026-05-12)
- changed: `videoLengthSeconds` now accepts any integer from 1 to 600 instead of only preset enum values.
- updated: Step 1 Length control is a numeric seconds input with quick preset buttons for 15/30/60/90/120 seconds.
- covered: schema accepts custom values such as 75 seconds and rejects 0, 601, and fractional seconds; OpenAPI documents integer min/max; UI tests cover custom input, presets, and invalid ranges.
- tests: `npm --workspace packages/project-schema test -- promptDoc.schema.test.ts` -> 13 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.generation-drafts.schemas.test.ts` -> 3 tests passed.
- tests: `npm --workspace apps/web-editor test -- DraftSettingsControls GenerateWizardPage` -> 32 tests passed.
- tests: `npm --workspace packages/project-schema run build` -> passed.
- tests: `npm --workspace apps/api test -- generationDraft.service.test.ts` -> 18 tests passed.
- tests: `npm --workspace apps/web-editor test -- useGenerationDraft DraftSettingsControls WizardFooter` -> 42 tests passed.
- e2e: `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/generate-wizard-settings.spec.ts` -> 2 tests passed.

## Stage 2 Storyboard Planning — STAGE2-PLAN-1 (2026-05-13)
- added: shared storyboard plan schemas, inferred TypeScript types, job status/result schemas, deterministic scene-count helper, and exported safe default helpers for legacy draft settings.
- covered: duplicate/non-sequential scene number rejection, empty prompt/visualPrompt rejection, positive duration validation, duration-sum tolerance, stable referenced media without signed URLs, and enforced 1-600 second scene-count derivation.
- tests: `npm --workspace packages/project-schema test -- storyboardPlan` -> 1 file / 15 tests passed.
- typecheck: `npm --workspace packages/project-schema run typecheck` -> passed.
- build: `npm --workspace packages/project-schema run build` -> passed.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Planning — STAGE2-PLAN-2 (2026-05-13)
- added: `storyboard_plan_jobs` migration with job lifecycle columns, durable JSON snapshots, completion/failure timestamps, and `(draft_id, created_at)` / `(user_id, created_at)` indexes.
- added: storyboard plan job repository for queued/running/completed/failed lifecycle updates, validated completed plan persistence, sanitized failure messages, job lookup, and latest completed draft plan lookup.
- covered: mysql2 JSON string/object mapping, schema-invalid completed plan rejection, concise stack/secret/url-safe errors, and fetch SQL that does not shortcut draft soft-delete behavior.
- build: `npm --workspace packages/project-schema run build` -> passed.
- tests: `npm --workspace apps/api test -- storyboardPlanJob.repository` -> 1 file / 14 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Planning — STAGE2-PLAN-3 (2026-05-13)
- added: authenticated `POST /generation-drafts/:id/storyboard-plan` and `GET /generation-drafts/:id/storyboard-plan/:jobId` routes before generic draft routes, with thin controller wiring.
- added: storyboard-plan API service and queue enqueue helper; POST validates draft ownership, PromptDoc/settings shape, non-empty text/media input, persists a queued job row, enqueues BullMQ, and returns 202.
- added: GET polling reads persisted `storyboard_plan_jobs` rows for queued/running/completed/failed states and returns durable completed plans without reading BullMQ return values.
- added: OpenAPI path/schema contract and focused API service/integration/OpenAPI tests for ownership, missing/deleted drafts, repeat POST distinct jobs, validation, and persisted polling states.
- build: `npm --workspace packages/project-schema run build` -> passed.
- tests: `npm --workspace apps/api test -- generationDraft storyboardPlan` -> failed on pre-existing `generationDraft.restore.service.test.ts` hard-coded restore TTL fixture; storyboard-plan tests in the run passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 98 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Planning — STAGE2-PLAN-4 (2026-05-13)
- added: media-worker storyboard planning context resolver that loads the current `PromptDoc`, validates referenced `files` through active `draft_files`, includes stable metadata/transcript snippets, and fails dangling, deleted, unauthorized, unlinked, or kind-mismatched refs with explicit validation errors.
- added: worker-local S3 read presign helper for short-lived OpenAI media inputs; ready images sign `storage_uri`, ready videos sign thumbnail previews only, and audio/video raw files are not signed for the normal planning path.
- documented in code/tests: pending/processing refs are metadata-only, images use vision input, audio is transcript-first, and video uses metadata plus thumbnail/transcript context.
- covered: signed URLs excluded from persistable media context, absent transcript-storage fallback, transcript null fallback, pending/processing metadata-only behavior, dangling/unauthorized failures, and no raw audio/video upload requirement.
- tests: `npm --workspace apps/media-worker test -- storyboardPlan.context` -> 1 file / 11 tests passed; `npm --workspace apps/media-worker test -- s3` -> 1 file / 2 tests passed.
- typecheck: `npm --workspace apps/media-worker run typecheck` -> passed.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Planning — STAGE2-PLAN-5 (2026-05-13)
- added: media-worker `storyboard-plan` BullMQ worker registration plus worker-local lifecycle persistence for running/completed/failed job states.
- added: OpenAI storyboard planning handler that resolves current draft/media context, sends JSON-only multimodal text plus image/thumbnail URL input, allowlists `modelPreference`, validates shared storyboard plan schema, and persists stable media context without signed URLs.
- covered: success, malformed JSON, schema-invalid plans, media context validation failures, model fallback, and retryable transient OpenAI failures.
- tests: `npm --workspace apps/media-worker test -- storyboardPlan` -> 2 files / 21 tests passed.
- typecheck: `npm --workspace apps/media-worker run typecheck` -> passed.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Planning — STAGE2-PLAN-6 (2026-05-13)
- added: worker integration-style coverage that resolves a text prompt plus image/video/audio refs from DB-like rows, uses mocked signed URLs and mocked OpenAI, and persists a 45-second storyboard plan through the real worker repository path.
- covered: custom video length constraints, image vision input, video thumbnail/transcript context, audio transcript-first context, durable media context without signed URLs, and no storyboard block creation query in the planning path.
- confirmed: existing API integration coverage exercises mocked queue POST lifecycle, persisted GET states, authenticated owner fetch, and cross-user rejection; existing context tests cover missing, unauthorized, deleted, unlinked, and kind-mismatched media refs.
- tests: `npm --workspace packages/project-schema test` -> 7 files / 132 tests passed.
- tests: `npm --workspace apps/api test -- generationDraft storyboardPlan` -> 9 files passed, 108/110 tests passed; only failures were the known date-sensitive `generationDraft.restore.service.test.ts` January 2026 restore TTL cases, unrelated to storyboard planning.
- tests: `npm --workspace apps/api test -- storyboardPlan` -> 3 files / 24 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardPlan` -> 2 files / 22 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 98 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace apps/media-worker run typecheck` -> passed.
- active task: cleared `docs/active_task.md`; Stage 2 Block 3 storyboard planning implementation subtasks are complete.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Planning — Runtime Fixes (2026-05-13)
- fixed: media-worker Docker build no longer fails on duplicate AWS/Smithy type instances by wrapping `getSignedUrl` behind a local typed adapter.
- fixed: storyboard-plan worker payload validation now accepts the seeded local dev auth user id `dev-user-001` while still requiring UUID `jobId` and `draftId`.
- changed: storyboard plan scene count clamp is 40 scenes max, so 600-second drafts produce a realistic 40-scene plan instead of requiring 100 scenes from one OpenAI response.
- improved: schema validation errors now store compact `path: message` details instead of raw multiline Zod JSON that appears as only `[` in container logs.
- verified: real API/worker flow for a 600-second draft completed with `sceneCount = 40`, `scenes = 40`, and `error_message = NULL`.
- tests: `npm --workspace packages/project-schema test -- storyboardPlan` -> passed.
- tests: `npm --workspace apps/media-worker test -- storyboardPlan` -> 2 files / 23 tests passed.
- typecheck/build: `npm --workspace apps/media-worker run typecheck`, `npm run build --workspace=apps/media-worker`, and `docker compose build media-worker` -> passed.

## Stage 2 Storyboard Scenes — STAGE2-SCENES-1 (2026-05-14)
- added: exported `applyLatestCompletedPlan(userId, draftId)` backend service for applying the latest completed storyboard plan to a draft.
- implemented: ownership enforcement, latest completed plan lookup, deterministic START -> scenes -> END graph generation, `visualPrompt` to scene `prompt`, rounded scene durations, referenced media preservation, sentinel reuse/creation without duplicate multiplication, transaction-scoped storyboard replacement, transaction-scoped history snapshot/pruning, and canonical DB reload before returning state.
- added: focused split service tests covering two-scene apply, referenced media rows, replacement of ad hoc blocks/edges, sentinel creation/reuse, missing completed plan, cross-user rejection, rollback, and canonical return path.
- tests: `npm --workspace apps/api test -- storyboard.service.plan-apply` -> 1 file / 5 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STAGE2-SCENES-1` from `docs/active_task.md`; route/OpenAPI/frontend/E2E subtasks remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Scenes — STAGE2-SCENES-2 (2026-05-14)
- added: `POST /storyboards/:draftId/apply-latest-plan` route and thin storyboard controller method that calls `applyLatestCompletedPlan` for the authenticated user and returns `StoryboardState`.
- documented: OpenAPI path with bearer auth, `StoryboardState` 200 response, and 401/403/404/422 error cases; storyboard OpenAPI path/security tests now cover the operation.
- added: storyboard integration coverage that seeds a completed `storyboard_plan_jobs` row, applies it through HTTP, and asserts persisted storyboard blocks, edges, media rows, and history; also covers cross-owner 403 and missing completed plan 422.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 107 tests passed.
- tests: `npm --workspace packages/api-contracts run typecheck` -> passed.
- tests: `npm --workspace apps/api run typecheck` -> passed.
- tests: `npm --workspace apps/api test -- storyboard.service.plan-apply` -> 1 file / 5 tests passed.
- tests: `npm --workspace apps/api test -- storyboard.integration storyboardPlan` -> failed because the local MySQL server rejected configured `cliptale` credentials (`ER_ACCESS_DENIED_ERROR`); non-live-db storyboardPlan unit/repository tests in that command passed.
- caveat: an accidental first attempt `npm --workspace packages/api-contracts test -- openapi.storyboard --runInBand` failed because Vitest does not support `--runInBand`; rerun without the Jest flag passed.
- active task: removed only `STAGE2-SCENES-2` from `docs/active_task.md`; frontend hook/UI/E2E subtasks remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Scenes — STAGE2-SCENES-3 (2026-05-14)
- added: frontend storyboard plan API helpers for `POST /generation-drafts/:draftId/storyboard-plan`, `GET /generation-drafts/:draftId/storyboard-plan/:jobId`, and `POST /storyboards/:draftId/apply-latest-plan`.
- added: `useStoryboardPlanGeneration` hook with `idle | queued | running | applying | completed | failed` lifecycle, explicit start/retry behavior, terminal/unmount polling cleanup, completed-only apply, React Flow-shaped canvas conversion, history query invalidation, and surfaced start/poll/apply errors.
- tests: `npm --workspace apps/web-editor test -- useStoryboardPlanGeneration storyboard-api.test.ts` -> 2 files / 33 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardPlanGeneration storyboard api` -> failed because this local install cannot resolve existing storyboard dependencies `@xyflow/react`, `@xyflow/react/dist/style.css`, and `html-to-image` in pre-existing matched tests; direct hook/API tests passed after fixes.
- typecheck: `npm --workspace apps/web-editor run typecheck` -> failed on pre-existing workspace-wide errors outside touched storyboard files; filtered `rg 'src/features/storyboard/(api|types|hooks/useStoryboardPlanGeneration|__tests__/storyboard-api)'` output was empty after rerun.
- review fix: added draft-change polling invalidation/stale async guards, switched hook imports to `@/features/storyboard/*`, and normalized all start/poll/apply/job-failed errors to concise retry copy for the Step 2 UI.
- active task: removed only `STAGE2-SCENES-3` from `docs/active_task.md`; UI/E2E subtasks remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Scenes — STAGE2-SCENES-4 (2026-05-14)
- added: compact Step 2 generation controls and queued/running/applying workspace blocker for applying AI storyboard plans, with failure retry and completed-state copy.
- wired: `StoryboardPage` now uses `useStoryboardPlanGeneration`, auto-starts when opened with `?generateScenes=1`, hydrates local React Flow nodes/edges from the hook's applied canvas state, disables Step 3 during blocking generation, closes covered modals, and leaves Back/Home available.
- guarded: manual add/connect/node/edge changes, library adds, node edit clicks, and keyboard undo/redo/delete are no-ops while the plan blocker is active; UI was extracted into `StoryboardPlanControls`, `StoryboardPageWorkspace`, and `StoryboardPageFooter`, keeping `StoryboardPage.tsx` at 290 lines.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage StoryboardPlan` -> 8 files / 53 tests passed.
- tests: `npm --workspace apps/web-editor test -- storyboard` -> 44 files / 436 tests passed; existing React act warnings appeared in `useStoryboardAutosave.save-now.test.ts`.
- typecheck: `npm --workspace apps/web-editor run typecheck` -> failed on pre-existing workspace-wide errors outside touched storyboard files; filtered `rg 'src/features/storyboard/(components/(StoryboardPage|StoryboardPlan|storyboardPageStyles)|hooks/useStoryboardKeyboard)'` output was empty.
- review fix: moved plan control styles into `StoryboardPlanControls.styles.ts`, converted new component prop shapes to interfaces, and switched StoryboardPage/workspace cross-directory imports to `@/features/storyboard/*`.
- caveat: the first focused test run failed because local dependencies were missing `@xyflow/react`; `npm install` restored node_modules, and the accidental lockfile diff was removed before final status.
- active task: removed only `STAGE2-SCENES-4` from `docs/active_task.md`; E2E subtask remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Scenes — STAGE2-SCENES-5 (2026-05-14)
- added: focused Playwright coverage in `e2e/storyboard-plan-scenes.spec.ts` for applying generated Step 2 scenes through the UI without calling OpenAI.
- added: storyboard E2E helpers for reading the authenticated user, opening a local MySQL connection, seeding a completed `storyboard_plan_jobs` row, deleting seeded jobs, and reading the persisted storyboard graph for edge-order assertions.
- covered: mocked planning start/poll lifecycle reaches queued, running, and completed; real `POST /storyboards/:draftId/apply-latest-plan` is delayed/proxied so the applying overlay is asserted; overlay blocks covered Add Block clicks and Step 3 while Back/Home remain enabled; final canvas scene count/names, persisted START -> scene 1 -> scene 2 -> scene 3 -> END graph, edge count/order, API history snapshot, and visible history row are asserted.
- tests: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/helpers/storyboard.ts e2e/storyboard-plan-scenes.spec.ts` -> passed.
- tests: `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-plan-scenes.spec.ts` -> failed in Playwright global setup because `POST http://localhost:3001/auth/login` reset the connection (`fetch failed`, `ECONNRESET`); local API was not usable for the requested E2E run.
- typecheck: `npm run typecheck -w apps/web-editor -- --noEmit` -> failed on pre-existing workspace-wide errors outside touched E2E files; focused E2E compile above passed.
- active task: removed only `STAGE2-SCENES-5` from `docs/active_task.md`; remaining final-validation notes were left intact.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Stage 2 Storyboard Scenes — Final Validation (2026-05-14)
- tests: `npm --workspace packages/project-schema test -- storyboardPlan` -> 1 file / 15 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 107 tests passed.
- tests: `npm --workspace apps/api test -- storyboard.service.plan-apply generationDraft.storyboardPlan.service storyboardPlanJob.repository` -> 3 files / 24 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardPlanGeneration storyboard-api.test.ts StoryboardPage StoryboardPlan` -> 9 files / 79 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- typecheck: focused E2E compile `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/helpers/storyboard.ts e2e/storyboard-plan-scenes.spec.ts` -> passed.
- typecheck caveat: `npm --workspace apps/web-editor run typecheck` still fails on pre-existing storyboard test type errors; exact touched-file filter for the new/changed storyboard files produced no output.
- e2e caveat: `E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-plan-scenes.spec.ts` remains blocked in global setup because local API login resets the connection (`ECONNRESET`), so the spec body could not execute in this environment.
- active task: cleared `docs/active_task.md`; Stage 2 Block 4 storyboard scenes implementation subtasks are complete.

## Stage 2 Storyboard Illustrations — Autosave Mapping Fix (2026-05-14)
- fixed: `PUT /storyboards/:draftId` now preserves `storyboard_scene_illustration_jobs` rows for retained blocks while full-replacing the storyboard graph, preventing autosave from cascading away active image-generation mappings before later jobs attach their output.
- added: integration coverage that seeds an in-flight scene illustration mapping, saves the same block graph, and verifies the mapping still exists afterward.
- tests: `npm --workspace apps/api test -- storyboard.integration storyboardIllustration storyboard-illustration-endpoints` -> 3 files / 30 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-1 (2026-05-14)
- added: migration `040_storyboard_illustration_references.sql` with draft-level canonical reference mappings, source reference JSON, output file link, status lifecycle, and active draft lock uniqueness.
- added: `storyboardIllustrationReference.repository` with create, latest/active lookup, AI-job lookup, status updates, output updates, and mysql2 JSON string/object guards.
- covered: migration shape/idempotency, real MySQL active-draft uniqueness, retry after failed active-lock clearing, AI-job uniqueness, draft cascade delete, output file `SET NULL`, source reference JSON round-trip, repository lifecycle calls against MySQL, and ready output linkage.
- tests: `npm --workspace apps/api test -- migration-040 storyboardIllustrationReference` -> 2 files / 19 tests passed.
- note: an earlier `npm --workspace apps/api test -- migration-040` failed because MySQL was not listening on `127.0.0.1:3306`; after `docker compose up -d db` and healthy DB, the expanded command above passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STYLE-REF-1` from `docs/active_task.md`; `STYLE-REF-2` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-2 (2026-05-14)
- added: shared `StoryboardOpenAIImageJobPayload` for `storyboard-openai-image` jobs with style-reference/scene kind, reference file IDs, optional block/previous-scene file, prompt, and output size.
- added: API `storyboard-openai-image` BullMQ queue and enqueue helper using persisted `ai_generation_jobs.job_id` as the BullMQ job id.
- added: media-worker `processStoryboardOpenAIImageJob` direct OpenAI Images path using `model: 'gpt-image-2'`; text-only jobs call `images.generate`, referenced jobs call `images.edit` with image files read from object storage.
- added: worker-local repository split in `workerRepositories.ts` so workers keep using injected thin repository interfaces without importing API repositories.
- implemented: OpenAI output decode/download, S3 upload, `files` row creation, `ai_generation_jobs` completion/draft-file linkage, reference output update hook, sanitized failure persistence, and storyboard reference failure update.
- review fix: storyboard OpenAI image outputs now mark their `files` rows `ready` immediately after upload, since this path already owns the final PNG bytes and does not need media ingest.
- review fix: expanded media-worker coverage for missing reference files, unreadable object-storage references, malformed OpenAI image responses, failed OpenAI URL downloads, and worker repository SQL behavior.
- preserved: existing fal.ai/ElevenLabs `ai-generate` behavior remains on its existing queue and handler.
- tests: `npm --workspace packages/project-schema test -- job-payloads` -> 1 file / 15 tests passed.
- tests: `npm --workspace apps/api test -- enqueue-storyboard-openai-image` -> 1 file / 1 test passed.
- tests: `npm --workspace apps/media-worker test -- storyboardOpenAIImage workerRepositories` -> 2 files / 13 tests passed.
- build/typecheck: `npm --workspace packages/project-schema run build`, `npm --workspace packages/project-schema run typecheck`, `npm --workspace apps/media-worker run typecheck`, and `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STYLE-REF-2` from `docs/active_task.md`; `STYLE-REF-3` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-3 (2026-05-14)
- added: storyboard illustration service now creates/reuses a draft-level canonical reference before scene jobs are enqueued.
- implemented: text-only drafts enqueue `gpt-image-2` text-to-image reference jobs; drafts with linked ready image refs enqueue `gpt-image-2` image-edit reference jobs; video/audio refs are ignored for reference selection.
- guarded: missing/unlinked/not-ready image refs return 422 before creating jobs; scene prompt validation still runs before creating a reference; scene illustration jobs are skipped until the canonical reference is ready.
- integrated: reference mappings are persisted before enqueue, `ai_generation_jobs.draft_id` is set, and duplicate active reference races mark the extra DB job failed without duplicating queue work.
- refreshed: status reads now reconcile canonical reference mappings from `ai_generation_jobs` so stale ready/failed states repair during polling.
- review fix: explicit block illustration now validates the scene prompt before creating/reusing a canonical reference.
- review fix: added coverage for duplicate active reference races, endpoint-level first-reference creation/gating, explicit single-scene gating, and linked-but-not-ready image references.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboard-illustration-endpoints` -> 3 files / 35 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STYLE-REF-3` from `docs/active_task.md`; `STYLE-REF-4` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-4 (2026-05-14)
- confirmed: storyboard OpenAI image worker updates canonical reference mappings ready on success with `output_file_id`, and failed with sanitized error plus `active_lock = NULL`.
- confirmed: worker success/failure remains injected through thin worker-local repository interfaces and does not couple to the fal `ai-generate` path.
- added: API polling coverage for completed canonical reference jobs repairing stale mappings through `setReferenceOutput`.
- added: API polling coverage for failed canonical reference jobs updating status/error so references become retryable.
- review fix: storyboard OpenAI image worker now persists failed AI/reference state only on the final BullMQ attempt, preventing early `active_lock` clearing while Redis retries remain pending.
- covered: worker tests still verify output file creation/ready status, `ai_generation_jobs` completion/failure, reference ready/failed updates, and failure sanitization.
- tests: `npm --workspace apps/api test -- storyboardIllustration` -> 2 files / 29 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardOpenAIImage workerRepositories` -> 2 files / 14 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` and `npm --workspace apps/media-worker run typecheck` -> passed.
- active task: removed only `STYLE-REF-4` from `docs/active_task.md`; `STYLE-REF-5` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-5 (2026-05-14)
- changed: scene illustration jobs now use the direct `storyboard-openai-image` queue with `gpt-image-2` image-edit payloads instead of the standalone fal text-to-image submit path.
- implemented: scene generation is sequential in storyboard graph order from START to END, with sort-order fallback when a full graph path cannot be derived.
- implemented: scene 1 waits for the canonical reference output; later scenes wait for both the canonical reference and the previous ready scene output, then pass both file IDs to the OpenAI image-edit worker.
- preserved: ready scene outputs are skipped by bulk POST, failed scenes remain retryable per block, duplicate active scene mapping races fail the extra AI job without queueing duplicate work, and scene output attachment remains idempotent.
- wired: storyboard OpenAI image worker success/failure now updates scene illustration mappings through injected worker-local repository hooks, parallel to the canonical reference hooks.
- covered: API unit/integration tests for reference gating, graph ordering, next-scene-only enqueueing, previous-scene continuity refs, explicit block retry gating, direct scene job persistence, and endpoint DB assertions.
- covered: media-worker tests for scene output attach/failure hooks plus worker repository SQL for ready/failed scene mapping updates.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboard-illustration-endpoints` -> 3 files / 41 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardOpenAIImage workerRepositories` -> 2 files / 17 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` and `npm --workspace apps/media-worker run typecheck` -> passed.
- active task: removed only `STYLE-REF-5` from `docs/active_task.md`; `STYLE-REF-6` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-6 (2026-05-14)
- changed: `StoryboardIllustrationStatusResponse` now returns a required `reference` object alongside the existing scene `items` array.
- added: reference status shape includes `status`, `jobId`, `outputFileId`, `sourceReferenceFileIds`, and `errorMessage`, with endpoint tests covering ready and queued reference responses.
- updated: OpenAPI schemas, path descriptions, and examples now describe the canonical reference phase before sequential scene image generation.
- kept compatible: scene item shape remains unchanged, and web-editor storyboard types now include the reference object.
- review fix: `useStoryboardIllustrations` now derives lifecycle/polling from both the canonical reference and scene items, so a reference-only queued/running job remains blocking and continues polling.
- covered: hook tests now use the `{ reference, items }` response shape and include a reference-only active job regression that refreshes the storyboard when the reference output appears.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboard-illustration-endpoints` -> 3 files / 41 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 117 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations` -> 1 file / 8 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` and `npm --workspace packages/api-contracts run typecheck` -> passed.
- typecheck caveat: `npm --workspace apps/web-editor run typecheck` still fails on pre-existing unrelated workspace errors; filtered check for `useStoryboardIllustrations` and storyboard types produced no touched-file errors.
- active task: removed only `STYLE-REF-6` from `docs/active_task.md`; `STYLE-REF-7` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-7 (2026-05-14)
- confirmed: canonical reference mappings are draft-level rows and are not affected by storyboard block full-replace deletes.
- confirmed: existing storyboard full-replace logic snapshots scene illustration mappings before block deletion and restores mappings only for retained blocks after reinserting blocks.
- added: integration regression coverage for `PUT /storyboards/:draftId` preserving a completed canonical reference row and output file, preserving a retained active scene mapping, and allowing a deleted scene block mapping to cascade away.
- covered: retained scene mapping assertions verify original mapping id, block id, AI job id, status, and null output remain intact after autosave/full replace.
- tests: `npm --workspace apps/api test -- storyboard.integration storyboardIllustration` -> 3 files / 49 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STYLE-REF-7` from `docs/active_task.md`; `STYLE-REF-8` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-8 (2026-05-14)
- changed: web-editor illustration lifecycle now tracks both `status` and `phase` (`reference` vs `scene`) so Step 2 can distinguish canonical reference creation from scene illustration generation.
- implemented: hook polling treats reference jobs as blocking, refreshes storyboard when reference or scene outputs first appear, and auto-continues by calling the start endpoint again after the reference becomes ready so the next eligible scene job is queued.
- implemented: automatic scene-start continuation failures now clear the blocking state, surface a failure, and keep the retry path on the main illustration control.
- updated: illustration control copy now shows "Creating visual style reference" during reference work and "Generating scene illustrations" during scene work.
- updated: failed references show a main `Retry` CTA; failed scene generation disables the main CTA so retry remains scoped to the failed scene block.
- preserved: Back/Home remain available while illustration work blocks Step 3, and per-scene retry buttons remain on `SceneBlockNode`.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan SceneBlockNode` -> 4 files / 54 tests passed.
- typecheck caveat: `npm --workspace apps/web-editor run typecheck` still fails on pre-existing unrelated workspace errors; filtered check for touched storyboard files produced no errors.
- active task: removed only `STYLE-REF-8` from `docs/active_task.md`; `STYLE-REF-9` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-9 (2026-05-14)
- added: compact canonical reference preview inside the Step 2 illustration control, using existing dark tokens, 8px radius, and no nested card structure.
- implemented: ready canonical references render an authenticated `/assets/:id/thumbnail` image via `buildAuthenticatedUrl`.
- implemented: queued/running/missing references show compact fallback text, and thumbnail load failures fall back without breaking the control.
- added: stable `data-testid` hooks for the preview, image, and fallback states.
- review fix: control title text now clips with ellipsis to avoid overlap after adding the thumbnail preview.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.plan useStoryboardIllustrations StoryboardPlanControls` -> 2 files / 25 tests passed.
- typecheck caveat: `npm --workspace apps/web-editor run typecheck` still fails on pre-existing unrelated workspace errors; filtered check for touched storyboard files produced no errors.
- check: `git diff --check -- apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.styles.ts apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.tsx apps/web-editor/src/features/storyboard/components/StoryboardPage.plan.test.tsx` -> passed.
- active task: removed only `STYLE-REF-9` from `docs/active_task.md`; `STYLE-REF-10` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-10 (2026-05-14)
- added: E2E coverage in `e2e/storyboard-illustrations.spec.ts` for the reference-driven storyboard illustration flow without live provider calls.
- covered: text-only canonical reference progress into scene generation, reference preview thumbnail, Step 3 gating during reference and scene work, failed scene retry, final scene thumbnails, and Back/Home availability while generation blocks only Step 3.
- covered: failed canonical reference state from the main illustration control, including failed preview fallback, Step 3 gating, retry click while still failed, recovery through reference progress, and continuation into scene generation.
- covered: multi-image-reference draft path by seeding two ready image files linked to the draft, storing `media-ref` prompt blocks, and asserting the merged canonical reference thumbnail URL.
- fixed: Step 3 navigation now remains disabled for failed illustration workflows while leaving Back/Home/canvas retry paths available; Step 3 re-enables only after all scene outputs are ready.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.plan useStoryboardIllustrations StoryboardPlanControls` -> 2 files / 25 tests passed.
- typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/helpers/storyboard.ts e2e/storyboard-illustrations.spec.ts` -> passed.
- playwright: `VITE_PUBLIC_API_BASE_URL=http://localhost:3002 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3002 npx playwright test e2e/storyboard-illustrations.spec.ts` -> 3 passed.
- check: `git diff --check -- apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx apps/web-editor/src/features/storyboard/components/StoryboardPage.plan.test.tsx e2e/storyboard-illustrations.spec.ts` -> passed.
- active task: removed only `STYLE-REF-10` from `docs/active_task.md`; `STYLE-REF-11` remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Consistent Storyboard Illustration Style Reference Pipeline — STYLE-REF-11 Final Regression (2026-05-14)
- verified: shared storyboard OpenAI image job payloads, OpenAPI storyboard illustration reference status contracts, API reference/scene orchestration, media-worker OpenAI Images processing, frontend reference/scene lifecycle UI, and E2E reference-driven user flows.
- confirmed: direct OpenAI Images API calls remain in `apps/media-worker/src/jobs/storyboardOpenAIImage.job.ts`; API code only enqueues `storyboard-openai-image` jobs and stores/reports canonical reference state.
- confirmed: no cross-app imports were found by the focused architecture scan.
- confirmed: reference and scene reconciliation paths are covered by focused API/media-worker tests for active-job guards, idempotent completion/failure updates, and retry behavior.
- tests: `npm --workspace packages/project-schema test -- job-payloads` -> 1 file / 15 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi fal-models` -> 6 files / 132 tests passed.
- tests: `npm --workspace apps/api test -- migration-040 storyboardIllustration storyboardIllustrationReference storyboard-illustration-endpoints storyboard.integration` -> 5 files / 64 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardOpenAIImage ai-generate` -> 6 files / 47 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan SceneBlockNode StoryboardPlanControls` -> 4 files / 57 tests passed.
- typecheck: focused E2E compile `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/helpers/storyboard.ts e2e/storyboard-illustrations.spec.ts` -> passed.
- playwright: `VITE_PUBLIC_API_BASE_URL=http://localhost:3002 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3002 npx playwright test e2e/storyboard-illustrations.spec.ts` hit local login rate limit after repeated reviewer runs; restarted a fresh clean API on `3003`, seeded the E2E user, and reran `VITE_PUBLIC_API_BASE_URL=http://localhost:3003 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3003 npx playwright test e2e/storyboard-illustrations.spec.ts` -> 3 passed.
- active task: cleared `docs/active_task.md`; all STYLE-REF subtasks are complete.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 1 Backend Automation Status and Idempotency (2026-05-21)
- changed: `startStoryboardPlan` now reuses an existing queued/running storyboard planning job for the draft instead of enqueueing duplicates on reload or repeated Step 2 entry.
- added: storyboard plan repository lookups for latest and active draft jobs.
- added: storyboard illustration status responses now include `automation.phase`, `planningJobId`, and `errorMessage`, covering `idle`, `planning`, `creating_principal_image`, `awaiting_principal_approval`, `generating_scene_illustrations`, `ready`, and `failed`.
- updated: OpenAPI and frontend storyboard types include the backend-derived automation status shape.
- review fix: planning job idempotency now uses a repository-owned transaction that locks the draft row with `FOR UPDATE` before checking or inserting active storyboard plan jobs, preventing concurrent duplicate enqueue races.
- review fix: `apps/web-editor` storyboard API response type now accepts reused active planning jobs with `status: 'running'`.
- review fix: expanded automation phase coverage for `idle`, `creating_principal_image`, `generating_scene_illustrations`, `ready`, and failed planning/reference/scene errors, plus terminal planning job retry coverage.
- review fix: newly reserved planning jobs are marked failed if BullMQ enqueueing throws, preventing orphaned active queued rows from blocking retries.
- tests: `npm --workspace apps/api test -- generationDraft.storyboardPlan storyboardIllustration storyboard-illustration-endpoints` -> 5 files / 63 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi storyboard` -> 6 files / 124 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan StoryboardPlanControls storyboard-api.test.ts` -> 3 files / 51 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed after tightening the reused-job status type.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- active task: removed only Subtask 1 from `docs/active_task.md`; Subtask 2 and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 2 Principal Approval Gate (2026-05-21)
- added: migration `041_storyboard_illustration_reference_approval.sql` with `approval_status` and `approved_at` on canonical storyboard references.
- changed: ready canonical/principal images default to `approval_status = pending`, including worker completion and stale status reconciliation paths.
- changed: bulk scene illustration generation now returns the `awaiting_principal_approval` phase without enqueueing scene jobs until the active ready principal image is approved.
- added: `POST /storyboards/:draftId/illustrations/principal-image/approve` to approve the active ready principal image and expose approval state in status responses.
- updated: OpenAPI, API service types, web storyboard response types, and media-worker reference update SQL for the approval state.
- fixed during validation: ready-reference polling no longer resets already approved references back to pending.
- review fix: `useStoryboardIllustrations` now requires `reference.approvalStatus === 'approved'` before auto-continuing scene generation, preventing repeated scene-start calls while approval is pending.
- review fix: added endpoint coverage proving bulk scene generation resumes after approval and service coverage proving explicit block scene generation remains blocked while approval is pending.
- review fix: added repository tests for transactional `reserveQueuedJob` insert, active-job reuse, rollback, and connection release.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboardIllustrationReference storyboard-illustration-endpoints storyboardPlanJob.repository generationDraft.storyboardPlan` -> 6 files / 86 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard` -> 2 files / 71 tests passed.
- tests: `npm --workspace apps/media-worker test -- workerRepositories storyboardOpenAIImage` -> 2 files / 17 tests passed.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan StoryboardPlanControls storyboard-api.test.ts` -> 3 files / 52 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` and `npm --workspace packages/api-contracts run typecheck` -> passed.
- active task: removed only Subtask 2 from `docs/active_task.md`; Subtask 3 and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 3 Principal Image Modal APIs (2026-05-21)
- added: principal image modal API actions for edit/regenerate, replace from an existing ready draft-linked image, and setting extra reference image IDs.
- implemented: edit/regenerate queues a `storyboard-openai-image` `gpt-image-2` image-edit job using the active principal image plus persisted extra references.
- implemented: replacement creates an auditable completed AI job linked to the selected ready draft image, deactivates the old principal reference, and clears approval on the new active reference.
- implemented: extra reference updates validate draft ownership, image kind, ready status, and non-deleted links through `draft_files`, then clear approval.
- updated: frontend storyboard API helpers and OpenAPI request/response contracts for the new principal-image endpoints.
- review fix: backend automation phase now reports `awaiting_principal_approval` instead of `ready` when scene outputs are ready but the active principal image is still pending approval.
- review fix: frontend illustration lifecycle no longer reports `completed` or auto-starts scenes unless the principal image is approved.
- review fix: principal image edit enqueue failures now mark the new AI job failed without deactivating the previous active principal reference or creating a failed active mapping.
- review fix: principal image references request validation now requires `fileIds`, matching the OpenAPI contract.
- review fix: added endpoint validation coverage for invalid UUID bodies, non-image files, processing files, other-draft files, other-user files, soft-deleted draft links, and soft-deleted files.
- review fix: added frontend API helper coverage for approve, edit, replace, references, and error handling.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboard-illustration-endpoints` -> 3 files / 63 tests passed.
- tests: `npm --workspace apps/media-worker test -- storyboardOpenAIImage workerRepositories` -> 2 files / 17 tests passed.
- tests: `npm --workspace packages/project-schema test -- job-payloads` -> 1 file / 15 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard` -> 2 files / 79 tests passed.
- tests: `npm --workspace apps/web-editor test -- storyboard-api.test.ts useStoryboardIllustrations` -> 2 files / 46 tests passed.
- typecheck: `npm --workspace apps/api run typecheck`, `npm --workspace apps/media-worker run typecheck`, and `npm --workspace packages/api-contracts run typecheck` -> passed.
- typecheck blocked: `npm --workspace apps/web-editor run typecheck` still fails on pre-existing unrelated editor/timeline test type errors such as `App.PreviewSection.test.tsx` missing `UseRemotionPlayerResult` fields and many stale `EphemeralState` fixtures missing `volume`/`isMuted`.
- active task: removed only Subtask 3 from `docs/active_task.md`; Subtask 4 and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 4 Auto-Start Step 2 and Remove Happy-Path Buttons (2026-05-21)
- changed: Step 2 now auto-starts storyboard planning when the loaded canvas contains exactly the START and END sentinels and no scene blocks.
- changed: auto-start is guarded by draft id and plan lifecycle status so rerenders, polling, and active mutations do not duplicate frontend start calls.
- changed: existing/custom storyboards no longer auto-trigger planning because any scene block makes the canvas ineligible.
- changed: visible happy-path `Generate scenes` and `Generate illustrations` buttons were removed from the standard storyboard controls.
- preserved: failed scene planning shows one `Retry` action; failed style-reference illustration generation shows one `Retry` action; scene failures remain scoped to scene block retry.
- preserved: Back and Home stay usable while generation is running, and Step 3 remains disabled while generation is blocking or failed.
- review fix: updated `e2e/storyboard-illustrations.spec.ts` and `e2e/storyboard-plan-scenes.spec.ts` so browser specs assert removed generate controls are absent and no longer click stale test ids.
- review fix: E2E storyboard illustration reference fixtures now include `approvalStatus`, with completed canonical references marked approved to match the production auto-continue gate.
- tests: `npm --workspace apps/web-editor test -- useStoryboardPlanGeneration useStoryboardIllustrations StoryboardPage.plan StoryboardPlanControls` -> 3 files / 36 tests passed.
- tests: `npm --workspace apps/web-editor test -- storyboard-api.test.ts` -> 1 file / 34 tests passed.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.plan useStoryboardIllustrations useStoryboardPlanGeneration StoryboardPage.navigation` -> 4 files / 43 tests passed.
- tests: `npm --workspace apps/api test -- generationDraft.storyboardPlan storyboardIllustration.service storyboard-illustration-endpoints` -> 4 files / 64 tests passed.
- typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-illustrations.spec.ts e2e/storyboard-plan-scenes.spec.ts` -> passed.
- check: `git diff --check -- apps/web-editor/src/features/storyboard docs/development_logs.md docs/active_task.md` -> passed.
- typecheck blocked: `npm --workspace apps/web-editor run typecheck` remains blocked by pre-existing unrelated editor/timeline test type errors documented under Subtask 3.
- active task: removed only Subtask 4 from `docs/active_task.md`; Subtask 5 and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 5 Principal Image Approval Modal (2026-05-21)
- added: `PrincipalImageApprovalModal` with authenticated principal image preview, broken-image fallback, prompt regeneration, replacement image picker, extra reference chips, and approve-and-continue action.
- added: modal styles aligned with the existing dark storyboard modal system, 8px radius, restrained controls, and no nested card layout.
- changed: `StoryboardPage` opens the modal when the principal image is ready and pending approval, blocks Step 3 while pending, and keeps the modal open in a loading state while a modal-triggered edit/regeneration job is queued or running.
- changed: approval calls the backend approval API, refreshes illustration status, and starts the existing scene illustration flow.
- changed: edit, replace, and reference update actions call the Subtask 3 backend helpers and refresh status after completion.
- changed: `AssetPickerModal` accepts optional draft-scoped listing props so principal image replacement/reference selection uses draft-linked images and upload-to-draft behavior.
- changed: `useAssets` includes media type in draft-scoped query keys and filters draft asset responses by requested media type, preventing image pickers from showing audio/video files.
- review fix: modal layout now switches to a single-column compact body for narrow screens, with a bounded square preview frame and accessible prompt label.
- review fix: approval continuation now keeps Step 3 blocked and shows an explicit modal error if scene illustration startup does not produce any started or ready scene items.
- review fix: `useStoryboardIllustrations.refresh()` now resumes polling when it observes queued/running principal or scene work, so modal edit/regenerate can recover from a queued image job back to the ready approval state.
- review fix: removed stale `useLocation` import after query-param planning auto-start was replaced by canvas-shape auto-start.
- tests: `npm --workspace apps/web-editor test -- PrincipalImageApprovalModal StoryboardPage.plan useStoryboardIllustrations storyboard-api.test.ts useAssets` -> 5 files / 80 tests passed.
- check: `git diff --check -- apps/web-editor/src/features/storyboard apps/web-editor/src/features/generate-wizard` -> passed.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "PrincipalImageApprovalModal|StoryboardPage.tsx|AssetPickerModal.tsx|useAssets.ts"` -> no new-file errors; workspace typecheck remains blocked by unrelated existing errors.
- active task: removed only Subtask 5 from `docs/active_task.md`; Subtask 6 and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 6 Automatic Scene Continuation After Approval (2026-05-21)
- changed: Step 3 now stays disabled until `useStoryboardIllustrations` reports `completed`, so users cannot continue while illustrations are idle, pending approval, running, failed, or missing ready scene outputs.
- preserved: principal image approval calls the existing scene illustration start flow without another user click.
- preserved: scene output refresh still invalidates storyboard data as new reference/scene outputs appear.
- preserved: failed scene retry remains scoped to the failed scene block; main illustration retry remains only for reference failures.
- changed: manual status refresh now resumes polling when it observes active reference/scene work, supporting modal-triggered regeneration and scene continuation.
- review fix: added focused hook coverage proving scene 2 automatically starts after scene 1 becomes ready and scene 2 is still queued without a job.
- review fix: automatic pending-scene continuation now waits until no scene jobs are active before starting the next queued scene.
- tests: `npm --workspace apps/web-editor test -- useStoryboardIllustrations StoryboardPage.plan SceneBlockNode StoryboardPage.navigation` -> 5 files / 75 tests passed.
- tests: `npm --workspace apps/api test -- storyboardIllustration storyboard-illustration-endpoints` -> 3 files / 63 tests passed.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "StoryboardPage.tsx|useStoryboardIllustrations.ts|SceneBlockNode|StoryboardPageFooter"` -> no touched-file errors; workspace typecheck remains blocked by unrelated existing errors.
- check: `git diff --check -- apps/web-editor/src/features/storyboard apps/web-editor/src/features/generate-wizard docs/development_logs.md docs/active_task.md` -> passed.
- active task: removed only Subtask 6 from `docs/active_task.md`; Subtask 7 remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Automated Storyboard Generation and Principal Image Approval — Subtask 7 E2E and Regression Coverage (2026-05-21)
- changed: `e2e/storyboard-illustrations.spec.ts` now keeps the principal reference pending until the modal approval action is clicked, covering the real principal approval gate instead of bypassing it with pre-approved fixture data.
- added: browser coverage for the automatic START+END Step 2 flow, removed happy-path generation buttons, principal modal display, approval-triggered scene generation, scene thumbnails, retry, and Step 3 gating.
- added: browser coverage for editing the principal image prompt, replacing the principal image, and adding extra reference images before approval; each action asserts scene generation has not started until approval.
- reused: existing API regression coverage for singular active storyboard planning and scene illustration jobs, and existing frontend coverage that prevents START+END auto-planning from firing twice or on custom storyboards.
- review fix: principal approval preview now preserves the full image with `objectFit: contain` instead of cropping the approval image.
- review fix: principal approval modal now traps Tab and Shift+Tab focus from the initially focused dialog and from the first/last focusable controls while `aria-modal` is active.
- tests: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-illustrations.spec.ts` -> passed.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.plan useStoryboardIllustrations PrincipalImageApprovalModal` -> 3 files / 42 tests passed.
- tests: `npm --workspace apps/api test -- generationDraft.storyboardPlan storyboardIllustration storyboard-illustration-endpoints` -> 5 files / 77 tests passed.
- e2e: `VITE_PUBLIC_API_BASE_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-illustrations.spec.ts --project=chromium` -> 4 passed.
- e2e note: requested validation port 3002 was not running locally (`ECONNREFUSED`); the focused spec passed against the running local API on port 3001.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "storyboard-illustrations.spec.ts|StoryboardPage.plan|useStoryboardIllustrations|PrincipalImageApprovalModal|StoryboardPage.tsx"` -> no touched-file errors; workspace typecheck remains blocked by unrelated existing errors.
- check: `git diff --check -- e2e/storyboard-illustrations.spec.ts apps/web-editor/src/features/storyboard docs/development_logs.md docs/active_task.md` -> passed.
- active task: removed Subtask 7 from `docs/active_task.md`; no active task remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-1 (2026-05-22)
- added: migration `042_generation_draft_created_project.sql` with nullable `created_project_id` and `created_project_version_id` completion pointers on `generation_drafts`, plus an index for created project lookup.
- changed: generation draft repository reads now expose `createdProjectId` and `createdProjectVersionId`, and Step 3 can lock a draft row with `FOR UPDATE` before assembly.
- added: transaction-aware repository helpers for creating project rows, linking project files, inserting current clip rows, and marking draft project assembly complete.
- preserved: services still own transaction boundaries; repository helpers accept a caller-provided `PoolConnection`.
- tests: `npm --workspace apps/api test -- migration-042 generationDraft.repository project.repository version.repository clip.repository fileLinks.repository` -> 8 files / 90 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- check: `git diff --check -- apps/api/src/db/migrations/042_generation_draft_created_project.sql apps/api/src/repositories/generationDraft.repository.ts apps/api/src/repositories/project.repository.ts apps/api/src/repositories/version.repository.ts apps/api/src/repositories/fileLinks.repository.ts apps/api/src/repositories/clip.repository.ts apps/api/src/repositories/generationDraft.repository.test.ts apps/api/src/repositories/project.repository.test.ts apps/api/src/repositories/clip.repository.test.ts apps/api/src/services/generationDraft.service.fixtures.ts apps/api/src/__tests__/integration/migration-042.test.ts` -> passed.
- active task: removed only `STAGE3-PROJECT-1` from `docs/active_task.md`; `STAGE3-PROJECT-2` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-2 (2026-05-22)
- added: `storyboardGraph.service.ts` with reusable START-to-END scene ordering and sort-order fallback for incomplete/invalid graphs.
- changed: storyboard illustration service now uses the shared graph ordering helper.
- added: pure `storyboardProjectDoc.service.ts` that converts ready storyboard scene outputs into a validated image-clip `ProjectDoc`, matching `project_clips_current` insert rows, used file ids, and a derived title.
- implemented: 30fps duration rounding, sequential start frames, aspect-ratio dimensions, UUID ids, generated scene output file usage, missing-output rejection, no database writes.
- tests: `npm --workspace apps/api test -- storyboardGraph storyboardProjectDoc storyboardIllustration` -> 4 files / 63 tests passed.
- tests: `npm --workspace packages/project-schema test -- project-doc` -> 1 file / 13 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- check: `git diff --check -- apps/api/src/services/storyboardGraph.service.ts apps/api/src/services/storyboardGraph.service.test.ts apps/api/src/services/storyboardProjectDoc.service.ts apps/api/src/services/storyboardProjectDoc.service.test.ts apps/api/src/services/storyboardIllustration.service.ts docs/active_task.md docs/development_logs.md` -> passed.
- active task: removed only `STAGE3-PROJECT-2` from `docs/active_task.md`; `STAGE3-PROJECT-3` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-3 (2026-05-22)
- added: authenticated `POST /storyboards/:draftId/project` route and controller returning `{ projectId, versionId }`.
- added: `storyboardProject.service.ts` transaction flow that locks the draft, returns existing completion ids, validates ready/approved storyboard illustration state, creates the project, links generated scene output files, inserts current image clip rows, inserts the initial version snapshot/audit row, and marks the draft completed.
- review fix: project assembly now reads storyboard blocks, edges, active reference, and latest illustration jobs through the same transaction connection with `FOR UPDATE` helpers before committing completion, preventing concurrent autosave/reconciliation races from changing source rows mid-assembly.
- added: OpenAPI path and `StoryboardProjectCreateResponse` schema coverage.
- added: integration coverage for happy path persistence, idempotent retry, 422 readiness failures, auth/wrong-owner/missing semantics, and latest-version hydration of the assembled `ProjectDoc`.
- tests: `npm --workspace packages/api-contracts test -- openapi.storyboard` -> 2 files / 86 tests passed.
- tests: `npm --workspace apps/api test -- storyboardProject storyboard-project` -> 3 files / 16 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- check: `git diff --check -- apps/api/src/services/storyboardProject.service.ts apps/api/src/services/storyboardProject.service.test.ts apps/api/src/controllers/storyboardProject.controller.ts apps/api/src/routes/storyboard.routes.ts apps/api/src/__tests__/integration/storyboard-project.integration.test.ts packages/api-contracts/src/openapi.ts packages/api-contracts/src/openapi.storyboard.paths.test.ts packages/api-contracts/src/openapi.storyboard.schemas.test.ts docs/active_task.md docs/development_logs.md` -> passed.
- active task: removed only `STAGE3-PROJECT-3` from `docs/active_task.md`; `STAGE3-PROJECT-4` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-4 (2026-05-22)
- added: typed web helper `createProjectFromStoryboard()` for `POST /storyboards/:draftId/project`.
- added: `GenerateProjectFromStoryboardPage` on the existing `/generate/road-map` route, reading `draftId` from the query string, assembling once per draft, showing compact loading/error states, and navigating to `/editor?projectId=<id>` on success.
- implemented: React Strict Mode request dedupe, retry after failed assembly, missing-draft handling without API calls, and back actions to `/generate` or `/storyboard/:draftId`.
- changed: `/generate/road-map` route now renders the Step 3 assembly page instead of the old placeholder.
- tests: `npm --workspace apps/web-editor test -- GenerateProjectFromStoryboardPage storyboard-api` -> 2 files / 41 tests passed.
- typecheck scan: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "GenerateProjectFromStoryboardPage|storyboard/api|storyboard/types|main.tsx" || true` -> no touched-file errors; workspace typecheck remains subject to known unrelated editor/timeline test type debt.
- check: `git diff --check -- apps/web-editor/src/features/generate-wizard/components/GenerateProjectFromStoryboardPage.tsx apps/web-editor/src/features/generate-wizard/components/GenerateProjectFromStoryboardPage.test.tsx apps/web-editor/src/features/generate-wizard/components/GenerateRoadMapPlaceholder.test.tsx apps/web-editor/src/features/storyboard/api.ts apps/web-editor/src/features/storyboard/types.ts apps/web-editor/src/features/storyboard/__tests__/storyboard-api.test.ts apps/web-editor/src/main.tsx docs/active_task.md docs/development_logs.md` -> passed.
- active task: removed only `STAGE3-PROJECT-4` from `docs/active_task.md`; `STAGE3-PROJECT-5` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-5 (2026-05-22)
- changed: `StoryboardPage.handleNext` now navigates to `/generate/road-map?draftId=<draftId>` once Step 3 is enabled.
- preserved: Step 3 remains disabled until storyboard illustrations complete; Back and Home navigation behavior is unchanged.
- tests: `npm --workspace apps/web-editor test -- StoryboardPage.navigation StoryboardPage.plan` -> 2 files / 29 tests passed.
- check: `wc -l apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` -> 300 lines.
- check: `git diff --check -- apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx apps/web-editor/src/features/storyboard/components/StoryboardPage.navigation.test.tsx apps/web-editor/src/features/storyboard/components/StoryboardPage.plan.test.tsx docs/active_task.md docs/development_logs.md` -> passed.
- active task: removed only `STAGE3-PROJECT-5` from `docs/active_task.md`; `STAGE3-PROJECT-6` and later remain.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-6 (2026-05-22)
- added: `useProjectInit` regression coverage proving an assembled storyboard project hydrates from its saved latest version without calling blank project creation, while preserving URL project id authority and current version id.
- added: `useRemotionPlayer` regression coverage proving assembled image clips resolve authenticated `/assets/:id/stream` URLs.
- extended: storyboard project integration happy path now patches an assembled image clip row through the normal clip endpoint and verifies the created project appears in `/projects` with a null thumbnail fallback when generated files do not yet have thumbnail data.
- tests: `npm --workspace apps/web-editor test -- useProjectInit useRemotionPlayer` -> 3 files / 52 tests passed.
- tests: `npm --workspace apps/api test -- clip-patch-endpoint projects-list-endpoint storyboard-project` -> 3 files / 33 tests passed.
- check: `git diff --check` -> passed.
- active task: removed only `STAGE3-PROJECT-6` from `docs/active_task.md`; `STAGE3-PROJECT-7` remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — STAGE3-PROJECT-7 (2026-05-22)
- added: focused Playwright coverage in `e2e/storyboard-project.spec.ts` for the Step 2 to editor handoff without live provider calls.
- covered: Step 3 remains disabled while a scene illustration is still running, then enables after mocked illustration polling completes.
- covered: clicking `Next: Step 3` calls project assembly, navigates to `/editor?projectId=<id>`, hydrates the saved assembled `ProjectDoc`, and renders one image timeline clip per scene in order.
- covered: failed project assembly shows retry and back-to-storyboard controls; retry reuses the route and succeeds.
- review fix: the E2E mock now fails unexpected API requests instead of falling through to the live API, and the editor assertion now requires exactly two ordered image timeline clips.
- validation prep: local E2E seed user existed with invalid credentials, so the expected `apps/web-editor/e2e/seed-test-user.sql` password hash was restored via the repo `mysql2` dependency before running Playwright.
- typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-project.spec.ts e2e/helpers/storyboard.ts` -> passed.
- e2e: `VITE_PUBLIC_API_BASE_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-project.spec.ts --project=chromium` -> 2 tests passed.
- check: `git diff --check` -> passed.
- active task: removed `STAGE3-PROJECT-7` from `docs/active_task.md`; only final validation remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Step 3 Storyboard Project Creation — Final Validation (2026-05-22)
- tests: `npm --workspace packages/project-schema test` -> 7 files / 134 tests passed.
- tests: `npm --workspace packages/api-contracts test -- openapi` -> 5 files / 135 tests passed.
- tests: `npm --workspace apps/api test -- storyboardProject storyboard-project clip-patch-endpoint projects-list-endpoint` -> 5 files / 46 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- typecheck: `npm --workspace packages/api-contracts run typecheck` -> passed.
- tests: `npm --workspace apps/web-editor test -- GenerateProjectFromStoryboardPage StoryboardPage.navigation StoryboardPage.plan useProjectInit useRemotionPlayer storyboard-api` -> 7 files / 122 tests passed.
- e2e typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-project.spec.ts e2e/helpers/storyboard.ts` -> passed.
- e2e: `VITE_PUBLIC_API_BASE_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-project.spec.ts --project=chromium` -> 2 tests passed.
- check: `git diff --check` -> passed.
- note: `npm --workspace apps/web-editor run typecheck` still fails on pre-existing unrelated test/type debt in App, asset-manager, timeline, AI generation, and related test fixtures; a touched-file scan confirmed no remaining new assembled-project fixture type error, but pre-existing touched test files still contain older fixture debt in `useProjectInit` and `useRemotionPlayer`.

## Storyboard Step 3 LTX-2 Duration Mapping — STB-LTX-DUR-1 (2026-05-25)
- implemented: `buildStoryboardVideoOptions()` now keeps existing `duration` enum/number mapping when the selected model exposes `duration`, and falls back to schema-present frame controls only when `duration` is absent.
- implemented: LTX-2 receives `fps` from the schema default and derives `num_frames` from storyboard `durationS`, so a 6-second scene produces `fps: 25` and `num_frames: 150`.
- implemented: models with `num_frames` plus `frames_per_second` use the same duration-to-frame helper, with derived numeric values clamped by each target field's `min`/`max`.
- covered: focused service tests assert LTX-2 frame options validate against `validateFalOptions()`, Kling/PixVerse duration behavior is preserved, unsupported audio still rejects, and active-job dedupe/preflight behavior remains covered.
- review fix: extracted storyboard video option/duration mapping into `storyboardVideoOptions.service.ts` and split option-builder coverage into `storyboardVideo.options.test.ts` with shared fixtures, bringing touched files under the 300-line cap.
- tests: `npm --workspace apps/api test -- storyboardVideo falOptions` -> 3 files / 23 tests passed.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- active task: removed only `STB-LTX-DUR-1` from `docs/active_task.md`; `STB-LTX-DUR-2` remains next.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Storyboard Step 3 LTX-2 Duration Mapping — STB-LTX-DUR-2 (2026-05-25)
- covered: focused option tests now document that storyboard `durationS` is converted by selected model schema, not by one universal provider option.
- covered: LTX-2 `durationS: 6` explicitly asserts `fps: 25`, `num_frames: 150`, and no `duration` field.
- covered: duration-field models keep using `duration`; Kling keeps enum duration output and PixVerse clamps numeric duration to `15` without frame fields.
- covered: Wan exercises the existing catalog `num_frames` + `frames_per_second` path and clamps a 20-second scene to `num_frames: 161` at `frames_per_second: 16`.
- integration scope: did not touch `apps/api/src/__tests__/integration/storyboard-video-endpoints.test.ts` because it is already 389 lines and focused service tests cover both option building and the `submitGeneration()` options pass-through without worsening an over-cap file.
- tests: `npm --workspace apps/api test -- storyboardVideo storyboard-video aiGeneration falOptions` -> 9 files / 78 tests passed; BullMQ printed the existing Redis 6.2 recommendation for local Redis 6.0.16.
- typecheck: `npm --workspace apps/api run typecheck` -> passed.
- check: `git diff --check` -> passed.
- active task: removed only `STB-LTX-DUR-2` from `docs/active_task.md`; `STB-LTX-DUR-3` remains next.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Storyboard Step 3 LTX-2 Duration Mapping — STB-LTX-DUR-3 (2026-05-25)
- implemented: `Step3GenerationModal` now classifies selected model duration behavior from schema fields: direct `duration`, frame-count `num_frames` plus `fps`/`frames_per_second`, or no recognized duration control.
- implemented: Step 3 shows concise duration behavior copy under the Image to Video model selector using the existing dark modal style, 8px radius, and warning-colored text for provider-default duration cases.
- preserved: generation remains enabled for models without recognized duration controls, and audio checkbox behavior is unchanged.
- refactor: moved Step 3 modal styles to `Step3GenerationModal.styles.ts` so the touched TS/TSX files stay under the 300-line cap.
- review fix: added JSDoc for exported duration behavior helper and changed Step 3 styles to preserve exact keys with `satisfies Record<string, React.CSSProperties>`.
- tests: `npm --workspace apps/web-editor test -- Step3GenerationModal` -> 1 file / 4 tests passed.
- typecheck: `npm --workspace apps/web-editor run typecheck 2>&1 | rg "Step3GenerationModal|useStep3Generation|storyboard/types" || true` -> no matching output.
- active task: removed only `STB-LTX-DUR-3` from `docs/active_task.md`; `STB-LTX-DUR-4` remains next.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

## Storyboard Step 3 LTX-2 Duration Mapping — STB-LTX-DUR-4 (2026-05-25)
- validated: LTX-2 storyboard duration mapping regression coverage after implementation subtasks, including backend option mapping, Step 3 modal behavior, and focused project-handoff E2E.
- review fix: updated `e2e/storyboard-project.spec.ts` so only the configured API origin handles `GET /files/:id/stream` with the real `{ url }` JSON contract, while frontend-relative stream requests remain unexpected and `https://signed.test/files/:id/stream` is fulfilled separately as `image/png` when the browser loads the signed URL.
- review fix: aligned the unexpected API request guard with `E2E_API_ORIGIN` so non-default `E2E_API_URL` runs still collect unexpected API requests after the stream mock moved to the configured origin.
- covered: the image handoff E2E now asserts both signed URLs are returned by the API mock and subsequently requested as signed image loads, keeping the `useFileStreamUrl` JSON contract covered while preserving the unexpected API request guard.
- tests: `npm --workspace apps/api test -- storyboardVideo storyboard-video aiGeneration falOptions` -> 9 files / 78 tests passed; BullMQ printed the existing Redis 6.2 recommendation for local Redis 6.0.16.
- tests: `npm --workspace apps/web-editor test -- Step3GenerationModal StoryboardPage.plan GenerateProjectFromStoryboardPage` -> 3 files / 37 tests passed.
- typecheck: `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck e2e/storyboard-project.spec.ts` -> passed after the corrected stream mock contract.
- e2e: `VITE_PUBLIC_API_BASE_URL=http://localhost:3001 E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3001 npx playwright test e2e/storyboard-project.spec.ts --project=chromium` -> 4 tests passed with the corrected API JSON plus signed image mock split.
- check: `git diff --check` -> passed.
- services: local API `http://localhost:3001` initially returned 429 in Playwright global setup due to the in-memory login limiter; restarted the existing `cliptalecom-v2-api-1` container, then the requested E2E command passed against API `3001` and Vite `5173`.
- active task: removed `STB-LTX-DUR-4` from `docs/active_task.md`; no active task remains.
- checked by code-quality-expert - APPROVED
- checked by qa-reviewer - APPROVED
- checked by design-reviewer - APPROVED
- checked by playwright-reviewer - APPROVED

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
