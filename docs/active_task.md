# Active Task

## Task
**Name:** Storyboard Editor — Part A: Backend + Canvas Foundation
**Source:** Conversation spec (77-question Q&A session, 2026-04-22)
**Goal:** Deliver a working React Flow storyboard canvas at `/storyboard/:draftId` with START/END nodes, draggable SCENE blocks, connections, zoom/pan, autosave (30s), and undo/redo (50 states, persisted server-side), backed by new DB tables and API routes for blocks, edges, and history.

---

## Context

### Why this task matters
Step 2 of the video generation wizard currently renders a placeholder (`GenerateRoadMapPlaceholder`). This task replaces it with the full storyboard canvas editor — the core creative surface where users plan their video scene-by-scene before generation. The backend data model for storyboard state does not yet exist; this task lays the DB foundation and wires it to the frontend.

### Relevant architecture constraints
- All SQL in `repositories/` — never in services.
- All HTTP calls from the frontend via `lib/api-client.ts` — never raw `fetch`.
- Feature-local state: hand-rolled external store (`useSyncExternalStore`). TanStack Query for server state.
- UI: inline-style + `*.styles.ts` / `*.tokens.ts` files — **no CSS files, no CSS-in-JS library**.
- Files must not exceed 300 lines; split by concern when they do.
- `generation_drafts.id` is the canonical "storyboard ID" in this codebase — new tables reference `draft_id` FK.
- Business logic lives in `services/`, not in `controllers/` or `routes/`.
- All routes require `authMiddleware` + `aclMiddleware('editor')`.
- Migration files: numbered SQL in `apps/api/src/db/migrations/`, `CREATE TABLE IF NOT EXISTS`.

### Related areas of the codebase
- `apps/web-editor/src/features/generate-wizard/components/GenerateRoadMapPlaceholder.tsx` — replaced by this task (becomes redirect or removed)
- `apps/web-editor/src/features/generate-wizard/components/WizardFooter.tsx` — must navigate to `/storyboard/:draftId` instead of `/generate/road-map`
- `apps/web-editor/src/main.tsx` — add `/storyboard/:draftId` route
- `apps/web-editor/src/features/generate-wizard/components/WizardStepper.tsx` — consumed by the new page shell (reuse)
- `apps/web-editor/src/features/generate-wizard/components/BackToStoryboardButton.tsx` — name-aligned component for Back navigation
- `apps/api/src/routes/generationDrafts.routes.ts` — adjacent domain; storyboard routes go in a new `storyboard.routes.ts`
- `apps/api/src/db/migrations/021_files.sql` — `files` table that `storyboard_block_media.file_id` references
- `apps/api/src/db/migrations/019_generation_drafts.sql` — parent entity for all storyboard tables
- `packages/api-contracts/src/` — add visual styles static catalog here (like `fal-models.ts`)

### Reuse audit
- `WizardStepper` (`features/generate-wizard/components/WizardStepper.tsx`) — reuse as-is in the new `StoryboardPage` shell; no changes needed.
- `WizardFooter` pattern — the new page has its own footer (Back / Step 2 label / Next: Step 3), but can borrow button styles from `WizardFooter`.
- `SaveStatusBadge.tsx` (`TopBar.tsx` area) — review this component; may be reusable or an inspiration for the storyboard autosave indicator in the header.
- `features/version-history/hooks/useAutosave.ts` — **read carefully**; the storyboard autosave hook follows the same 30s debounce + drain pattern but calls a different endpoint. Do not copy; write a separate `useStoryboardAutosave.ts` that borrows the pattern.
- `store/history-store.ts` — storyboard does NOT share this store (it's scoped to the timeline editor). Create a separate `storyboard-history-store.ts` inside the storyboard feature.
- `apps/api/src/lib/errors.ts` — reuse `NotFoundError`, `ForbiddenError` typed classes.
- `apps/api/src/middleware/auth.middleware.ts`, `acl.middleware.ts`, `validate.middleware.ts` — apply to all storyboard routes.

---

## Subtasks

- [ ] **1. DB migrations — storyboard tables**
  - What: Create four new SQL migration files: `031_storyboard_blocks.sql`, `032_storyboard_edges.sql`, `033_storyboard_block_media.sql`, `034_storyboard_history.sql`.
  - Where: `apps/api/src/db/migrations/`
  - Why: Provides the persistent storage layer for the storyboard canvas state, block-to-file media associations, edge connections, and server-side undo history.
  - Acceptance criteria:
    - `storyboard_blocks`: columns `id CHAR(36) PK`, `draft_id CHAR(36) NOT NULL` (FK → `generation_drafts.id`), `block_type ENUM('start','end','scene') NOT NULL`, `name VARCHAR(255) NULL`, `prompt TEXT NULL`, `duration_s SMALLINT NOT NULL DEFAULT 5`, `position_x FLOAT NOT NULL DEFAULT 0`, `position_y FLOAT NOT NULL DEFAULT 0`, `sort_order INT NOT NULL DEFAULT 0`, `style VARCHAR(64) NULL`, `created_at TIMESTAMP`, `updated_at TIMESTAMP`; index on `draft_id`.
    - `storyboard_edges`: columns `id CHAR(36) PK`, `draft_id CHAR(36) NOT NULL`, `source_block_id CHAR(36) NOT NULL`, `target_block_id CHAR(36) NOT NULL`; UNIQUE KEY on `source_block_id` (one exit per block) and `target_block_id` (one income per block); index on `draft_id`.
    - `storyboard_block_media`: columns `id CHAR(36) PK`, `block_id CHAR(36) NOT NULL` (FK → `storyboard_blocks.id`), `file_id CHAR(36) NOT NULL` (FK → `files.id`), `media_type ENUM('image','video','audio') NOT NULL`, `sort_order INT NOT NULL DEFAULT 0`; index on `block_id`.
    - `storyboard_history`: columns `id BIGINT UNSIGNED AUTO_INCREMENT PK`, `draft_id CHAR(36) NOT NULL`, `snapshot JSON NOT NULL`, `created_at TIMESTAMP`; index on `(draft_id, created_at DESC)`.
    - All four files use `CREATE TABLE IF NOT EXISTS` (idempotent).
    - Files are numbered 031–034 (no collision with existing migrations).
  - Test approach: No unit tests for SQL files. Manual verification: `docker compose down -v && docker compose up -d db` confirms tables are created without errors. Integration test for storyboard API (subtask 2) will implicitly validate the schema.
  - Risk: **medium** — touches DB schema; once the `db` volume is seeded these tables exist. The `UNIQUE KEY` on `source_block_id` and `target_block_id` in `storyboard_edges` enforces the one-in/one-out invariant at the DB level — confirm this is desired before running.
  - Depends on: none

- [ ] **2. API: storyboard service + repository + routes**
  - What: Add `storyboard.routes.ts`, `storyboard.controller.ts`, `storyboard.service.ts`, `storyboard.repository.ts` in `apps/api/src/`. Wire the router in `apps/api/src/index.ts`. Endpoints: `GET /storyboards/:draftId` (load full state), `PUT /storyboards/:draftId` (full replace — autosave), `GET /storyboards/:draftId/history` (last 50 snapshots), `POST /storyboards/:draftId/history` (push snapshot), `POST /storyboards/:draftId/initialize` (seed START + END blocks on first access).
  - Where: `apps/api/src/routes/storyboard.routes.ts`, `apps/api/src/controllers/storyboard.controller.ts`, `apps/api/src/services/storyboard.service.ts`, `apps/api/src/repositories/storyboard.repository.ts`
  - Why: Provides the backend contract that the frontend autosave hook and canvas state loader call.
  - Acceptance criteria:
    - `GET /storyboards/:draftId` returns `{ blocks: Block[], edges: Edge[] }` where each block includes its `mediaItems[]`. Returns 404 if draft does not belong to the authenticated user.
    - `PUT /storyboards/:draftId` accepts `{ blocks: Block[], edges: Edge[] }` and does a full replace (delete-all-then-insert transaction) inside a single DB transaction. Returns 200 with the saved state.
    - `POST /storyboards/:draftId/initialize` is idempotent: if START and END blocks already exist, returns current state unchanged. If they don't, inserts START block at `(x=50, y=300)` and END block at `(x=900, y=300)`. Returns 200 with `{ blocks, edges }`.
    - `POST /storyboards/:draftId/history` accepts `{ snapshot: object }`, inserts a row, then purges rows beyond the 50 most recent for that `draft_id` (single DELETE ... ORDER BY id DESC LIMIT N subquery). Returns 201.
    - `GET /storyboards/:draftId/history` returns `[{ id, snapshot, createdAt }]` ordered by `created_at DESC`, max 50.
    - All routes apply `authMiddleware` + `aclMiddleware('editor')`.
    - Ownership check: service verifies `generation_drafts.user_id = req.user.id` before any read/write.
    - No business logic in controller or repository.
  - Test approach: `apps/api/src/services/storyboard.service.test.ts` (Vitest unit — mock repository) covering: ownership enforcement (throws `ForbiddenError`), history purge beyond 50, initialize idempotency. `apps/api/src/__tests__/integration/storyboard.integration.test.ts` (Vitest + supertest + real DB) covering: GET 404 on unknown draft, PUT round-trips full block graph, history GET returns ≤50 sorted results.
  - Risk: **high** — full-replace PUT (delete-all-then-insert in transaction) is a destructive operation. If the transaction fails mid-way the storyboard could be left empty. Ensure the repository wraps the delete + insert in a single `BEGIN … COMMIT`. Test the rollback path in integration tests.
  - Depends on: subtask 1

- [ ] **3. Visual styles static catalog**
  - What: Create `packages/api-contracts/src/storyboard-styles.ts` exporting `STORYBOARD_STYLES` array with at least 3 initial entries: `{ id, label, description, previewColor }` for Cyberpunk, Cinematic Glow, and Film Noir. Export the `StoryboardStyle` type. Re-export from `packages/api-contracts/src/index.ts`.
  - Where: `packages/api-contracts/src/storyboard-styles.ts`, `packages/api-contracts/src/index.ts`
  - Why: The Effects panel and scene modal both need the same style catalog. A static catalog in `api-contracts` (like `fal-models.ts`) avoids a DB table for read-only preset data and keeps both frontend and backend in sync.
  - Acceptance criteria:
    - `STORYBOARD_STYLES` is a `readonly` array of `StoryboardStyle` objects.
    - Each entry has at minimum: `id: string` (kebab-case slug like `"cyberpunk"`), `label: string`, `description: string`, `previewColor: string` (hex, for thumbnail swatch in the Effects panel).
    - `StoryboardStyle` type is exported from the package root.
    - `packages/api-contracts` compiles without TS errors after the change (`turbo run typecheck --filter=@ai-video-editor/api-contracts`).
  - Test approach: No runtime tests needed for a static catalog. Typecheck CI catches shape errors. A brief Vitest snapshot test `storyboard-styles.test.ts` asserting `STORYBOARD_STYLES.length >= 3` and that each entry has `id`, `label`, `description`, `previewColor`.
  - Risk: **low** — additive change to a shared package; no existing consumers affected.
  - Depends on: none

- [ ] **4. Frontend: feature slice + routing**
  - What: Create `apps/web-editor/src/features/storyboard/` slice skeleton with `api.ts`, `types.ts`, `components/StoryboardPage.tsx`, `components/storyboardPageStyles.ts`. Add `/storyboard/:draftId` route in `main.tsx`. Update `WizardFooter.tsx` to navigate to `/storyboard/${draftId}` instead of `/generate/road-map`. Update `GenerateRoadMapPlaceholder.tsx` to redirect to `/storyboard/:draftId` (or remove, with a redirect route). Implement the page shell: top bar (ClipTale logo left + gear/help icons right + autosave indicator center-right), left sidebar with three icon tabs (STORYBOARD, LIBRARY, EFFECTS), bottom bar (Back button + "STEP 2: STORYBOARD" label + "Next: Step 3 →" button). The canvas area is a placeholder `<div>` at this stage.
  - Where: `apps/web-editor/src/features/storyboard/`, `apps/web-editor/src/main.tsx`, `apps/web-editor/src/features/generate-wizard/components/WizardFooter.tsx`
  - Why: Establishes the page shell and routing so that subsequent canvas subtasks can be developed and tested in isolation within the real app context.
  - Acceptance criteria:
    - Navigating to `/storyboard/some-draft-id` renders the page shell (top bar, sidebar, bottom bar) without errors.
    - The STORYBOARD sidebar tab is active by default (highlighted icon).
    - "← Back" button in the bottom bar navigates to `/generate` (Step 1).
    - "Next: Step 3 →" button in the bottom bar is present (navigates to `/generate/road-map` as placeholder — Step 3 is not yet implemented).
    - `WizardStepper` is embedded in the top bar showing step 2 as active; import it from `features/generate-wizard/components/WizardStepper.tsx` (no duplication).
    - Autosave indicator area in top bar exists but renders "—" or empty (wired in subtask 8).
    - `WizardFooter` in Step 1 now navigates to `/storyboard/${draftId}` on Next.
    - No TypeScript errors. No raw `fetch` calls.
  - Test approach: `components/StoryboardPage.test.tsx` (Vitest + Testing Library): renders without crashing, back button exists with correct href, STORYBOARD tab is active by default, sidebar has 3 tabs.
  - Risk: **low** — routing change affects the wizard navigation. Verify that `WizardFooter` test suite (`WizardFooter.test.tsx`) still passes after the `navigate` target change.
  - Depends on: none (can be developed in parallel with subtasks 1–3)

- [ ] **5. Canvas: React Flow install + node types + port UI**
  - What: Install `@xyflow/react` as a dependency in `apps/web-editor`. Create custom node components: `StartNode.tsx`, `EndNode.tsx`, `SceneBlockNode.tsx` in `features/storyboard/components/`. Each node uses the design guide dark theme tokens. `SceneBlockNode` renders: scene name (auto "SCENE 01" if blank), prompt preview (first 80 chars, truncated), duration badge, up to 3 media thumbnail previews (placeholder SVG if none), media type badges, red ×  button (top-right). Both START and END nodes have a visible port handle but no inner fields. Wire `<ReactFlow>` into `StoryboardPage` canvas area. On page load: call `GET /storyboards/:draftId/initialize` then `GET /storyboards/:draftId` and hydrate the React Flow nodes and edges from the response.
  - Where: `apps/web-editor/src/features/storyboard/components/StartNode.tsx`, `EndNode.tsx`, `SceneBlockNode.tsx`, updated `StoryboardPage.tsx`
  - Why: The canvas is the core deliverable of the storyboard editor; custom node types give pixel-accurate control over the design.
  - Acceptance criteria:
    - `@xyflow/react` is listed in `apps/web-editor/package.json` dependencies.
    - On first visit (no blocks other than START/END), canvas renders a START node on the left and END node on the right, connected by nothing.
    - Adding a scene (via Add Block in subtask 6) renders a `SceneBlockNode` with the design-guide dark surface background, correct font tokens, and a placeholder thumbnail SVG if no media is attached.
    - Node dragging works (React Flow default behavior; ghost behavior override is in subtask 6).
    - Port handles are visible on hover: exit port (right side, all draggable nodes), income port (left side, all draggable nodes). START has only an exit port; END has only an income port.
    - Red × on `SceneBlockNode` triggers node removal from the React Flow state (no API call yet — wired to autosave in subtask 8).
    - All inline styles use design guide tokens (primary `#7C3AED`, surface `#0D0D14`, surface-elevated `#1E1E2E`, border `#252535`, text-primary `#F0F0FA`, text-secondary `#8A8AA0`).
    - No TypeScript errors.
  - Test approach: `components/SceneBlockNode.test.tsx` (Vitest + Testing Library): renders name, prompt truncation at 80 chars, shows placeholder SVG when no media, renders up to 3 thumbnail items, red × is present.
  - Risk: **medium** — React Flow is a new library in the project. Read `@xyflow/react` docs for v12 custom node pattern before implementing. Port handle customization (single income / single exit) requires the `Handle` component with `id` + `type='source'|'target'` props and connection validation via `isValidConnection`.
  - Depends on: subtask 4

- [ ] **6. Canvas: edges + ghost drag + auto-insert + Add Block**
  - What: Implement the three canvas interaction behaviours: (a) **Edge creation** — user drags from a source Handle to a target Handle; React Flow's built-in `onConnect` callback validates (one income per block, one exit per block) and adds the edge. (b) **Ghost drag** — override React Flow's default node drag to: freeze the node's visual position (show it as a semi-transparent ghost at the original location), move a translucent clone under the cursor; on drop either (b1) drop on an existing edge → auto-insert (remove the old edge, create two new edges: prev→dragged, dragged→next) or (b2) drop anywhere else → move the node to the drop position, update its connections to follow it. (c) **Add Block** — button in the bottom toolbar finds the first block without an exit edge and appends a new empty SCENE block after it (or after the last non-END block if all are connected); the new block is inserted into React Flow state.
  - Where: `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`, new `hooks/useStoryboardDrag.ts`, new `hooks/useAddBlock.ts`
  - Why: These are the defining interaction patterns of the canvas; without them the storyboard cannot be meaningfully composed.
  - Acceptance criteria:
    - Dragging from a source handle to a target handle creates an edge; dragging to a block that already has an income handle raises no error and the edge is silently rejected (validated by `isValidConnection`).
    - When a node is picked up for dragging, the node renders at 30% opacity in its original position; a full-opacity clone follows the cursor.
    - Dropping a dragged node onto an existing edge: the old edge disappears and two new edges appear — one from the edge's former source to the dragged node, one from the dragged node to the edge's former target. The dragged node's position updates to where it was dropped.
    - Dropping a dragged node onto empty canvas moves it to the drop coordinates and its connected edges follow (endpoints update to the new position).
    - "Add Block" finds the first block without an exit edge (scan in sort_order order) and appends a new empty scene block immediately to the right of it; the new block has a default name `SCENE N` where N is the current highest scene index + 1.
    - Auto-Arrange button renders in the toolbar but is disabled with a tooltip "Coming soon".
    - No TypeScript errors.
  - Test approach: `hooks/useAddBlock.test.ts` (Vitest): unit-tests for finding the correct insertion position when (a) no blocks exist, (b) all blocks connected, (c) multiple disconnected blocks — first is chosen. Ghost drag interaction tests are complex to unit-test; covered by a future Playwright E2E spec (out of scope for this task).
  - Risk: **high** — React Flow does not have a built-in "ghost drag" mode. Implementing it requires overriding `nodeDragStart`/`nodeDrag`/`nodeDragStop` events and managing a parallel overlay node. Study the React Flow event API carefully. Consider using a React Portal for the drag clone to avoid z-index issues with the canvas transform.
  - Depends on: subtask 5

- [ ] **7. Canvas: zoom + pan + keyboard shortcuts**
  - What: Configure React Flow canvas with zoom range 25%–200% (scroll-wheel driven). Add a zoom toolbar in the bottom-left of the canvas: "−" button, current zoom percentage display (e.g. "100%"), "+" button. Implement pan via drag on empty canvas area (React Flow `panOnDrag` prop). Wire keyboard shortcuts globally on the canvas: `Delete` key deletes the currently selected node (if it is a SCENE block — START/END cannot be deleted); `Ctrl+Z` triggers undo; `Ctrl+Y` / `Ctrl+Shift+Z` triggers redo. Undo/redo implementation delegates to the storyboard history store (subtask 8); at this stage, just call `historyStore.undo()` / `historyStore.redo()` which will be implemented in subtask 8 — use stubs if needed.
  - Where: `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`, new `components/ZoomToolbar.tsx`, new `hooks/useStoryboardKeyboard.ts`
  - Why: Zoom/pan and keyboard shortcuts are fundamental usability requirements; without zoom the canvas is unusable for larger storyboards.
  - Acceptance criteria:
    - React Flow `minZoom={0.25}` and `maxZoom={2.0}` are set; scroll-wheel zooms within those bounds.
    - "+" button increments zoom by 10%; "−" decrements by 10%; clamped to [25, 200].
    - Zoom toolbar percentage display updates in real-time as user scrolls.
    - Pan works by dragging on the canvas background (not on nodes).
    - Pressing `Delete` with a SCENE block selected removes it from the canvas; pressing `Delete` with START or END selected has no effect.
    - `Ctrl+Z` calls `historyStore.undo()`. `Ctrl+Y` calls `historyStore.redo()`. These are no-ops if the store is not yet wired.
    - `useStoryboardKeyboard` adds listeners on mount and removes on unmount (no listener leaks).
    - No TypeScript errors.
  - Test approach: `hooks/useStoryboardKeyboard.test.ts` (Vitest + jsdom): mock `historyStore.undo`/`redo`, fire synthetic keyboard events, assert the mocks are called. Assert Delete does not call anything when START or END node is "selected". `components/ZoomToolbar.test.tsx`: renders "100%", + click increments display, − click decrements, clamped at 25%/200%.
  - Risk: **low** — React Flow exposes `useKeyPress` and `onKeyDown` props; standard keyboard listener hooks. The only non-trivial part is preventing `Delete` on START/END nodes by checking `node.type !== 'start' && node.type !== 'end'`.
  - Depends on: subtask 5

- [ ] **8. Storyboard store + autosave + undo/redo history**
  - What: Create `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` (hand-rolled external store with `useSyncExternalStore`) holding the canonical storyboard state: `{ blocks: Block[], edges: Edge[], positions: Record<string, {x,y}> }`. Create `store/storyboard-history-store.ts` holding a stack of up to 50 state snapshots, persisted to the server via `POST /storyboards/:draftId/history`. Create `hooks/useStoryboardAutosave.ts` that debounces 30 seconds and calls `PUT /storyboards/:draftId` with the full current state; shows "Saved X ago" in the header indicator. Wire `beforeunload` guard that fires if there are unsaved changes. Implement `undo()` / `redo()` in the history store; on undo/redo, load the previous/next snapshot from the in-memory stack and update the canvas; also persist the restored snapshot to the server.
  - Where: `apps/web-editor/src/features/storyboard/store/storyboard-store.ts`, `store/storyboard-history-store.ts`, `hooks/useStoryboardAutosave.ts`, updated `StoryboardPage.tsx` (wire the autosave hook + header indicator)
  - Why: Autosave ensures no work is lost; server-persisted history enables the "return to specific save" feature across sessions; undo/redo are essential for non-destructive editing.
  - Acceptance criteria:
    - Every state mutation on the canvas (add block, delete block, move block, add edge, delete edge) pushes a new snapshot to the history store; the stack cap is 50 (oldest entry is dropped when exceeded).
    - Calling `historyStore.undo()` reverts the canvas to the previous snapshot and updates React Flow node/edge state accordingly. `redo()` re-applies the undone snapshot.
    - `useStoryboardAutosave` calls `PUT /storyboards/:draftId` no more than once every 30 seconds and only when the state has changed since the last save. It updates the header indicator to "Saved just now" immediately after a successful save, then "Saved X ago" on subsequent renders.
    - `beforeunload` fires a browser confirmation dialog when there are unsaved changes (state has diverged from last-saved snapshot).
    - On component mount, if the server returns history snapshots (`GET /storyboards/:draftId/history`), they are loaded into the in-memory history stack so undo works across sessions.
    - History snapshots are sent to `POST /storyboards/:draftId/history` asynchronously (fire-and-forget; failures are logged but do not surface errors to the user).
    - No TypeScript errors.
  - Test approach: `store/storyboard-history-store.test.ts` (Vitest): test push-caps-at-50 (add 55 snapshots, verify length is 50), undo moves index back, redo moves it forward, undo at bottom of stack is a no-op, redo at top is a no-op. `hooks/useStoryboardAutosave.test.ts` — mock `PUT /storyboards/:draftId`, advance fake timers by 30s, verify the call is made exactly once; verify it is NOT called again if state hasn't changed.
  - Risk: **medium** — the `beforeunload` guard must be registered and de-registered correctly to avoid leaks. Persisting history to the server on every undo-able action is a performance concern if blocks are large — keep snapshots to the graph structure only (exclude thumbnail data) to stay small.
  - Depends on: subtasks 2, 4, 5, 6, 7

---

## Open Questions / Blockers

1. **`/generate/road-map` redirect** — The existing `GenerateRoadMapPlaceholder` is registered at `/generate/road-map` in `main.tsx`. After this task, the real storyboard is at `/storyboard/:draftId`. The `WizardStepper` still references Step 2 as "Video Road Map" — consider renaming the label to "Storyboard" in a separate minor subtask, or leave as-is.

2. **Ghost drag implementation complexity** (subtask 6, risk: high) — React Flow v12 does not expose a native ghost-drag API. The recommended implementation approach: use the `nodeDragStart`, `nodeDrag`, `nodeDragStop` callbacks to track the dragged node ID; render a fixed-position `<div>` as the clone overlay (via `ReactDOM.createPortal`) that follows `clientX/Y`. This involves non-trivial DOM coordination. If this proves too complex within a single session, the implementing agent may ship standard React Flow drag (no ghost) and file it as a follow-up polish subtask.

3. **History persistence granularity** — `POST /storyboards/:draftId/history` is called on every undo-able action. If the user performs 50 rapid actions, this fires 50 API calls. Implementing agent should add a client-side debounce (e.g. 1 second) on history persistence — but still push every snapshot to the in-memory stack instantly so undo/redo is instantaneous.

4. **`storyboard_edges` UNIQUE constraints** — The migration adds `UNIQUE KEY uq_storyboard_edges_source (source_block_id)` and `UNIQUE KEY uq_storyboard_edges_target (target_block_id)` to enforce the one-in/one-out invariant at the DB level. The `PUT /storyboards/:draftId` endpoint does a full-replace (delete-all + re-insert) so these constraints only apply during the insert phase — the `DELETE` must run before the `INSERT` in the same transaction.

---

## Notes for the implementing agent

**Architecture decision documented here:** `generation_drafts` is the canonical "storyboard" entity in this codebase (see `StoryboardCardSummary.draftId`, migration `019_generation_drafts.sql`, status enum `'step2'`). All new tables use `draft_id CHAR(36)` as the FK to `generation_drafts.id` rather than introducing a separate `storyboards` table. This avoids duplicate entity concepts and reuses the existing dashboard card display logic.

**React Flow version:** Install `@xyflow/react` (v12+, the React-wrapper package). Do NOT install the older `reactflow` package. Use the `<ReactFlow>` component from `@xyflow/react`. Import CSS: `import '@xyflow/react/dist/style.css'` — this is the one exception to the "no CSS import" rule because it comes from a third-party library, not from application code.

**Styling:** All application-level node and toolbar styles use inline-style objects or `*.styles.ts` files per the project convention. The `@xyflow/react` stylesheet is the only external CSS import permitted.

**Domain skills loaded during planning:**
- `/task-design-sync` (UI-heavy feature — Stitch designs analyzed in the planning conversation)

**Relevant memory entries:**
- `Development workflow - Docker Compose` — all testing via `docker compose up`; not bare localhost.
- `Escalate architecture/product decisions to user` — any new decision not covered here must be escalated.
- `Design-reviewer approval for backend-only subtasks` — subtasks 1–3 (DB + API + catalog) are backend-only; no design review required for those. Subtasks 4–8 (frontend) require design review against the Stitch screens.

**Navigation mode used:** ROADMAP (via `docs-claude/roadmap.md` + `docs-claude/web-editor/roadmap.md`).

**Task B (to be planned separately):** Scene detail modal (all 6 fields), Library panel (Scene Templates CRUD + search), Effects panel (Visual Styles apply to one/all scenes + Animation stub). Do NOT implement these in Task A — scope is intentionally deferred.

**WizardFooter test suite:** After updating `navigate('/generate/road-map')` → `navigate(\`/storyboard/${draftId}\`)`, run `WizardFooter.test.tsx` to ensure no regressions. The `draftId` prop is already available in `WizardFooterProps`.

**Storyboard page Back navigation:** "← Back" in the bottom bar of the storyboard page should navigate to `/generate`. If the draft ID needs to be preserved for Step 1 to re-hydrate, pass it as a query param: `navigate(\`/generate?draft=${draftId}\`)`. Check `GenerateWizardPage` to see if it reads this param for re-hydration.

---
_Generated by task-planner skill — 2026-04-22_

---
**Status: Ready For Use By task-executor**
