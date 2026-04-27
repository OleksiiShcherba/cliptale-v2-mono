# Development Log (compacted — 2026-03-29 to 2026-04-25)

## Monorepo + DB Migrations
- added: root config, apps (api/web-editor/media-worker/render-worker), packages (project-schema, remotion-comps)
- added: migrations 001–036 — projects, assets, captions, versions, render_jobs, clips, users/sessions/auth, ai_generation_jobs, files/pivots, soft-delete, thumbnails, storyboard tables (blocks/edges/media/history), scene_templates/media
- fixed: APP_ env prefix; Zod startup validation; workspace→file paths

## Infrastructure
- added: Redis healthcheck, BullMQ error handlers, graceful shutdown, S3 stream + Range endpoint
- fixed: `@/` alias + `tsc-alias`; in-process migration runner + `schema_migrations` (sha256)

## Asset Upload + Browser UI
- added: S3 ingest pipeline (FFprobe → thumbnail → waveform); CRUD endpoints; presign + stream
- added: `features/asset-manager/` — AssetCard, AssetDetailPanel, UploadDropzone, UploadProgressList, AssetBrowserPanel
- added: asset rename (`displayName`); soft-delete/restore (30-day TTL, GoneError 410); `files` root table + `project_files`/`draft_files` pivots
- added: paginated envelope `{ items, nextCursor, totals }`; keyset cursor; `staleTime 60s`
- fixed: S3 CORS authoritative (`infra/s3/cors.json`); buildAuthenticatedUrl on all media elements

## VideoComposition + Preview + Stores
- added: `VideoComposition.tsx` (z-order, trim, image branch); `project-store.ts` (Immer patches); `ephemeral-store.ts`; `history-store.ts` (undo/redo)
- added: `useRemotionPlayer.ts`, `PreviewPanel.tsx`, `PlaybackControls.tsx`, `VolumeControl.tsx`, `usePrefetchAssets.ts`
- fixed: rAF tick; waitUntilDone() call; playhead freezing

## Timeline Editor
- added: `clip.repository.ts`, `clip.service.ts`, clips routes; PATCH + POST clip endpoints
- added: TimelineRuler, TrackHeader, ClipBlock, WaveformSvg, ClipLane, ClipContextMenu, TrackList, TimelinePanel, ScrollbarStrip
- added: useSnapping, useClipDrag, useClipTrim, useClipDeleteShortcut, useScrollbarThumbDrag, useTrackReorder, useTimelineWheel
- fixed: float→Math.round; split edge case; passive wheel; context menu portal; clip scroll sync; ruler seek

## Captions / Transcription
- added: `POST /assets/:id/transcribe` (202); `transcribe.job.ts` (S3 → Whisper → DB); word timestamps
- added: `CaptionEditorPanel.tsx`, `CaptionLayer.tsx` (per-word color, premountFor), `useAddCaptionsToTimeline.ts`

## Version History + Autosave
- added: version CRUD + restore; `useAutosave.ts` (2s debounce, beforeunload flush)
- added: `VersionHistoryPanel.tsx`, `RestoreModal.tsx`, `TopBar.tsx`, `SaveStatusBadge.tsx`

## Background Render Pipeline
- added: render CRUD (per-user 2-concurrent limit); `render.job.ts` (Remotion → S3); render-worker Docker
- added: `useExportRender.ts`, `RenderProgressBar.tsx`, `ExportModal.tsx`, `RendersQueueModal.tsx`
- fixed: REMOTION_ENTRY_POINT; black screen (presigned URLs); download URLs

## Authentication (Epic 8)
- added: session-based auth (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12); rate limiting
- added: auth routes (register/login/logout/me); password-reset + email-verify (single-use)
- added: OAuth (Google + GitHub); Bearer injection + 401 interceptor; `APP_DEV_AUTH_BYPASS`
- added FE: LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; AuthProvider, ProtectedRoute

## AI Platform — Epic 9 (fal.ai + ElevenLabs)
- removed: BYOK layer; added `APP_FAL_KEY`, `APP_ELEVENLABS_API_KEY`
- added: `fal-models.ts` (9 models), `elevenlabs-models.ts`; unified AI_MODELS (13); `falOptions.validator.ts`; `aiGeneration.assetResolver.ts`
- added: `ai-generate-audio.handler.ts`; `voice.repository.ts`; `GET /ai/models`, `GET /ai/voices`
- added FE: `CapabilityTabs.tsx`, `ModelCard.tsx`, `AssetPickerField.tsx`, `SchemaFieldInput.tsx`; 28 unit tests

## Video Generation Wizard
- added: migration 019; `generationDraft.*` (repository/service/controller/routes — 5 routes)
- added: `features/generate-wizard/` — PromptEditor, WizardStepper, GenerateWizardPage, MediaGalleryPanel, AssetPickerModal, PromptToolbar, WizardFooter
- added: `EnhancePromptJobPayload`; `enhancePrompt.job.ts`; enhance rate-limit (10/hr); `EnhancePreviewModal.tsx`

## Home + Project Hub
- added: migration 020; `listForUser`; `listStoryboardCardsForUser`; `GET /generation-drafts/cards`
- added: `features/home/` — HomePage, HomeSidebar, ProjectCard, StoryboardCard; `/` → HomePage

## Backlog Batch (2026-04-20)
- A: migration 028; `userProjectUiState.*`; `GET/PUT /projects/:id/ui-state`; `useProjectUiState.ts` (800ms debounce)
- B: soft-delete/restore for assets, projects, drafts; `GoneError` 410; trash cursor + `TrashPanel.tsx`
- C: migration 030; `ingest.job.ts` ffmpeg thumbnail → S3; `findProjectsByUserId` correlated for thumbnailFileId
- D: `AssetDetailPanel` → `shared/asset-detail/`; `WizardAssetDetailSlot.tsx`
- E: scope toggle (general/project/draft) in AssetBrowserPanel + MediaGallery; fire-and-forget auto-link
- F: `getPanelStyle(compact)` factory — compact=320px sidebar, fluid=100%/720px wizard

## Storyboard Editor — Part A (2026-04-22)
- added: migrations 031–034; `storyboard.*` (repo/service/controller/routes); 5 REST endpoints
- added: `storyboard-styles.ts` (3 styles); `@xyflow/react@^12.10.2`
- added: StartNode, EndNode, SceneBlockNode, CanvasToolbar, GhostDragPortal, StoryboardPage
- added: `useStoryboardCanvas.ts`, `useAddBlock.ts`, `useStoryboardDrag.ts`, `useStoryboardKeyboard.ts`, `ZoomToolbar.tsx`
- added: `storyboard-store.ts` (useSyncExternalStore), `storyboard-history-store.ts` (MAX=50, 1s debounce)
- added: `useStoryboardAutosave.ts` (30s debounce); 102/102 tests
- fixed: `pool.execute` → `pool.query` for LIMIT params (mysql2 ER_WRONG_ARGUMENTS); Docker image rebuild for `@xyflow/react`
- added: 5 storyboard OpenAPI paths + 8 schemas; 89/89 api-contracts tests

## Storyboard Editor — Part B (2026-04-23)
- ST-B1: migrations 035–036 (scene_templates, media); `sceneTemplate.*`; 6 routes; 73/73 tests
- ST-B2: SceneTemplate types + 6 API functions in `storyboard/api.ts`; 20 tests
- ST-B3: `SceneModal.tsx` (6-file split); `useSceneModal.ts`; real thumbnails + CLIP badges in SceneBlockNode; 25 tests
- ST-B4: `useSceneTemplates.ts` (300ms debounce), `LibraryPanel.tsx` (4-file split); `addBlockNode` action; 23 tests
- ST-B5: `EffectsPanel.tsx` (3 style cards + Coming Soon); `selectedBlockId`/`setSelectedBlock`/`applyStyleToBlock`; 22 tests
- ST-B6: `hideTranscribe` prop on AssetDetailPanel/AssetBrowserPanel; `StoryboardAssetPanel.tsx`; scope toggle labels
- hotfix: `useStoryboardDrag.ts` — `nativeEvent.clientX` → raw DOM event clientX (React Flow v12 passes DOM not synthetic)

## Storyboard Editor — Part C (2026-04-23)
- ST-C1: `restoreFromSnapshot(snapshot)` in storyboard-store — atomically replaces nodes/edges/positions; 6 unit tests
- ST-C2: `useStoryboardHistoryFetch.ts` (React Query, staleTime 30s); `StoryboardHistoryPanel.tsx` (320px, restore via window.confirm); `StoryboardTopBar` extracted; 10 tests
- fixed: `restoreFromSnapshot` — proper Node/Edge reconstruction from StoryboardBlock/StoryboardEdge; `positions?` optional in CanvasSnapshot
- documented: `docs/architecture-rules.md` §9.7 approved exceptions table

## Storyboard Bug Fixes + Follow-ups (2026-04-24)
- ST-FIX-1: added `onNavigateHome` prop + Home button to `StoryboardPage.topBar.tsx`; tokens → `storyboardPageStyles.ts`; navigation tests split; 23 tests
- ST-FIX-2: `draggable: false → true` for START/END sentinels in `useStoryboardCanvas.blockToNode`, `storyboard-store.restoreFromSnapshot`, `storyboard-history-store.applySnapshot`; 4 new unit tests
- ST-FIX-3: refactored `useStoryboardAutosave` — signature `(draftId, nodes, edges)`; removed store subscription; test split: `.test.ts` + `.save-now.test.ts` + `.fixtures.ts`; 13 tests
- ST-FIX-4: `useAddBlock.ts` IDs → `crypto.randomUUID()`; `handleAddBlock` → `useHandleAddBlock.ts`; `StoryboardPage.save-on-add.test.tsx` (3 tests) + `useHandleAddBlock.test.ts` (4 tests)
- ST-FIX-5: `StoryboardHistoryPanel` `onRestore`; `useHandleRestore.ts` re-wires `onRemove` + `setNodes/setEdges/pushSnapshot/saveNow`; 18 tests
- ST-FIX-6: `e2e/storyboard-fixes.spec.ts` — 5 Playwright E2E tests (home button, sentinel draggable, block persistence, history restore, UI-click save)
- FOLLOW-1: `StoryboardPage.assetPanel.test.tsx` — added `vi.mock LibraryPanel`; 7/7 pass
- FOLLOW-2: `useStoryboardDrag.ts` — edge IDs → `crypto.randomUUID()`; `useStoryboardDrag.test.ts` (10 tests)

## Storyboard Layout Bug Fixes (2026-04-25)
- SB-BUG-A: `insertSentinelsAtomically(draftId)` — `SELECT COUNT(*) FOR UPDATE` + deadlock retry; `insertSentinelsInTx` in repo (§5); `dedupSentinels()` client-side filter; `useStoryboardCanvas.test.ts` (6 tests)
- SB-BUG-B: autosave debounce 30 000 → 5 000ms; `setTimeout(() => void saveNow(), 0)` on drag-end, connect, structural edge change; `useAddBlock.ts` saveNow param; timer tests updated

## Storyboard Status Advance (ST-BUG2c) (2026-04-25)
- moved: `updateDraftStatus(draftId, 'step2')` from dead-code `initializeStoryboard` POST → `loadStoryboard` GET
- removed: `POST /:draftId/initialize` route, controller handler, FE `initializeStoryboard()` api.ts export
- added: `countSentinelBlocksForUpdate(conn, draftId)` in storyboard.repository.ts; `storyboard.service.status.test.ts` (5 tests)
- fixed: 4 E2E spec files — `initializeDraft()` helper updated from `POST /initialize` → `GET /storyboards/:draftId`

## Storyboard Runtime Bug Fixes (2026-04-25)
- fixed: `useStoryboardAutosave` durationS=0 → 5 for sentinel blocks (400 validation error)
- fixed: `useAddBlock.ts` draftId="" → pass real draftId from StoryboardPage (400 validation error)
- fixed: `handleConnect` in StoryboardPage — `id: crypto.randomUUID()` on addEdge call (400 invalid UUID edge IDs)
- fixed: `useSceneModal` — added `saveNow` param + `setTimeout(() => void saveNow(), 0)` after setNodes (Edit Scene Save not calling PUT)
- fixed: TDZ crash — moved `useSceneModal(setNodes, saveNow)` call to after `useStoryboardAutosave` in StoryboardPage
- fixed: mediaItem IDs — `${blockId}-media-${i}` → `crypto.randomUUID()` (400 invalid UUID)
- fixed: `storyboard.repository.types.ts` BlockInsert — added `mediaItems?: BlockMediaItem[]`; `replaceStoryboard` INSERT loop for media rows (mediaItems silently dropped in PUT)
- updated: `useSceneModal.test.ts` — added mockSaveNow param; UUID regex assertion for mediaItem IDs

## Storyboard Canvas Restore (ST-SB-BUG5) (2026-04-25)
- ST-SB-BUG5-1: `useSceneModal` now accepts `setNodes` — syncs React Flow `node.data.block` in-place after updateBlock; 8 tests
- ST-SB-BUG5-2: `useHandleRestore.ts` — `HandleRestoreOptions { skipSave?: boolean }`; `useStoryboardHistorySeed.ts` (new, 80L) fetches history on load, calls `handleRestore({ skipSave: true })` with hasSeeded guard; 10 new tests

## E2E Infrastructure + Coverage (2026-04-25)
- E2E-FIX-1: extracted `e2e/helpers/cors-workaround.ts` (`installCorsWorkaround` — IS_LOCAL_TARGET guard, auth/me mock, broad `localhost:3001/**` proxy) and `e2e/helpers/storyboard.ts` (`readBearerToken`, `createTempDraft`, `initializeDraft`, `cleanupDraft`, `waitForCanvas`) from `storyboard-fixes.spec.ts`; 6/6 existing E2E tests still pass
- E2E-FIX-2: added `installCorsWorkaround` + `readBearerToken` in `beforeEach` to `e2e/app-shell.spec.ts`, `e2e/asset-manager.spec.ts`, `e2e/preview.spec.ts`; 19/19 previously-failing tests now pass
- E2E-FIX-3: added 3 new tests to `e2e/storyboard-fixes.spec.ts` — Test 7 (PUT body: sentinel durationS ≥ 1 + UUID block IDs), Test 8 (Edit Scene modal Save triggers PUT ≤ 3s via saveNow), Test 9 (mediaItem round-trip via POST /files/upload-url for FK + GET assertion); 9/9 pass

## Architectural Decisions
- §9.7 300-line cap: `*.fixtures.ts` + `.<topic>.test.ts` splits; approved exceptions: `fal-models.ts` (1093L), `file.repository.ts` (306L), `useProjectInit.test.ts` (318L), `StoryboardCard.tsx` (319L), `storyboard-store.ts` (307L); e2e/*.spec.ts exempt
- Worker env: only `index.ts` reads config keys; handlers receive secrets via `deps`
- Migration runner: in-process + sha256 checksum; DDL non-transactional; INSERT after DDL
- Vitest: `pool: 'forks' + singleFork: true`; each split file has own `vi.hoisted()`
- Files-as-root: `files` user-scoped; `project_files`/`draft_files` pivots (CASCADE container, RESTRICT file)
- Soft-delete: `deleted_at IS NULL`; `*IncludingDeleted` helpers; 30-day TTL → GoneError 410
- mysql2: `pool.query` (not `execute`) for LIMIT params; JSON cols need `typeof==='string'` guard
- Auth: `buildAuthenticatedUrl()` required on all `/assets/:id/{thumbnail,stream}` media elements
- Store reset: `resetProjectStore(projectId) + resetHistoryStore()` BEFORE `fetchLatestVersion`
- `CanvasSnapshot.positions` optional — server omits it; `restoreFromSnapshot` falls back to `block.positionX/Y`
- Typography §3: 14/400 body, 12/500 label, 16/600 heading-3; 4px grid; radius-md 8px
- Per-file styles: hex constants at top of `.styles.ts`; no CSS custom properties in web-editor
- DEV_AUTH_BYPASS injects `dev-user-001`; all test assertions must expect that id
- E2E CORS: `page.request.fetch()` + `page.route()` with `access-control-allow-origin: *`; PUT requests use `page.request.put` (server-side, bypasses browser CORS)
- Storyboard autosave: `useStoryboardAutosave` reads React state via params+refs, NOT external store subscription
- Storyboard IDs: blocks and edges always `crypto.randomUUID()` at creation — server schema requires UUID
- Immediate save pattern: extract callback to `useHandle*.ts` hook; `setTimeout(() => void saveNow(), 0)` defers save until after React re-render
- Sentinel init: `loadStoryboard` auto-initializes START/END atomically via `SELECT ... FOR UPDATE` + deadlock retry; client-side `dedupSentinels()` as safety net
- Auto-restore skip-save: `handleRestore({ skipSave: true })` in seed path prevents DB overwrite before React re-render; manual restore always calls saveNow

## Known Issues / TODOs
- ACL middleware stub — real ownership check deferred (B3 it.todo 403 tests)
- `bytes` NULL after ingest (HeadObject needs worker bucket config)
- Lint fails — ESLint v9 config-migration error workspace-wide
- Pre-existing TS errors in `App.PreviewSection.test.tsx`, `App.RightSidebar.test.tsx`
- Stitch OQ-S1..S4 (dup Landing, tablet/mobile, secondary screens, spacing echo)
- Infinite scroll: BE pagination shipped; FE `fetchNextAssetsPage()` exported but unwired
- `parseStorageUri` duplicated across asset.service + file.service → candidate `lib/storage-uri.ts`
- `linkFileToProject` duplicated across timeline/api.ts + shared/file-upload/api.ts
- Hard-purge cron for soft-deleted rows past 30 days not implemented
- E2E image/audio timeline-drop tests skip when no assets linked to test project
- **ST-B5 TS2305**: `STORYBOARD_STYLES` import from api-contracts fails in container (stale dist); fix: rebuild api-contracts Docker image
- **Keyboard undo/redo broken**: `storyboard-history-store.applySnapshot` calls `storyboard-store.setNodes/setEdges` but React Flow renders from `useState` — Ctrl+Z/Y don't visually update canvas
- `initializeStoryboard` service function orphaned (no callers) — remove or add deprecation warning
- `StoryboardCard.tsx` (319L) exceeds §9.7 cap — formalize as approved exception in architecture-rules.md

## SB-UI-BUG-1 — Fix Library Add immediate canvas render
**Date:** 2026-04-27
**Branch:** fix/storyboard-ui-bugs

### What was done
- Lifted the `addToStoryboard` + canvas-update logic from `LibraryPanel.tsx` into `StoryboardPage.tsx` as a `handleAddFromLibrary(templateId)` `useCallback`.
- `handleAddFromLibrary` calls `addTemplateToStoryboard` (API), computes a sensible canvas position using `findInsertionPoint` + `nextSceneIndex` (same logic as `useAddBlock`), then calls `setNodes((prev) => [...prev, newNode])` so the React Flow canvas updates immediately.
- `setTimeout(() => void saveNow(), 0)` defers autosave until after React re-renders so `nodesRef.current` reflects the new state.
- `LibraryPanel` now accepts an `onAddTemplate: (templateId: string) => Promise<void>` prop; `handleAddToStoryboard` inside the panel delegates to it instead of calling `addBlockNode` from the store directly.
- `addBlockNode` import removed from `LibraryPanel.tsx` — the canvas is now always driven via `setNodes`.
- `LibraryPanel.test.tsx` updated: `addBlockNode` mock removed; `onAddTemplate` spy added to `defaultProps`; "add to storyboard" test asserts `onAddTemplate` called with correct templateId; new test asserts the Add button is disabled while the promise is in-flight.
- `StoryboardPage.save-on-add.test.tsx` extended with two new test cases: (a) `onAddTemplate` prop is passed to LibraryPanel mock when library tab is active; (b) invoking `onAddTemplate` calls `addTemplateToStoryboard` with correct params and triggers `saveStoryboard` via the deferred timer.

### Files created / modified
- `apps/web-editor/src/features/storyboard/components/LibraryPanel.tsx` — remove `addBlockNode` import; add `onAddTemplate` prop; delegate `handleAddToStoryboard` to prop
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — add `handleAddFromLibrary` callback; pass `onAddTemplate` prop to `<LibraryPanel>`; add `addTemplateToStoryboard` + `findInsertionPoint` + `nextSceneIndex` imports
- `apps/web-editor/src/features/storyboard/__tests__/LibraryPanel.test.tsx` — remove `addBlockNode` mock; add `onAddTemplate` spy; update assertions
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.save-on-add.test.tsx` — add `capturedOnAddTemplate` hoisted ref; extend LibraryPanel mock to capture prop; add 2 new test cases for library-add flow

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — 15 LibraryPanel tests + 5 StoryboardPage.save-on-add tests + 298 total storyboard tests pass; handleAddFromLibrary implementation verified (immediate canvas render via setNodes, deferred saveNow, correct positioning)

design-reviewer notes: Reviewed on 2026-04-27. All checks passed. Block positioning uses same 4px-grid defaults as useAddBlock (NEW_BLOCK_X_OFFSET=280, FALLBACK_X=60, FALLBACK_Y=200). Immediate canvas rendering is a UX improvement with no design token violations. Deferred autosave `setTimeout(..., 0)` matches established pattern. All colors, typography, spacing use design-guide tokens. No violations found.

Fix round 1: moved NEW_BLOCK_X_OFFSET, FALLBACK_X, FALLBACK_Y constants to module scope (§9 compliance).

**Post-fix verification (2026-04-25)**: Re-ran LibraryPanel.test.tsx + StoryboardPage.save-on-add.test.tsx after constants moved to module scope in StoryboardPage.tsx. Result: 20/20 tests pass. ✅ REGRESSION CLEAR.

**Re-verification (2026-04-27)**: Full storyboard test suite run after constants-to-module-scope fix. All 298 tests pass (LibraryPanel 15 + StoryboardPage.save-on-add 5 + other 278 storyboard tests). No regressions introduced by constant relocation. ✅ YES CONFIRMED.

## SB-UI-BUG-2 — Fix drag ghost: suppress original node position during drag
**Date:** 2026-04-27
**Branch:** fix/storyboard-ui-bugs

### What was done
- In `handleNodesChange` inside `StoryboardPage.tsx`, added a filter that strips `{ type: 'position', dragging: true }` changes before passing to `applyNodeChanges`. Named the filtered array `nonDraggingChanges` for clarity.
- `applyNodeChanges(nonDraggingChanges, prev)` is now called instead of `applyNodeChanges(changes, prev)` — so mid-drag mouse-move events no longer move the original node in React Flow state.
- `hasMoved` check and `saveNow` / `pushSnapshot` calls remain based on the original `changes` array — `dragging: false` events are still captured correctly for history and autosave.
- All other change types (select, remove, dimensions, reset) pass through unchanged because the filter is strictly `c.type === 'position' && c.dragging === true`.
- Created split test file `StoryboardPage.drag-filter.test.tsx` with 4 test cases covering: (a) mid-drag changes not passed to applyNodeChanges; (b) drag-end changes passed through; (c) non-position changes pass through; (d) mixed batch filtering.

### Files created / modified
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — added `nonDraggingChanges` filter in `handleNodesChange`; pass `nonDraggingChanges` to `applyNodeChanges`
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.drag-filter.test.tsx` — new split test file; 4 test cases for mid-drag suppression behaviour

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
checked by playwright-reviewer: YES — 4/4 unit tests pass (StoryboardPage.drag-filter.test.tsx); full storyboard E2E suite 9/9 pass (storyboard-fixes.spec.ts); handleNodesChange filter verified to suppress mid-drag position updates while preserving drag-end, select, and remove changes

design-reviewer notes: Reviewed on 2026-04-27. No visual design changes — pure interaction logic (mid-drag position suppression via change filtering). No tokens, colors, spacing, or typography affected. Behavior aligns with established "Immediate save pattern" (§9.7 log line 153). No Figma/Stitch gaps. All checks passed.

qa-reviewer notes: Reviewed 2026-04-27. All 4 unit tests pass (mid-drag suppression, drag-end pass-through, non-position pass-through, mixed batch filtering). Full storyboard test suite 302/302 pass — no regressions. Implementation correctly filters `{ type: 'position', dragging: true }` changes before `applyNodeChanges`, allowing drag-end (`dragging: false`) to pass through unchanged. Coverage complete: (a) mid-drag changes suppressed ✓, (b) drag-end changes applied ✓, (c) non-position changes pass through unchanged ✓.
