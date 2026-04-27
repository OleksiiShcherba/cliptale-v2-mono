# Active Task

## Task
**Name:** SB-UI-BUGS — Library Add immediate render + Drag ghost fix
**Source:** Telegram user report 2026-04-27
**Goal:** (1) Clicking Add in the Library tab immediately renders the new block on the canvas without a reload; (2) during drag only the ghost portal moves — the original block stays at its original position until drop.

---

## Context

### Why this task matters
Both bugs degrade the storyboard editing experience. The Library Add bug makes scene templates feel broken — users reload the page thinking it didn't work. The drag bug breaks spatial reasoning — users can't see where the block started from while repositioning it. Both are regression-quality issues on a feature that shipped in Part B (ST-B3/ST-B4).

### Relevant architecture constraints
- §9 — `useCallback` deps must be complete; no inline closures that capture stale state
- §9.7 — `StoryboardPage.tsx` is exempt from 300-line cap; test split files required for new test cases
- Immediate-save pattern (from dev log): `setTimeout(() => void saveNow(), 0)` after setNodes to defer past React re-render
- React Flow two-state rule: visual canvas = React Flow `nodes` useState; persistence = autosave reads from that same state. External store `addBlockNode` is NOT sufficient to update the canvas — `setNodes` must always be called.
- `useStoryboardAutosave` signature: `(draftId, nodes, edges)` — reads React Flow state directly, not external store

### Related areas of the codebase
- `apps/web-editor/src/features/storyboard/components/LibraryPanel.tsx` (246L) — currently calls `addBlockNode` from store directly; owns `addToStoryboard` API call
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — owns `setNodes`, `saveNow`, `addBlock`; renders `<LibraryPanel>`
- `apps/web-editor/src/features/storyboard/store/storyboard-store.ts` — `addBlockNode(block, onRemove)` converts `StoryboardBlock` → React Flow node shape and inserts into external store only
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.ts` — drag lifecycle (start: dims opacity; move: ghost follows cursor; end: reset)
- `apps/web-editor/src/features/storyboard/__tests__/LibraryPanel.test.tsx` — existing tests mock `addBlockNode`; need updating
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.save-on-add.test.tsx` — tests for add-block autosave; extend for library-add flow
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.test.ts` — drag tests; extend for mid-drag suppression

### Reuse audit
- `useHandleAddBlock.ts` — pattern reference: calls `setNodes` + external store + `saveNow`; cannot be used directly (it creates a fresh block; LibraryPanel needs to add a pre-existing API-returned block)
- `storyboard-store.addBlockNode(block, onRemove)` — existing converter from `StoryboardBlock` → React Flow `Node`; keep calling it after `setNodes` if needed for external store consistency, or call `blockToNode` directly
- `StoryboardPage handleConnect / addBlock` — patterns for how StoryboardPage passes callbacks down to child components

---

## Subtasks

- [x] **SB-UI-BUG-1: Fix Library Add — immediate canvas render**
  - What: Lift the `addToStoryboard` + canvas-update flow out of LibraryPanel into StoryboardPage as a `handleAddFromLibrary(templateId)` callback, so `setNodes` can be called with the new node immediately after the API returns the block.
  - Where: `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` (add handler, pass as prop to LibraryPanel); `apps/web-editor/src/features/storyboard/components/LibraryPanel.tsx` (accept `onAddTemplate(templateId)` prop, remove direct `addToStoryboard` + `addBlockNode` calls); `apps/web-editor/src/features/storyboard/__tests__/LibraryPanel.test.tsx` (update mock)
  - Why: LibraryPanel currently calls `addBlockNode` (external store only) but StoryboardPage's canvas is driven by React Flow `nodes` useState — they are not connected. Only StoryboardPage can call `setNodes`.
  - Acceptance criteria:
    - After clicking Add in Library tab, the new scene block appears on the canvas **without a page reload**
    - The new block is positioned with sensible defaults (not at 0,0 or off-screen)
    - An autosave PUT fires within 5 s of clicking Add (same as the existing useHandleAddBlock pattern)
    - `LibraryPanel` no longer imports `addBlockNode` from the store directly
    - `LibraryPanel` accepts an `onAddTemplate: (templateId: string) => Promise<void>` prop
    - Existing LibraryPanel test updated: `addBlockNode` mock removed; `onAddTemplate` spy added and asserted
    - New test in `StoryboardPage.save-on-add.test.tsx`: mock `addToStoryboard` API, simulate Library Add click, assert `setNodes` receives the new node (or assert the node appears in rendered output)
  - Test approach: Update `LibraryPanel.test.tsx` (mock `onAddTemplate` prop instead of `addBlockNode`). Extend `StoryboardPage.save-on-add.test.tsx` with a test case that mocks the API and verifies `setNodes` is called with the new node after `handleAddFromLibrary`.
  - Risk: Med — the `addToStoryboard` API call moves from LibraryPanel to StoryboardPage; any error handling (loading state, toast) in LibraryPanel that references the API call directly must be re-threaded. Check if LibraryPanel shows a loading spinner during the API call and preserve that behavior via a returned `Promise`.
  - Depends on: none

- [x] **SB-UI-BUG-2: Fix drag — suppress original node position during drag**

---

## Open Questions / Blockers

⚠️ **SB-UI-BUG-1 — LibraryPanel loading state:** LibraryPanel may show a spinner or disable the Add button while `addToStoryboard` is in-flight. If this logic is tied to internal component state, it must be preserved when the API call moves to `StoryboardPage`. Options: (a) keep a local `isAdding` state in LibraryPanel driven by the Promise returned by `onAddTemplate`; (b) `onAddTemplate` returns a `Promise` and LibraryPanel uses `.then`/`catch` to set loading. Either is fine — just don't silently drop the loading UX.

⚠️ **SB-UI-BUG-2 — React Flow v12 drag event contract:** Confirm that React Flow v12 always emits a `{ type: 'position', dragging: false }` event at the end of every drag (not just on `onNodeDragStop`). If it doesn't, the final position would never be committed. Quick check: look at `useStoryboardDrag.ts` to see if `onNodeDragStop` or `onNodeDrag` is also in play — if the final position is committed via a different path, the filter is still safe.

---

## Notes for the implementing agent
- **Navigation mode:** EXPLORE (no docs-claude/ roadmap)
- **Branch:** Cut fresh from `origin/master` as `fix/storyboard-ui-bugs` — `git fetch origin && git checkout -b fix/storyboard-ui-bugs origin/master`
- **Critical staging warning:** Working tree has unrelated uncommitted files (.claude/ memory, playwright-report/, test-results/). NEVER stage with `git add .` or `git add -A`. Stage only explicitly named files.
- **Two-store rule (non-negotiable):** React Flow canvas = `nodes` useState. External store = for legacy uses. `setNodes` MUST be called for any canvas update to be visible. See dev log "React Flow two-state system" entry.
- **Immediate-save pattern:** `setTimeout(() => void saveNow(), 0)` after `setNodes` — not `saveNow()` directly. Defers until after React re-render so `nodesRef.current` reflects new state.
- **SB-UI-BUG-1 node positioning:** When adding a library block to the canvas, place it at a sensible offset from the last node or at a fixed default (e.g., `{ x: 300, y: 200 }`). Check how `useHandleAddBlock.ts` positions new blocks and replicate.
- **SB-UI-BUG-2 filter scope:** Only filter `{ type: 'position', dragging: true }`. Pass all other change types (select, remove, dimensions, reset) through unchanged. Use a clear, named variable like `nonDraggingChanges`.
- **Relevant memory entries:**
  - `feedback_branch_from_master.md` — always `git fetch origin && git checkout -b <name> origin/master`
  - `feedback_task_workflow.md` — orchestrator → senior-dev → reviewers; never skip planner
  - `project_cliptale_deploy.md` — deployment at `15-236-162-140.nip.io`
- **Domain skills loaded:** None (no Remotion/Figma/Anthropic SDK keywords). Pure React/React Flow fix.

---
_Generated by task-planner skill — 2026-04-27_

---
**Status: Ready For Use By task-executor**
