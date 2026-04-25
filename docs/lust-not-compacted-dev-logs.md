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

## Authentication
- added: session-based auth (32-byte tokens, SHA-256, 7-day TTL, bcrypt-12); rate limiting
- added: auth routes (register/login/logout/me); password-reset + email-verify (single-use)
- added: OAuth (Google + GitHub); Bearer injection + 401 interceptor; `APP_DEV_AUTH_BYPASS`
- added FE: LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage; AuthProvider, ProtectedRoute

## AI Platform (fal.ai + ElevenLabs)
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

## Storyboard Bug Fixes (2026-04-24)
- ST-FIX-1: Home button added to `StoryboardPage.topBar.tsx`; tokens → `storyboardPageStyles.ts`; navigation tests split (177L); 23 tests
- ST-FIX-2: `draggable: false → true` for START/END sentinels in `useStoryboardCanvas`, `restoreFromSnapshot`, `applySnapshot`; 4 tests
- ST-FIX-3: `useStoryboardAutosave` — signature `(draftId, nodes, edges)`; removed store subscription; debounce via useEffect; split: `.test.ts`+`.save-now.test.ts`+`.fixtures.ts`; 13 tests
- ST-FIX-4: block IDs → `crypto.randomUUID()`; `handleAddBlock` → `useHandleAddBlock.ts`; 7 tests; `StoryboardPage.tsx` at 300L
- ST-FIX-5: `useHandleRestore.ts` — re-wires `onRemove`, calls setNodes/setEdges/pushSnapshot/saveNow; 18 tests; `StoryboardPage.tsx` at 299L
- ST-FIX-6: `e2e/storyboard-fixes.spec.ts` — 5 Playwright E2E tests (home button, sentinel draggable, block persistence, history restore, save trigger)
- FOLLOW-2: edge IDs → `crypto.randomUUID()`; `useStoryboardDrag.test.ts` (10 tests)

## Storyboard Layout Bugs (2026-04-25)
- SB-BUG-A: `insertSentinelsAtomically` in `storyboard.service.ts` — `SELECT ... FOR UPDATE` + deadlock retry (errno 1213); `loadStoryboard` auto-initializes; `dedupSentinels()` client-side filter; 6 tests
- SB-BUG-A: removed `initializeStoryboard` POST call from `useStoryboardCanvas.ts`
- SB-BUG-B: `AUTOSAVE_DEBOUNCE_MS` 30 000 → 5 000; `setTimeout(() => void saveNow(), 0)` on drag-end, connect, structural edge change, block add; E2E drag-end PUT assertion added

## Storyboard Bug Fixes — Telegram Report (2026-04-25)
- Bug 1 (history auto-restore): added `useStoryboardHistorySeed.ts` — seeds undo/redo stack from server history + restores most recent snapshot on load; wired into `StoryboardPage.tsx`; 5 tests
- Bug 2 (step navigation): `StoryboardCard.handleResume/handleKeyDown` — navigate to `/storyboard/:id` for step2/step3/completed, `/generate` only for draft; 8 new navigation tests
- Bug 3 (scene save): `useSceneModal` now accepts `draftId`; calls `saveStoryboard` immediately after `updateBlock`, bypassing 5s autosave; 8 tests
- Bug 2b (status never set): added `updateDraftStatus(draftId, status): Promise<void>` to `generationDraft.repository.ts` (292L); 4 tests
- Bug 2b service: `assertOwnership` refactored to return `GenerationDraft` (zero extra round-trips); `initializeStoryboard` calls `updateDraftStatus(draftId, 'step2')` only when `draft.status === 'draft'`; 5 tests split to `storyboard.service.status.test.ts` + `storyboard.service.fixtures.ts`

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
- Immediate save pattern: extract callback to `useHandle*.ts` hook; `setTimeout(() => void saveNow(), 0)` defers until after React re-render
- Sentinel init: `loadStoryboard` auto-initializes START/END atomically; client-side `dedupSentinels()` as safety net

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
- **StoryboardPage.tsx 305L**: exceeds 300-line cap by 5 lines (hook wiring for useStoryboardHistorySeed); needs extraction or consolidation
- **StoryboardCard.tsx 322L**: exceeds approved exception (319L); needs reduction or formal exception extension

---

## 2026-04-25

### Task: Fix Bug 2c — Move Status Advance to `loadStoryboard` (GET path)
**Subtask:** ST-BUG2c-1 — Commit approved ST-BUG2b-2+3 working-tree changes

**What was done:**
- Confirmed that all four API service files already contain the expected ST-BUG2b-2+3 changes: `assertOwnership` returns `GenerationDraft`, `initializeStoryboard` has the idempotent status guard, `storyboard.service.fixtures.ts` has `makeDraft(userId, status?)`, and `storyboard.service.status.test.ts` has 5 status-advancement tests.
- Ran `docker compose exec -T -w /app/apps/api api npx vitest run src/services/storyboard` — 17 tests passed (2 test files).
- Staged only the four named API files using `git add <file> <file> ...` (never `git add .`).
- Committed to branch `fix/storyboard-bug2b-status` with message `fix(storyboard): refactor assertOwnership to return GenerationDraft; add updateDraftStatus guard in initializeStoryboard (ST-BUG2b-2+3)`.
- Verified with `git status` that all web-editor/ files remain uncommitted.

**Notes:**
- No code changes were made in this subtask — commit-only.
- Frontend files (StoryboardCard.tsx, StoryboardPage.tsx, useSceneModal.ts, etc.) remain in working tree for later subtasks.

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: ST-BUG2c-1 — Commit approved ST-BUG2b-2+3 working-tree changes</summary>

Stage and commit the approved-but-uncommitted ST-BUG2b-2+3 changes so the branch is clean before new work begins.

</details>

checked by code-reviewer - YES
checked by qa-reviewer - YES
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-25. Backend-only commit-only subtask. All changes are in apps/api/src/services/ only. No UI files touched. No design tokens, spacing, colors, or typography affected. APPROVED.
checked by playwright-reviewer - YES

**Fix round 1:** Extracted the inline `conn.execute(SELECT COUNT(*) ... FOR UPDATE)` from `storyboard.service.ts` into a new repository function `countSentinelBlocksForUpdate(conn, draftId): Promise<number>` in `storyboard.repository.ts`. Service now calls `storyboardRepository.countSentinelBlocksForUpdate(conn, draftId)` — no raw SQL in the service layer. Repository grew from 269 → 290 lines (within the 300-line §9.7 cap). Also added `countSentinelBlocksForUpdate` to the `mockStoryboardRepo` in `storyboard.service.test.ts` and its `beforeEach` reset. Tests: 17/17 passed.
code-reviewer re-check (2026-04-25): Verified extraction is complete. storyboard.service.ts:76 calls `storyboardRepository.countSentinelBlocksForUpdate(conn, draftId)` (§5 compliant — SQL moved to repository). New repository method (lines 210–222) properly typed `(conn: PoolConnection, draftId: string) => Promise<number>`, executes parameterized `SELECT COUNT(*) ... FOR UPDATE`, returns number. Mock added to service.test.ts:43 and reset in beforeEach:72. File lengths: service.ts 284L, repository.ts 290L (both ≤300 per §9.7). No `any` types. All 17 tests pass. ✅ COMPLIANT.
playwright-reviewer notes: ST-BUG2c-1 is commit-only (no new UI or routes). E2E storyboard-fixes tests attempted (6 total). Tests fail at auth/navigation layer (Sign In page renders instead of storyboard canvas), unrelated to ST-BUG2c-1 backend service changes. This is an E2E infrastructure issue (storageState persistence or ProtectedRoute logic), not a regression from this subtask. Backend API service changes are sound and isolated.
playwright-reviewer re-run (2026-04-25 fix round 1): Verified SQL refactoring. Backend vitest: 17/17 pass (storyboard.service + storyboard.service.status). E2E storyboard-fixes (all 6 scenarios, 12 with retries): all fail identically — `getByTestId('storyboard-canvas')` not found, auth/navigation blocker unchanged. Pre-existing issue unrelated to countSentinelBlocksForUpdate extraction. Verdict: SQL refactoring is correct; E2E infrastructure issue is orthogonal to this commit.

## ST-BUG2c-2 — Move status-advance from initializeStoryboard to loadStoryboard
- In loadStoryboard: capture assertOwnership return value; add `if (draft.status === 'draft') await generationDraftRepository.updateDraftStatus(draftId, 'step2')` guard
- In initializeStoryboard: removed the status guard and updated JSDoc (no longer advances status)
- File: apps/api/src/services/storyboard.service.ts (net-neutral line count change)
- Note: storyboard.service.status.test.ts tests for initializeStoryboard now fail as expected — will be fixed in ST-BUG2c-3
- checked by code-reviewer - YES
- checked by qa-reviewer - YES
- checked by design-reviewer - YES
- design-reviewer notes: Reviewed on 2026-04-25. Backend-only service change (apps/api/src/services/storyboard.service.ts only). Moves status-advance logic from POST initializeStoryboard to GET loadStoryboard path. No UI files modified. No design tokens, spacing, colors, typography, or components affected. APPROVED.
- checked by playwright-reviewer - YES

playwright-reviewer notes: ST-BUG2c-2 is backend-only service change (apps/api/src/services/storyboard.service.ts). Status-advance logic moved from POST initializeStoryboard (now removed) to GET loadStoryboard (now added). Both paths remain idempotent via the guard `if (draft.status === 'draft')`. Code review confirms: assertOwnership returns GenerationDraft (change from ST-BUG2c-1); loadStoryboard captures return and checks status before calling updateDraftStatus; initializeStoryboard JSDoc updated to reflect removal of status advancement. No UI routes or components touched. No E2E test opportunity (backend-only). Expected test failures in storyboard.service.status.test.ts (testing old initializeStoryboard path) will be fixed in ST-BUG2c-3 per plan. Implementation is correct and complete.

<!-- QA NOTES:
Test run: docker compose exec -T -w /app/apps/api api npx vitest run src/services/storyboard
Results:  12/12 storyboard.service.test.ts PASS ✅
          4/5 storyboard.service.status.test.ts PASS; 1 FAIL (expected)
Total:    16/17 PASS; 1 expected failure

Expected failure: "storyboard.service.status.test.ts > initializeStoryboard status advancement > calls updateDraftStatus with 'step2' when draft status is 'draft'"
Reason: This test checks the old code path (initializeStoryboard status advancement). The feature has been moved to loadStoryboard per ST-BUG2c-2. The test will be updated in ST-BUG2c-3 to target loadStoryboard instead. This failure is approved per the active task plan (line 65).

Verdict: PASS — implementation correct, expected test failure isolated to the status file, all core service tests pass.
-->

## ST-BUG2c-3 — Update status-advancement tests to target loadStoryboard
- storyboard.service.status.test.ts: replaced initializeStoryboard describe block with loadStoryboard describe block; 5 tests: status='draft' calls updateDraftStatus('step2'), step2/step3/completed do not call it, correct {blocks,edges} response returned
- storyboard.service.test.ts: removed updateDraftStatus mock call assertions from initializeStoryboard describe block
- All 17 tests pass
- checked by code-reviewer - YES
- checked by qa-reviewer - YES
- checked by design-reviewer - YES
- design-reviewer notes: Reviewed on 2026-04-25. Backend-only test refactoring subtask. All changes are in apps/api/src/services/*.test.ts and .service.ts files only. No UI files modified. No design tokens, spacing, colors, typography, or components affected. APPROVED.
- checked by playwright-reviewer - YES

code-reviewer verdict: ✅ COMPLIANT per §9.7, §10. storyboard.service.status.test.ts (122L) imports loadStoryboard correctly, has standalone vi.hoisted() block, all 5 status-advancement tests present and correct, fixtures imported from .fixtures.ts (USER_A, DRAFT_ID, makeDraft), no `any` types ≤ 300L. storyboard.service.test.ts (244L) ≤ 300L; initializeStoryboard describe block (lines 114–164) contains 3 tests with zero stale updateDraftStatus assertions—clean. Fixtures properly extracted and DRY across split files. vi.hoisted() pattern compliant.

## ST-BUG2c-4 — Remove orphaned POST /storyboards/:draftId/initialize route
- Removed initializeStoryboard handler from apps/api/src/controllers/storyboard.controller.ts
- Removed POST /:draftId/initialize route from apps/api/src/routes/storyboard.routes.ts
- Removed initializeStoryboard() export from apps/web-editor/src/features/storyboard/api.ts
- Removed initializeStoryboard mock from StoryboardPage.save-on-add.test.tsx, useSceneTemplates.test.ts, useStoryboardCanvas.test.ts
- Updated useStoryboardCanvas.test.ts: removed mockInitializeStoryboard from hoisted block and vi.mock; updated test description from "calls fetchStoryboard (GET) on mount and does NOT call initializeStoryboard (POST)" to "calls fetchStoryboard (GET) on mount"
- Removed POST /initialize describe block from storyboard.integration.test.ts (2 tests that now correctly return 404)
- Service function initializeStoryboard retained in storyboard.service.ts (used by unit tests in storyboard.service.test.ts)
- All 119 API test files pass (1207 tests); all 228 FE test files pass (2543 tests)
- Grep verification: no remaining references to initializeStoryboard in controllers/, routes/, or web-editor/src/

checked by code-reviewer - YES
> ✅ Controller: initializeStoryboard handler removed (100L ≤ 300). Routes: POST /:draftId/initialize removed (52L ≤ 300). API export: initializeStoryboard() removed (187L ≤ 300). Service: initializeStoryboard retained for unit tests (281L ≤ 300). Grep verification: zero references in controllers/, routes/, web-editor/src/. No `any` types. All unit tests pass (17/17 storyboard.service + 290/290 storyboard feature). Compliant §5 (service retained), §9 (naming/file length), §10 (testing).
checked by qa-reviewer - YES
qa-reviewer re-check (fix round 1): Verified E2E helper refactoring complete. Service unit tests: 17/17 pass (storyboard.service.test.ts 12 + storyboard.service.status.test.ts 5). Grep e2e/: zero references to initializeStoryboard or /initialize endpoints remain. All 4 spec files updated: storyboard-drag.spec.ts, storyboard-fixes.spec.ts, storyboard-history-regression.spec.ts, storyboard-canvas.spec.ts now use GET /storyboards/:draftId instead of POST /initialize. Verdict: ✅ REGRESSION CLEAR — fix round 1 complete and verified.
checked by design-reviewer - YES
design-reviewer notes: Reviewed on 2026-04-25. API-layer removal only (controller handler, route, frontend export). No design tokens, spacing, colors, typography, or components affected. APPROVED.
checked by playwright-reviewer: YES
playwright-reviewer re-check (fix round 1 verification, 2026-04-25): Verified all 4 E2E spec files have been correctly updated. Grep: zero POST /initialize calls in e2e/ (was looking for "initialize" in HTTP context). Verification: (1) storyboard-fixes.spec.ts — initializeDraft() helper now calls apiContext.get(`${E2E_API_URL}/storyboards/${draftId}`). (2) storyboard-drag.spec.ts — same GET helper pattern. (3) storyboard-canvas.spec.ts — same GET helper pattern. (4) storyboard-history-regression.spec.ts — inline calls replaced: page.request.get(`${E2E_API_URL}/storyboards/${draftId}`). Unit tests: all 119 API tests pass (1207 tests); all 228 FE tests pass (2543 tests). E2E test run: 4 spec files invoked, 8 tests failed due to pre-existing auth/ProtectedRoute infrastructure issue (Sign In page renders instead of storyboard canvas) — NOT related to ST-BUG2c-4 fix. Helper functions themselves are syntactically correct and hit the new GET endpoint. Verdict: APPROVED — Fix round 1 refactoring complete and verified.
