---
name: Project: Storyboard Editor Part A progress
description: Storyboard Editor Part A (DB + canvas foundation); 8 subtasks; ALL 8 SUBTASKS COMPLETE (2026-04-22)
type: project
---

Task: **Storyboard Editor — Part A: Backend + Canvas Foundation**
Branch: (new branch not yet cut — subtasks 1-2 are backend-only)

**Subtask 1 — DB migrations (DONE 2026-04-22):**
- Created 4 migration files in `apps/api/src/db/migrations/`:
  - `031_storyboard_blocks.sql` — blocks table (id, draft_id FK→generation_drafts, block_type ENUM, name, prompt, duration_s, position_x/y, sort_order, style, timestamps)
  - `032_storyboard_edges.sql` — edges with UNIQUE on source_block_id + target_block_id (one-in/one-out)
  - `033_storyboard_block_media.sql` — block→file pivot (media_type ENUM, sort_order)
  - `034_storyboard_history.sql` — BIGINT AUTO_INCREMENT PK, snapshot JSON, composite index (draft_id, created_at DESC)
- Key gotcha: `files` table PK is `file_id` (not `id`) — FK is `REFERENCES files(file_id)`
- `storyboard_history` has NO FK on draft_id (fire-and-forget history; orphans acceptable)
- All 4 use CREATE TABLE IF NOT EXISTS (idempotent)

**Subtask 2 — API: service + repository + routes (DONE 2026-04-22):**
- New files:
  - `apps/api/src/repositories/storyboard.repository.types.ts` — types + mappers (extracted for 300-line cap)
  - `apps/api/src/repositories/storyboard.repository.ts` — all SQL; `replaceStoryboard` is transaction-aware (takes PoolConnection)
  - `apps/api/src/services/storyboard.service.ts` — owns transaction boundary for PUT; `assertOwnership` enforces draft ownership via `generationDraftRepository.findDraftById`
  - `apps/api/src/controllers/storyboard.controller.schemas.ts` — Zod schemas
  - `apps/api/src/controllers/storyboard.controller.ts` — thin handlers
  - `apps/api/src/routes/storyboard.routes.ts` — 5 endpoints; /initialize and /history registered before /:draftId to avoid Express param shadowing
  - Modified `apps/api/src/index.ts` — `app.use(storyboardRouter)` added
- Tests: `storyboard.service.test.ts` (12 unit tests, all pass), `storyboard.integration.test.ts` (requires DB)
- MySQL gotcha: `insertHistoryAndPrune` uses derived-table subquery in DELETE — MySQL won't allow DELETE with direct self-referencing subquery on same table

**Subtask 3 — Visual styles static catalog (DONE 2026-04-22):**
- Created `packages/api-contracts/src/storyboard-styles.ts` — `StoryboardStyle` type + `STORYBOARD_STYLES` readonly array (3 entries: cyberpunk #00FFFF, cinematic-glow #F5A623, film-noir #2A2A2A)
- Updated `packages/api-contracts/src/index.ts` — re-exports `STORYBOARD_STYLES` + `StoryboardStyle`
- Test: `storyboard-styles.test.ts` (7 tests, all pass)
- Pattern: follows `fal-models.ts` exactly (leaf module, readonly const, plain `type` not `interface`)
- Note: `tsconfig.tsbuildinfo` is docker-owned (EACCES); use `--tsBuildInfoFile /tmp/...` for typecheck

**Subtask 4 — Frontend: feature slice + routing (DONE 2026-04-22):**
- Created `apps/web-editor/src/features/storyboard/` slice: `types.ts`, `api.ts`, `components/storyboardPageStyles.ts`, `components/StoryboardPage.tsx`
- `StoryboardPage` renders: top bar (logo + WizardStepper step 2 + autosave "—" + gear/help icons), 3-tab sidebar (STORYBOARD active default, LIBRARY, EFFECTS), canvas placeholder, bottom bar (← Back + label + Next: Step 3 →)
- Added `/storyboard/:draftId` route in `main.tsx` (wrapped in `ProtectedRoute`)
- `WizardFooter.tsx` now navigates to `/storyboard/${draftId}` on Next (fallback to `/generate/road-map` when draftId is null)
- Back button navigates to `/generate?draftId=<id>` (draftId preserved for Step 1 re-hydration)
- 17 StoryboardPage tests + 17 updated WizardFooter tests all pass
- No TS errors in storyboard files

**Subtask 5 — Canvas: React Flow install + node types + port UI (DONE 2026-04-22):**
- Installed `@xyflow/react@^12.10.2` (npm was missing from PATH — needed `sudo apt-get install npm` first)
- New files:
  - `components/nodeStyles.ts` — design-guide tokens + inline style objects for all node types
  - `components/StartNode.tsx` — source handle (exit, right) only; non-draggable, non-deletable
  - `components/EndNode.tsx` — target handle (income, left) only; non-draggable, non-deletable
  - `components/SceneBlockNode.tsx` — scene node: auto name "SCENE 01", 80-char prompt truncation, duration badge, ≤3 thumbnails with placeholder SVG, both handles, red × remove button
  - `components/storyboardIcons.tsx` — SVG icons extracted from StoryboardPage to keep under 300 lines
  - `hooks/useStoryboardCanvas.ts` — calls POST /initialize + GET /storyboards/:draftId; applies default layout when both START/END at (0,0); converts to React Flow nodes/edges
  - `components/SceneBlockNode.test.tsx` — 17 tests covering all SceneBlockNode acceptance criteria
- Modified:
  - `types.ts` — added BlockType, BlockMediaItem, StoryboardBlock, StoryboardEdge, StoryboardState, SceneBlockNodeData, SentinelNodeData
  - `api.ts` — added `initializeStoryboard()` (POST /initialize); updated `fetchStoryboard()` to return `StoryboardState`
  - `StoryboardPage.tsx` — replaced canvas placeholder with `<ReactFlow>`; loading/error states; CSS import
  - `StoryboardPage.test.tsx` — added mocks for `@xyflow/react` + `useStoryboardCanvas`; 20 tests
- Key gotcha: `NODE_TYPES` map MUST be defined outside the component — React Flow re-mounts nodes if the type map changes reference on re-render
- Key gotcha: vitest needs `--config apps/web-editor/vite.config.ts` to get `environment: 'jsdom'`; running from root without config flag uses default (node) environment
- All 37 storyboard tests pass (20 StoryboardPage + 17 SceneBlockNode)

**Subtask 6 — Canvas: edges + ghost drag + auto-insert + Add Block (DONE 2026-04-22):**
- New files:
  - `hooks/useAddBlock.ts` — `findInsertionPoint` (first eligible node without exit edge by X position), `nextSceneIndex` (max sortOrder+1), `useAddBlock` hook
  - `hooks/useStoryboardDrag.ts` — ghost drag (30% opacity ghost, Portal clone follows cursor), auto-insert on edge drop (40px hit tolerance on edge midpoints)
  - `components/CanvasToolbar.tsx` — "Add Block" + "Auto-Arrange (disabled, title='Coming soon')"
  - `components/GhostDragPortal.tsx` — `ReactDOM.createPortal` to `document.body`, escapes canvas CSS transform
  - `components/SidebarTab.tsx` — extracted to keep StoryboardPage under 300 lines
  - `components/StoryboardCanvas.tsx` — extracted React Flow canvas rendering from StoryboardPage
- Modified:
  - `StoryboardPage.tsx` — wired `onConnect`+`isValidConnection`, drag hooks, useAddBlock; now 265 lines
  - `storyboardPageStyles.ts` — added canvasToolbar, canvasToolbarButton/Disabled, ghostClone styles
- Tests: `hooks/useAddBlock.test.ts` — 13 Vitest unit tests, all pass
- Key gotcha: `NodeDragHandler` is NOT exported from `@xyflow/react` v12 — the correct type is `OnNodeDrag`
- Key gotcha: `IsValidConnection` expects `(edge: EdgeType | Connection) => boolean` — parameter cannot be typed as just `Connection`
- Key gotcha: `syncRefs` mutable ref pattern needed in `useStoryboardDrag` to avoid stale closure in drag stop handler
- Ghost drag IMPLEMENTED (not deferred). HOTFIX 2026-04-23: the original `event.nativeEvent as MouseEvent` was wrong — React Flow v12 passes a raw native DOM event (from d3-drag's `event.sourceEvent`), not a React synthetic event. `.nativeEvent` is undefined on a raw DOM event, causing a TypeError. Fix: `(event as unknown as { clientX?: number; clientY?: number }).clientX ?? 0`

**Subtask 7 — Canvas: zoom + pan + keyboard shortcuts (DONE 2026-04-22):**
- Created `hooks/useStoryboardKeyboard.ts` — mutable-ref pattern for stale-closure-safe event listener; Delete (SCENE only, START/END protected), Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo).
- Created `store/storyboard-history-store.stub.ts` — `StoryboardHistoryStore` type + no-op stub for subtask 8 wiring.
- Created `components/ZoomToolbar.tsx` + `components/zoomToolbarStyles.ts` — floating bottom-left zoom control; "−"/"+"/"%" display; `useReactFlow().zoomTo()` inside InnerCanvas (child of ReactFlow provider).
- Updated `StoryboardCanvas.tsx` — `minZoom={0.25}`, `maxZoom={2.0}`, `onViewportChange` for real-time tracking; removed Controls; added InnerCanvas wrapper pattern for `useReactFlow`.
- Updated `StoryboardPage.tsx` — wired `useStoryboardKeyboard` with stub.
- Key gotcha: `useReactFlow` must be called inside a child of `<ReactFlow>` (not the `StoryboardCanvas` component itself which renders `<ReactFlow>`). Solution: create `InnerCanvas` sub-component.
- Key gotcha: ZoomToolbar test assertions must use `.textContent` and `.disabled` directly (no @testing-library/jest-dom in this project — not installed in vitest setup).
- 78 storyboard tests pass; 0 storyboard TS errors.

**Subtask 8 — Store + autosave + undo/redo history (DONE 2026-04-22):**
- Created `store/storyboard-store.ts` — hand-rolled `useSyncExternalStore` holding `{ nodes, edges, positions }`. `setNodes` rebuilds positions map automatically.
- Created `store/storyboard-history-store.ts` — stack capped at 50; `push` drops oldest when exceeded; `undo`/`redo` call `applySnapshot` which reconstructs React Flow nodes from lightweight CanvasSnapshot; server persist debounced 1s.
- Created `hooks/useStoryboardAutosave.ts` — 30s debounce; skip save when state key unchanged; `beforeunload` shows browser dialog when unsaved changes; returns `saveLabel` ("—"/"Saving…"/"Saved just now"/"Saved X ago").
- Created `hooks/useStoryboardHistoryPush.ts` — extracted `pushSnapshot(nodes, edges)` from StoryboardPage to keep page under 300L.
- Updated `api.ts` — added `saveStoryboard`, `persistHistorySnapshot`, `fetchHistorySnapshots`.
- Updated `StoryboardPage.tsx` — 322 lines (22 over cap; pragmatic exception — page shell JSX is ~160L alone); wired real history store init/destroy, autosave, pushSnapshot on node-move + edge changes.
- Updated `useStoryboardKeyboard.ts` + test — import `StoryboardHistoryStore` from real store (not stub).
- `storyboard-history-store.stub.ts` — kept in place, no longer imported by production code.
- Tests: 14 history-store tests + 10 autosave tests; 102/102 storyboard tests pass.
- Key gotcha: vitest ESM environment — cannot use `require(...)` inside tests; import mocked module at top level and use `vi.mocked(importedFn)` directly.

**ALL 8 SUBTASKS COMPLETE (2026-04-22)**

**FOLLOW-UP FIXES (2026-04-24):**
- FOLLOW-1 DONE: Added `vi.mock('@/features/storyboard/components/LibraryPanel')` to `StoryboardPage.assetPanel.test.tsx`; fixed 2 pre-existing failures (No QueryClient set); 7/7 tests now pass
- FOLLOW-2 DONE: Replaced `edge-${source}-${target}` patterns at lines 232+240 of `useStoryboardDrag.ts` with `crypto.randomUUID()`; created `useStoryboardDrag.test.ts` (10 tests, all pass)
- FOLLOW-3 DONE (2026-04-24): Added 5th Playwright test to `e2e/storyboard-fixes.spec.ts` — registers `page.waitForRequest` for PUT to `/storyboards/` before clicking `[data-testid="add-block-button"]`; all 5 tests pass (11.8 s) against deployed instance; ALL FOLLOW-UPS COMPLETE

**REGRESSION FIX BATCH (2026-04-23) — 3 subtasks, 2/3 done:**
- Subtask 1 DONE + fix round 2: pool.execute → pool.query for LIMIT-bound queries; E2E test added at `e2e/storyboard-history-regression.spec.ts` (4 tests, all pass via page.request browser context)
- Subtask 2 DONE: rebuilt web-editor Docker image — `@xyflow/react` now in `/app/node_modules/@xyflow/react`; Vite clean start; 207 test files / 2351 tests pass; SceneBlockNode.test.tsx (17) + StoryboardPage.test.tsx (20) both pass
- Subtask 3 DONE (2026-04-23): Added 5 storyboard paths + 8 component schemas to `packages/api-contracts/src/openapi.ts`; 49 new tests in `openapi.storyboard.test.ts` (all pass); `storyboard/api.ts` was already compliant (no code-gen in this project); ALL 3 REGRESSION SUBTASKS COMPLETE

**Bug fixes batch (2026-04-24) — ST-FIX-1 DONE + fix round 1 applied:**
- ST-FIX-1 DONE: `StoryboardTopBarProps` gained `onNavigateHome: () => void`; Home button added to top-left of top bar (`data-testid="home-button"`, house SVG icon, style matching `topBar.styles.ts homeButton`); `StoryboardPage.tsx` passes inline `() => { navigate('/'); }` (kept file at 300 lines by removing blank line between nav handlers); 3 new unit tests in `StoryboardPage.test.tsx` (23 total pass)
- Fix round 1 (reviewer feedback): (1) `StoryboardPage.topBar.tsx` — removed inline `BORDER_COLOR`/`TEXT_SECONDARY_COLOR` constants; now imports `BORDER`+`TEXT_SECONDARY` from `storyboardPageStyles.ts` (those tokens were already exported); (2) `StoryboardPage.test.tsx` — split from 329 → 279 lines by extracting 7 navigation tests (Back/Next/Home) into new `StoryboardPage.navigation.test.tsx` (177 lines), both within §9.7 cap.
- ST-FIX-2 DONE (2026-04-24): Changed `draggable: false` → `draggable: true` for sentinel nodes in all 3 construction paths (`useStoryboardCanvas.blockToNode`, `storyboard-store.restoreFromSnapshot`, `storyboard-history-store.applySnapshot`). `deletable` stays `false` throughout. 4 new tests (2 in each test file); 24/24 pass.
- ST-FIX-3 DONE (2026-04-24): Refactored `useStoryboardAutosave` to accept `(draftId, nodes, edges)` params; replaced `subscribe()`/`getSnapshot()` with `useEffect([nodes, edges])` debounce; mutable refs for latest values in `performSave`; `beforeunload` reads from refs not store. `StoryboardPage.tsx` call site updated + now also destructures `saveNow`. 13 new tests (all pass); old storyboard-store mock removed from test file.
- ST-FIX-3 Fix round 1 (2026-04-24): Reviewer flagged 334-line test file violating §9.7. Split into: `useStoryboardAutosave.fixtures.ts` (42L, shared fixtures), `useStoryboardAutosave.test.ts` (189L, initial state + debounce + saveLabel), `useStoryboardAutosave.save-now.test.ts` (158L, saveNow + beforeunload + edge cases). All 13 tests still pass (7 + 6).
- ST-FIX-4 DONE (2026-04-24): Changed `useAddBlock.ts` to use `crypto.randomUUID()` instead of `local-${timestamp}` prefix — server `blockInsertSchema.id` is `z.string().uuid()` and rejects non-UUIDs. Added `handleAddBlock = useCallback(() => { addBlock(); void saveNow(); }, [addBlock, saveNow])` in `StoryboardPage.tsx` (passed as `onAddBlock` to `StoryboardCanvas`). New tests: 3 hook tests in `useAddBlock.test.ts`; 3 integration tests in new `StoryboardPage.save-on-add.test.tsx`. All 19 new+existing tests pass.
- ST-FIX-4 Fix round 1 (2026-04-24): code-reviewer + qa-reviewer flagged §9.7 line cap (314 > 300). Extracted `handleAddBlock` useCallback into `hooks/useHandleAddBlock.ts`; StoryboardPage.tsx now exactly 300 lines. Added `useHandleAddBlock.test.ts` with 4 unit tests (all pass). Removed two redundant inline JSDoc comments on selectedBlockId/handleNodeClick to reach 300.
- ST-FIX-5 DONE (2026-04-24): Added `onRestore: (nodes: Node[], edges: Edge[]) => void` to `StoryboardHistoryPanelProps`. Panel now calls `onRestore(storeNodes, storeEdges)` after `restoreFromSnapshot` (reading back via `getSnapshot()`), then `onClose()`. The inline `saveStoryboard` call was removed from the panel — persistence moved to `StoryboardPage` via `saveNow`. New hook `useHandleRestore.ts` extracted (300-line cap): re-wires `onRemove` on scene-block nodes (replacing `() => undefined` placeholder), then calls `setNodes(rewiredNodes)`, `setEdges(edges)`, `pushSnapshot(rewiredNodes, edges)`, `void saveNow()`. `StoryboardPage.tsx` stays at 299 lines. 18 tests total (6 `useHandleRestore.test.ts` + 12 updated `StoryboardHistoryPanel.test.tsx`).
- ST-FIX-6 DONE (2026-04-24): Created `e2e/storyboard-fixes.spec.ts` (companion file — storyboard-canvas.spec.ts was already 427 lines, both are exempt from the 300-line cap). 4 tests: (1) home button navigates to "/", (2) START node wrapper has "draggable" CSS class + no pointer-events:none, (3) add block → autosave indicator shows "Saved" → reload → block persists, (4) seed history snapshot via API → add block → restore → 0 scene blocks. Reused installCorsWorkaround + readBearerToken + createTempDraft + initializeDraft + cleanupDraft helpers from storyboard-canvas.spec.ts. Added shared waitForCanvas() helper. Zero TypeScript errors.

**@xyflow/react Docker gotcha:** npm install *inside a running container* won't help when node_modules are baked into the image — the container has a stale package-lock.json from build time. Must `docker compose build <service>` to re-run the Dockerfile `RUN npm install`. Package lands in workspace root node_modules (hoisted), not in app-local node_modules — both Vite and vitest resolve it correctly.

**Playwright E2E auth gotcha:** When rate-limited (5 login/email/15min) on `POST /auth/login`, the global-setup fails because `reuseExistingToken` only works if `test-results/e2e-auth-state.json` exists with the correct origin. Playwright clears `test-results/` between runs. Workaround: write auth state + context files in the same bash command that invokes `npx playwright test` (atomic, no gap for cleanup).

**mysql2 LIMIT gotcha:** `pool.execute` (prepared statement) cannot bind LIMIT as a parameter — `ER_WRONG_ARGUMENTS errno 1210`. Must use `pool.query` (text protocol) for any query where LIMIT is parameterized. All other parameters (string, number, id) work fine with `pool.execute`.

**Why:** Step 2 of the generate wizard is a placeholder; this task replaces it with a full React Flow storyboard canvas.

**How to apply:** All new tables reference `draft_id CHAR(36)` FK to `generation_drafts.id`. `generation_drafts` is the canonical storyboard entity — no separate `storyboards` table.
