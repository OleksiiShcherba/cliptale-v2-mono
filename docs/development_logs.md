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
- moved: `updateDraftStatus(draftId, 'step2')` from dead-code `initializeStoryboard` POST → `loadStoryboard` GET (where FE actually calls); `assertOwnership` now returns draft row
- removed: `POST /:draftId/initialize` route, controller handler, FE `initializeStoryboard()` api.ts export
- added: `countSentinelBlocksForUpdate(conn, draftId)` in storyboard.repository.ts (§5 — moved inline SQL from service)
- added: `storyboard.service.status.test.ts` (5 tests); `storyboard.service.fixtures.ts`
- fixed: 4 E2E spec files — `initializeDraft()` helper updated from `POST /initialize` → `GET /storyboards/:draftId`

## Storyboard Edit-Scene + Canvas Restore (ST-SB-BUG5) (2026-04-25)
- ST-SB-BUG5-1: `useSceneModal` now accepts `setNodes` — after `updateBlock(blockId, patch)` calls `setNodes` to sync React Flow `node.data.block` in-place; `StoryboardPage.tsx` passes `setNodes`; `useSceneModal.test.ts` (8 tests, new)
- ST-SB-BUG5-2: `useHandleRestore.ts` — added `HandleRestoreOptions { skipSave?: boolean }`; skips `saveNow()` when true; `useStoryboardHistorySeed.ts` (new, 80L) — fetches history on page load, calls `handleRestore({ skipSave: true })` with `hasSeeded` guard; `StoryboardPage.tsx` wires seed hook (297L); `useHandleRestore.test.ts` extended (+4 tests); `useStoryboardHistorySeed.test.ts` new (6 tests); StoryboardPage test files mocked for QueryClientProvider

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

---

## E2E-FIX-1 — Extract shared helpers and broaden CORS proxy
**Date:** 2026-04-25
**Branch:** fix/e2e-storyboard-coverage

### What was done
- Created `e2e/helpers/cors-workaround.ts` exporting `installCorsWorkaround(page, token)` that (a) mocks `**/auth/me` with the hardcoded dev-user payload and (b) proxies ALL `http://localhost:3001/**` requests to `E2E_API_URL/**` via `page.request`. IS_LOCAL_TARGET guard makes it a no-op for local dev. Broadened proxy from `/storyboards/**` (old) to `/**` (new) so all API routes (assets, projects, auth, etc.) are covered.
- Created `e2e/helpers/storyboard.ts` exporting `readBearerToken`, `createTempDraft`, `initializeDraft`, `cleanupDraft`, `waitForCanvas` — extracted verbatim from `storyboard-fixes.spec.ts` with the `__dirname` path adjusted for the `e2e/helpers/` subdirectory.
- Updated `e2e/storyboard-fixes.spec.ts` to import all helpers from the new modules; removed all duplicate function bodies; removed now-unused `fs`, `path`, and `Page` imports.

### Files created / modified
- `e2e/helpers/cors-workaround.ts` (new — 93 lines)
- `e2e/helpers/storyboard.ts` (new — 167 lines)
- `e2e/storyboard-fixes.spec.ts` (modified — imports updated, 194 lines removed)

checked by code-reviewer: YES
checked by qa-reviewer: YES
checked by design-reviewer: YES
design-reviewer notes: Reviewed on 2026-04-25. Pure test infrastructure (helpers, CORS proxy mock). Zero UI/component changes — no design tokens, colors, typography, or spacing to review.
checked by playwright-reviewer: YES
playwright-reviewer notes: All 6/6 E2E tests pass (13.5s) against deployed instance. Helper refactoring successful — no regressions introduced.
code-reviewer notes: All files compliant with architecture-rules.md §9. Helper file line counts under 300-line cap (cors-workaround: 93L, storyboard: 167L). E2E spec file properly structured (single test.describe block per §9 exemption). Function naming follows verb-first convention. Import ordering correct. JSDoc present on all exported functions. No relative imports crossing directory boundaries. No duplicate code in spec file.

---

## E2E-FIX-2 — Fix app-shell, asset-manager, preview specs (add CORS workaround)
**Date:** 2026-04-25
**Branch:** fix/e2e-storyboard-coverage

### What was done
- Added `beforeEach` blocks to all three failing spec files that call `readBearerToken()` then `installCorsWorkaround(page, token)` before any `page.goto()`.
- For `app-shell.spec.ts` (no existing `beforeEach`): a new `beforeEach` was added; each test retains its individual `page.goto()` call.
- For `asset-manager.spec.ts` and `preview.spec.ts` (existing `beforeEach` with `page.goto()`): the two workaround lines were inserted at the top, before the `page.goto()`.
- The `IS_LOCAL_TARGET` guard lives inside `installCorsWorkaround` — no conditional logic needed in the specs.
- No existing test assertions or logic were modified.

### Files created / modified
- `e2e/app-shell.spec.ts` (modified — added 2 imports + new `beforeEach` block)
- `e2e/asset-manager.spec.ts` (modified — added 2 imports + 2 lines at top of existing `beforeEach`)
- `e2e/preview.spec.ts` (modified — added 2 imports + 2 lines at top of existing `beforeEach`)

checked by code-reviewer: YES
checked by qa-reviewer: YES
checked by design-reviewer: YES
design-reviewer notes: Reviewed on 2026-04-25. Pure test infrastructure (E2E spec setup + CORS helper integration). Zero UI/component changes — no design tokens, colors, typography, spacing, or component structure to review.
code-reviewer notes: Reviewed on 2026-04-25. All three spec files (app-shell, asset-manager, preview) are fully compliant with §9 (import ordering, file structure) and §9.7 (E2E exemptions). Helper functions (readBearerToken, installCorsWorkaround) called in correct sequence before page.goto() per CORS proxy requirements. No dead code, no naming violations, no cross-boundary relative imports violating §9 — E2E helpers are co-located in same directory.
checked by playwright-reviewer: YES
playwright-reviewer notes: All 19/19 E2E tests pass (30.5s). app-shell (3 tests), asset-manager (11 tests), preview (5 tests) confirmed working against deployed instance. CORS workaround successfully enables FE-to-API communication in Playwright environment.

<!-- QA NOTES (auto-generated):
  - E2E infrastructure only (Playwright spec setup, CORS workaround). Out of scope for unit/integration test review.
  - No unit/integration tests changed or added.
  - Reviewed by qa-reviewer on 2026-04-25.
-->

---

## E2E-FIX-3 — Add storyboard E2E coverage for 2026-04-25 fixes
**Date:** 2026-04-25
**Branch:** fix/e2e-storyboard-coverage

### What was done
- Extended `e2e/storyboard-fixes.spec.ts` with 3 new tests (Test 7, Test 8, Test 9) covering the storyboard fixes shipped on 2026-04-25.
- Added `UUID_RE` constant (UUID v4 pattern) at module level, before the `test.describe` block, for reuse across tests.
- Updated the file-level comment to list the 3 new tests alongside the existing 6.
- Test 7 validates that the PUT body sent by the UI after clicking "+" Add Block contains: (a) every block's `durationS >= 1` (not 0 — sentinel fix), and (b) every block's `id` matching UUID v4 format.
- Test 8 verifies that clicking Save in the Edit Scene modal triggers an immediate PUT within 3 s (via the `saveNow()` path bypassing the 5 s debounce). Pre-seeds a scene block via direct API PUT; clicks `[data-testid="scene-block-node"]`; fills prompt via `[data-testid="prompt-input"]`; clicks `[data-testid="save-button"]`.
- Test 9 verifies end-to-end mediaItem persistence: obtains a real `fileId` via `POST /files/upload-url` (satisfies FK constraint on `storyboard_block_media.file_id` without S3 upload), PUTs a scene block with that mediaItem, then GETs and asserts the block's `mediaItems` array is non-empty with the correct `fileId`.

### Files created / modified
- `e2e/storyboard-fixes.spec.ts` (modified — 383 lines added; 3 new tests appended)

### Tests added
- Test 7: PUT body validation — sentinel durationS ≥ 1 and all block IDs are valid UUIDs; uses `page.waitForRequest` + `postDataJSON()` to capture and parse the live browser PUT body.
- Test 8: Edit Scene modal save timing — registers `waitForRequest` before clicking Save button; asserts PUT fires within 3 000 ms of click; uses data-testid locators for scene-block-node, prompt-input, and save-button.
- Test 9: mediaItem persistence round-trip — creates a pending file row via `POST /files/upload-url` to satisfy FK; PUTs storyboard with mediaItem; GETs and asserts `mediaItems[0].fileId` matches the seeded value.

checked by code-reviewer: NOT
checked by qa-reviewer: NOT
checked by design-reviewer: NOT
checked by playwright-reviewer: NOT
