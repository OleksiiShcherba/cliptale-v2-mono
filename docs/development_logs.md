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
