# Active Task

## Task
**Name:** Storyboard Polish — SB-POLISH-1 (history thumbnail real-fix + drag autosave + Ctrl knife tool)
**Source:** Telegram client feedback — 2026-04-29 (raw feedback supplied directly by the user, not yet appended to `docs/feedback.md`)
**Goal:** The Video Road Map (storyboard) canvas must (1) render real-graph thumbnails in the History panel, (2) treat node drag as a saveable change that lands in autosave + history, and (3) offer a Ctrl-hold knife tool that disconnects edges on click.

---

## Context

### Why this task matters
The storyboard editor is the centrepiece of the new video-creation flow (Step 2 of the wizard). The user has just been QA-ing the current build and surfaced three usability gaps in a single Telegram session, attaching a screenshot that shows the SCENE 1 → END graph beside two completely black history thumbnails — the same defect commits `218e694` / `a9d3d1a` (SB-HIST-THUMB) were supposed to fix two days ago. The previous fix (adding `imagePlaceholder` + `crossOrigin="anonymous"`) addressed cross-origin image rejection only; it did **not** address the real cause of an all-black JPEG, so the user is now frustrated and explicitly asked for a real fix, not another patch. Combined with these issues, drag movement isn't being persisted reliably, and there is no quick way to disconnect edges between blocks. Ship them together as one polish pass on the canvas.

### Relevant architecture constraints
- 300-line cap per file (architecture-rules §9.7). `StoryboardPage.tsx` is currently at 354 lines including comments — already over by extension precedent for `storyboard-store.ts` (307L) but **must not grow**. Any new logic must land in a new hook file.
- Web-editor styling: inline-style + `*.styles.ts` only — no CSS files, no CSS-in-JS lib (web-editor roadmap §Styling). For the cursor swap, use a `style.cursor` prop or a class toggled on the React Flow wrapper `<div>` via inline `style`.
- React Flow two-state rule (development_logs §Architectural Decisions): always call `setNodes`/`setEdges` to mutate the canvas — external store alone does not update React Flow. Must apply to knife-tool edge removal.
- Storyboard IDs: `crypto.randomUUID()` (server schema requires UUID). Knife tool deletes edges only — no new IDs needed.
- Storyboard autosave: reads React state via params + refs, NOT external store (development_logs). Must keep that contract.
- `setTimeout(() => void saveNow(), 0)` is the established pattern for triggering an immediate save after a React state change (development_logs).
- All testing goes through Docker Compose, not bare localhost (`project_dev_workflow` memory).
- Do not introduce new architecture/product decisions without escalation (`feedback_escalate_architecture` memory) — the three changes here are bug fixes / small UX additions and are within scope.

### Related areas of the codebase
- `apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.ts` — current 30-line thumbnail capture utility; uses `html-to-image#toJpeg(.react-flow, { width: 320, height: 180, pixelRatio: 1 })`. The `width`/`height` options on `toJpeg` set destination canvas size but **do not scale** the source DOM, so the output is a top-left crop of a much larger viewport — and on JPEG the transparent area becomes black.
- `apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.test.ts` — only mocks `toJpeg`; never proves a real DOM produces a non-black JPEG. This is why the original SB-HIST-THUMB landed despite the bug remaining.
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardHistoryPush.ts` — calls `captureCanvasThumbnail()` then pushes the snapshot with the `thumbnail` field. Push is async; consumers use `void pushSnapshot(...)`.
- `apps/web-editor/src/features/storyboard/components/StoryboardHistoryPanel.tsx` — renders `entry.snapshot.thumbnail` as `<img>` if present, else falls back to `<SnapshotMinimap>`. Currently every entry has a thumbnail string but the string is a black JPEG — that is why the user sees black squares, not minimaps.
- `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` — orchestrator. `handleNodesChange` filters `{type:'position', dragging:true}` mid-drag events but lets `dragging:false` (drop) commit; on commit it calls `pushSnapshot` and `setTimeout(saveNow, 0)`. This file must stay at/under 354 lines (already over the 300 cap — Plan §1d below extracts to a new hook to avoid growth).
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.ts` — owns ghost drag (original goes to 30% opacity; portal clone follows cursor). On `onNodeDragStop`, restores opacity and runs auto-edge-insert; **does not** itself call `saveNow` — relies on React Flow's `position` `dragging:false` event to flow through `handleNodesChange`. This is the suspect path for issue #2.
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardKeyboard.ts` — global keydown listener registered on `window`. Already handles `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`. New knife-mode listener must coexist (no double-bind on `Ctrl+Z` etc.).
- `apps/web-editor/src/features/storyboard/components/StoryboardCanvas.tsx` — renders `<ReactFlow>` with `panOnDrag` enabled. Knife mode must not start a pan when the user click-drags across an edge.
- `apps/web-editor/src/features/storyboard/components/storyboardPageStyles.ts` — `SURFACE = '#0D0D14'`; needed as the explicit background for the JPEG capture so it is not black.

### Reuse audit
- `captureCanvasThumbnail.ts` — extend, do not replace. Still the right seam for capture; bug is in its options + target selector.
- `captureCanvasThumbnail.test.ts` — extend with at least one test that verifies the real options shape (target selector, backgroundColor, computed width/height). The unit test cannot exercise real `html-to-image` rendering, so an E2E test is needed (see subtask 2).
- `useStoryboardHistoryPush.ts` — no change needed; thumbnail wiring already correct, only `captureCanvasThumbnail` returns the wrong pixel data.
- `useStoryboardDrag.ts` — extend `handleNodeDragStop` to fire `saveNow` directly (defence-in-depth) AND/OR keep relying on `handleNodesChange`; senior-dev to verify which path the actual `dragging:false` event takes when ghost drag is active.
- `useStoryboardKeyboard.ts` — DO NOT add knife-mode logic here. Knife mode is canvas-scoped (cursor + edge interaction), not global. Add a sibling hook `useStoryboardKnifeTool.ts`.
- `StoryboardPage.tsx` — over-cap; prefer adding a single hook call (`useStoryboardKnifeTool({ ... })`) and keeping all knife logic in the new hook. Only thread the cursor class through `<StoryboardCanvas>` if needed.
- `StoryboardCanvas.tsx` — currently 184 lines; can accept an optional `cursorMode: 'grab' | 'knife'` prop to style the wrapper. Extension point is clean.
- E2E coverage: `e2e/storyboard-fixes.spec.ts` already contains an SB-HIST-THUMB test that intercepts the history POST and asserts `snapshot.thumbnail` matches `^data:image/`. Extend it (do not duplicate) with an assertion that the thumbnail is **not all-black** (sample pixel via canvas `getImageData`).

---

## Subtasks

### 1. Diagnose root cause of black-thumbnail JPEG (SB-POLISH-1a)
- [ ] **Diagnose root cause of black-thumbnail JPEG**
  - What: Reproduce the black-thumbnail bug locally in the Docker Compose stack and confirm which of the candidate causes is real (transparent background flattened by JPEG encoding, top-left-crop because `width`/`height` is destination-only and not a scale, capture happens before viewport DOM has dimensions, wrong DOM target — `.react-flow` vs `.react-flow__viewport`, or pixelRatio interaction with devicePixelRatio).
  - Where: `apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.ts` (read), `apps/web-editor/src/features/storyboard/components/StoryboardCanvas.tsx` (read for DOM tree). No edits in this subtask — diagnosis only; senior-dev produces a one-paragraph note in the PR description identifying the cause(s).
  - Why: Previous SB-HIST-THUMB fix landed without ever proving the real DOM produces a non-black JPEG; a fix without diagnosis will likely land the same outcome again. Force the diagnosis to come first.
  - Acceptance criteria:
    - Senior-dev attaches one paragraph in the PR description naming the confirmed root cause(s) with at least one piece of evidence (a screenshot of dev-tools showing the captured DOM tree's bounding rect, or a console-logged data URL piped through a script that confirms all bytes are #000000).
    - The chosen fix in subtask 2 is justified against this diagnosis.
  - Test approach: Manual repro on the deployed instance at `https://15-236-162-140.nip.io` (the docker-compose-mounted web-editor) — open storyboard, add a SCENE block, open History, save the data URL from devtools, decode it, confirm the JPEG is all-black.
  - Risk: low — read-only investigation.
  - Depends on: none.

### 2. Fix `captureCanvasThumbnail` to produce a real graph thumbnail (SB-POLISH-1b)
- [ ] **Fix captureCanvasThumbnail to render the actual graph**
  - What: Update `captureCanvasThumbnail` so the resulting JPEG shows the real React Flow graph (nodes + edges) at the time of capture, not a black square. Most likely fix: pass `backgroundColor: '#0D0D14'` (SURFACE) so JPEG flatten is not black; capture the React Flow root element via `getBoundingClientRect()` to compute correct `width`/`height`/`pixelRatio` (or capture `.react-flow__viewport` and apply an explicit transform). Confirm with subtask 1 diagnosis before picking the exact mix.
  - Where: `apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.ts`, `apps/web-editor/src/features/storyboard/utils/captureCanvasThumbnail.test.ts`.
  - Why: Resolves the original user complaint and earns back trust after the previous half-fix.
  - Acceptance criteria:
    - On the deployed instance, after dragging or adding a block, the right-rail History panel's most-recent entry shows a recognisable thumbnail of the canvas (purple SCENE block + END block + connecting edge), not a black rectangle.
    - The function still returns `null` (does not throw) when `.react-flow` is missing or when `toJpeg` rejects.
    - The data URL the function returns decodes to a JPEG whose mean pixel brightness is > 5/255 across at least the central 50% of the image (i.e. demonstrably not all-black).
  - Test approach: Update `captureCanvasThumbnail.test.ts` to assert the new options (`backgroundColor`, computed `width`/`height` from a stubbed `getBoundingClientRect`). Add an E2E assertion in `e2e/storyboard-fixes.spec.ts` SB-HIST-THUMB block: load the captured `data:image/jpeg;base64,...` into an `<img>` inside the page, draw to a canvas, sample 25 pixels in the centre quarter, assert at least one channel > 8 on at least 5 of those pixels (loose threshold to tolerate lossy JPEG).
  - Risk: med — depends on `html-to-image` interactions with React Flow's viewport transform; rendering may differ between browsers.
  - Depends on: 1.

### 3. Trigger autosave + history snapshot reliably on node drag (SB-POLISH-1c)
- [ ] **Make node-position changes flow into autosave and history**
  - What: Verify that dragging a SCENE / START / END node to a new position commits the new `position` to React state, fires `pushSnapshot`, and triggers `saveNow()`. If the existing `handleNodesChange` path does not fire reliably under ghost-drag, also call `pushSnapshot(updatedNodes, edges)` and `setTimeout(() => void saveNow(), 0)` from `useStoryboardDrag#handleNodeDragStop` after committing the dropped position via `setNodes`. Pick belt-and-braces (both paths) only if the React Flow `dragging:false` event is not actually firing under ghost drag.
  - Where: `apps/web-editor/src/features/storyboard/hooks/useStoryboardDrag.ts`, `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`.
  - Why: The user explicitly reports drag changes are not saving. Currently autosave depends entirely on React Flow's `position dragging:false` event reaching `handleNodesChange`; under ghost-drag with the original at 30% opacity this is fragile. Defence-in-depth makes drop a first-class save trigger.
  - Acceptance criteria:
    - Dragging any node to a new position and waiting 500 ms causes the autosave indicator in the top bar to enter "Saving…" then "Saved just now" without any other interaction.
    - Reloading the page restores the dragged position (covered by existing `PUT /storyboards/:draftId`).
    - A new History entry appears within 1 s of the drop.
    - No double-snapshot: dropping a node produces exactly **one** snapshot push (verify by counting `POST /storyboards/:draftId/history` calls).
  - Test approach: Extend `e2e/storyboard-fixes.spec.ts` with an "SB-POLISH-1c drag triggers save" test that drags a SCENE block by ~80 px, awaits 6 s (autosave debounce + buffer), and asserts `PUT /storyboards/:draftId` fired with the new `positionX`. Add a Vitest unit test in `useStoryboardDrag.test.ts` that asserts `handleNodeDragStop` calls a passed-in `saveNow` mock once when invoked with a SCENE node. Also assert `pushSnapshot` mock is called exactly once.
  - Risk: med — risk of double-saves if both `handleNodesChange` AND `handleNodeDragStop` fire saves; senior-dev must verify exactly-once via mock counts.
  - Depends on: none (parallel to 1/2).

### 4. Add `useStoryboardKnifeTool` hook — Ctrl held on canvas (SB-POLISH-1d)
- [ ] **Add knife-tool hook with cursor swap and edge-cut**
  - What: Create a new hook `useStoryboardKnifeTool` exporting `{ isKnifeActive: boolean, onPaneClick, onEdgeClick }` (or similar React Flow handler shape). Hook owns: a `window` `keydown`/`keyup` listener that flips `isKnifeActive` while the user holds Ctrl with no other key currently down; a way to detect when the next non-modifier key is pressed (e.g. `z`) so `Ctrl+Z` still flows to `useStoryboardKeyboard`'s undo and the knife state ignores combo keys. The hook must NOT consume the keydown/up events (no `preventDefault`).
  - Where: new file `apps/web-editor/src/features/storyboard/hooks/useStoryboardKnifeTool.ts`, new file `apps/web-editor/src/features/storyboard/hooks/useStoryboardKnifeTool.test.ts`.
  - Why: Keeps knife logic isolated from the over-cap `StoryboardPage.tsx` and the unrelated `useStoryboardKeyboard` (which is window-scoped by definition for Delete/Ctrl+Z). New hook is canvas-scoped state + an edge-removal callback.
  - Acceptance criteria:
    - `isKnifeActive` becomes `true` while Ctrl (or Meta on macOS) is held alone and `false` on keyup or when any non-modifier key is also pressed (so `Ctrl+Z` does NOT enter knife mode).
    - The hook exposes a `cutEdge(edgeId: string): void` callback that removes the edge from the React Flow `edges` state via the supplied `setEdges`, and triggers `pushSnapshot(nodes, edgesWithoutDeleted)` plus `setTimeout(() => void saveNow(), 0)` — same shape as `handleConnect` reverse.
    - Listeners are removed on unmount with no leaks.
  - Test approach: Vitest. Mount the hook in a fixture that supplies stub `setEdges` / `pushSnapshot` / `saveNow`. Dispatch synthetic `keydown` Ctrl → assert `isKnifeActive === true`. Dispatch `keydown` `Z` while Ctrl held → assert `isKnifeActive === false`. Dispatch `keyup` Ctrl → assert `false`. Call `cutEdge('e1')` → assert `setEdges` called with a function that returns the array minus the e1 edge AND `pushSnapshot` + `saveNow` mocks each called once.
  - Risk: low — pure hook with stubbed deps; no DOM or React Flow runtime needed.
  - Depends on: none.

### 5. Wire knife-tool into the canvas — cursor + edge-click (SB-POLISH-1e)
- [ ] **Apply knife cursor and disconnect-on-click in StoryboardCanvas**
  - What: Thread `isKnifeActive` from `useStoryboardKnifeTool` down to `StoryboardCanvas`. Apply `style.cursor` on the React Flow wrapper `<div>` — `'crosshair'` (closest standard cursor to "knife") when active, default otherwise. While `isKnifeActive`, set the React Flow `panOnDrag={false}` and pass an `onEdgeClick` prop that calls `cutEdge(edge.id)`. Optionally, when `isKnifeActive`, also set `nodesDraggable={false}` so accidentally clicking a node mid-cut does not start a drag — leave that decision to the senior-dev based on UX feel.
  - Where: `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`, `apps/web-editor/src/features/storyboard/components/StoryboardCanvas.tsx`.
  - Why: Bridges the hook to the user-visible behaviour. Cursor swap is required by the user; the click-to-cut is the actual edge-disconnect.
  - Acceptance criteria:
    - Holding Ctrl on the canvas: cursor visually changes to a crosshair on the React Flow surface.
    - Releasing Ctrl: cursor reverts to the default React Flow cursor.
    - Clicking an existing edge between two blocks while Ctrl held: edge is removed visually within one frame; History panel shows a new entry within 1 s; autosave indicator enters "Saving…".
    - Click on empty canvas while Ctrl held: no-op (does not pan, does not snapshot).
    - Other Ctrl shortcuts (`Ctrl+Z`, `Ctrl+Y`) still function unchanged.
  - Test approach: Extend `e2e/storyboard-fixes.spec.ts` with "SB-POLISH-1e Ctrl knife cuts edge": connect SCENE→END (already wired), hold Ctrl via `page.keyboard.down('Control')`, click the edge midpoint via `page.locator('.react-flow__edge').first().click()`, assert `.react-flow__edge` count drops by 1 and `PUT /storyboards/:draftId` fired with the new edge list. Cursor swap covered by an in-test `page.locator('.react-flow').evaluate(el => getComputedStyle(el).cursor)` assertion.
  - Risk: med — React Flow's edge hit-testing is small (the SVG path itself); the senior-dev should ensure clicks on visible parts of the edge are reliably caught (consider `interactionWidth` prop on the edge if needed).
  - Depends on: 4.

### 6. Verify `StoryboardPage.tsx` did not grow past current 354 lines (SB-POLISH-1f)
- [ ] **Hold the line-cap delta at zero**
  - What: After subtasks 3 and 5 land, confirm `StoryboardPage.tsx` line count is ≤ its current size (354). If exceeded, extract the wiring (knife hook + drag-stop wiring) into a small `useStoryboardCanvasHandlers` hook and re-run the count.
  - Where: `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`.
  - Why: File is already over the 300-line cap; growing it further compounds the technical debt. Architecture-rules §9.7 lists existing exceptions and requires justification for new ones.
  - Acceptance criteria:
    - `wc -l apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx` returns ≤ 354.
    - If extraction is needed, the new hook lives under `apps/web-editor/src/features/storyboard/hooks/`.
  - Test approach: existing `StoryboardPage.test.tsx` (and any extracted-hook tests) must still pass — `npm --workspace @cliptale/web-editor run test`.
  - Risk: low — mechanical refactor.
  - Depends on: 3, 5.

---

## Open Questions / Blockers
None identified. The screenshot is unambiguous (real graph rendered, two black thumbnails), `html-to-image` is on a stable version (`^1.11.13`), React Flow is `@xyflow/react` v12 with documented `onEdgeClick` and `panOnDrag` props, and the existing test scaffolding at `e2e/storyboard-fixes.spec.ts` is the right place to extend coverage.

One soft risk to flag for the senior-dev: subtask 2's E2E assertion (sample pixels to prove "not all-black") is fragile across headless-Chromium font/render variations. If it flakes, downgrade to "thumbnail data URL is at least 2 KB" (an empty 320×180 black JPEG is ~700 B) — that is a coarser but still-meaningful "not the empty-black case" check.

---

## Notes for the implementing agent

- **Do not invoke any skills or sub-agents to plan further.** This plan is the contract; implement to it.
- The previous SB-HIST-THUMB attempt landed without a runtime check that the JPEG had real pixels. Do not repeat that. Do the real diagnosis (subtask 1) before you write the fix (subtask 2). The user will check.
- React Flow v12 emits `dragging:false` on the dropped node as a `position` change. Confirm with a `console.log` whether that event reaches `handleNodesChange` while ghost-drag is active before deciding belt-and-braces vs single-path for issue #2.
- For the knife tool, prefer the React Flow `onEdgeClick` callback over manual hit-testing — it's already wired through React Flow's SVG `pointerdown` and respects the `interactionWidth` prop. That keeps the implementation small.
- All changes are in `apps/web-editor/`. Per `feedback_design_reviewer_backend` memory, this is **frontend-only** — design review is in scope and will look at the cursor/crosshair feel and the History panel thumbnail rendering.
- Cite this plan's task name `SB-POLISH-1a/b/c/d/e/f` in commit messages so dev-logs cleanly track progress.
- **Domain skills loaded during planning:** none. The work is React + DOM + React-Flow specific; none of `/remotion-best-practices`, `/task-design-sync`, `/claude-api`, `/playwright-reviewer` matched. (Playwright is touched but only via existing helpers.)
- **Memory entries consulted:** `feedback_escalate_architecture` (no escalation needed — fixes are within scope), `feedback_design_reviewer_backend` (does NOT apply — these are FE changes), `project_dev_workflow` (testing via Docker Compose), and the running development_logs entries on storyboard architecture invariants. The previous SB-HIST-THUMB log entry (2026-04-28 in development_logs.md) was followed in spirit but proved insufficient — its `imagePlaceholder` + `crossOrigin="anonymous"` patches stay in place; subtask 2 layers the real fix on top.
- **Navigation mode used during analysis:** ROADMAP — `docs-claude/roadmap.md` and `docs-claude/web-editor/roadmap.md` were read first, supplemented by targeted Reads of the specific storyboard files (`captureCanvasThumbnail.ts`, `useStoryboardHistoryPush.ts`, `storyboard-history-store.ts`, `StoryboardHistoryPanel.tsx`, `StoryboardPage.tsx`, `useStoryboardDrag.ts`, `useStoryboardAutosave.ts`, `useStoryboardKeyboard.ts`, `StoryboardCanvas.tsx`, `useStoryboardCanvas.ts`).

---
_Generated by task-planner agent — 2026-04-29_

---
**Status: Ready For Use By task-executor**
