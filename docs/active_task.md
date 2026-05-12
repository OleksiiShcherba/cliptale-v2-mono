# Active Task — Required Work 1: Storyboard Stabilization Finish

## Source Backlog Item

From `docs/general_tasks.md` → `Required work` item 1:

> Stabilize existing Storyboard behavior before building automation.

## Goal

Finish the remaining storyboard stabilization work so Step 2 can be trusted before adding AI storyboard planning. The target behavior is:

- Editing a scene persists prompt/media/style/duration changes and the block updates immediately.
- Loading a storyboard opens the last saved/restored graph instead of a sentinel-only or empty canvas.
- Add/edit/delete/connect/restore/undo/redo paths are covered by focused unit tests and E2E coverage.

## Current Context

Recent logs show most storyboard stabilization work has already landed:

- Scene modal save now updates `node.data.block` and calls immediate autosave.
- `loadStoryboard` initializes sentinels idempotently and advances drafts to `step2`.
- History restore re-wires scene node `onRemove` and updates React Flow state.
- Drag, connect, add-block, library add, knife cut, thumbnail capture, and history persistence have focused tests.
- `e2e/helpers/storyboard.ts` exists and should be used by storyboard E2E specs.

Remaining known risk from `docs/development_logs.md`:

- Keyboard undo/redo is broken because `storyboard-history-store` applies snapshots only to the external storyboard store while React Flow renders from `StoryboardPage` local `useState`.
- Older storyboard E2E specs still need to use `e2e/helpers/cors-workaround.ts` and `e2e/helpers/storyboard.ts`.

## Implementation Plan

### Subtask 2 — Verify load/restore does not overwrite saved storyboard state

Files to inspect/update:

- `apps/web-editor/src/features/storyboard/hooks/useStoryboardCanvas.ts`
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardHistorySeed.ts`
- `apps/web-editor/src/features/storyboard/hooks/useStoryboardAutosave.ts`
- `apps/web-editor/src/features/storyboard/store/storyboard-store.ts`
- `apps/api/src/services/storyboard.service.ts`
- Existing tests near `useStoryboardHistorySeed.test.ts`, `useStoryboardCanvas.test.ts`, `useStoryboardAutosave.*.test.ts`, and `storyboard.service.*.test.ts`

Requirements:

- Initial page load must use server storyboard blocks/edges when they exist.
- Auto-restore from latest history must not persist stale sentinel-only React state.
- Manual restore must persist the restored graph after React state is updated.
- If the server has only sentinels, the page still initializes START and END once without duplicates.

Acceptance criteria:

- Tests cover "server has scenes → canvas renders scenes".
- Tests cover "history auto-seed restore → no immediate stale save".
- Tests cover "manual restore → save is scheduled after restored nodes are committed".
- Existing sentinel dedupe tests continue to pass.

### Subtask 3 — Confirm scene edit persistence including media items

Files to inspect/update:

- `apps/web-editor/src/features/storyboard/hooks/useSceneModal.ts`
- `apps/web-editor/src/features/storyboard/components/SceneModal.tsx`
- `apps/web-editor/src/features/storyboard/components/SceneBlockNode.tsx`
- `apps/web-editor/src/features/storyboard/api.ts`
- `apps/api/src/repositories/storyboard.repository.ts`
- Existing tests near `useSceneModal.test.ts`, `SceneModal.test.tsx`, `SceneBlockNode.test.tsx`, and `storyboard.integration.test.ts`

Requirements:

- Saving prompt/name/duration/style updates the visible block without reload.
- Saving media changes persists through `PUT /storyboards/:draftId`.
- Media item IDs remain valid UUIDs for newly linked media.
- Re-opening the modal after save shows the current block values.

Acceptance criteria:

- Unit tests cover prompt/style/duration immediate UI state update.
- Unit or integration tests cover media item persistence in the save payload.
- Existing E2E "Edit Scene modal Save triggers PUT" remains valid and should assert a visible block text update if practical.

### Subtask 4 — Refresh storyboard E2E coverage around required flows

Files to inspect/update:

- `e2e/storyboard-fixes.spec.ts`
- `e2e/storyboard-history-regression.spec.ts`
- `e2e/storyboard-canvas.spec.ts`
- `e2e/storyboard-drag.spec.ts`
- `e2e/helpers/storyboard.ts`
- `e2e/helpers/cors-workaround.ts`

Requirements:

- Reuse shared helpers for auth token, draft creation, storyboard initialization, cleanup, canvas wait, and CORS workaround.
- Keep coverage for add/edit/delete/connect/restore.
- Add or update coverage for keyboard undo/redo changing the rendered canvas, not just the external store.
- Avoid duplicating old helper code in older specs.

Acceptance criteria:

- E2E specs create and clean up their own draft.
- At least one E2E test proves reload after save shows the last saved storyboard state.
- At least one E2E test proves keyboard undo/redo visibly changes the storyboard graph.

## Validation Commands

Run focused checks first:

```bash
docker compose exec -T -w /app/apps/web-editor web-editor npx vitest run src/features/storyboard
docker compose exec -T -w /app/apps/api api npm run test -- src/services/storyboard.service.test.ts src/services/storyboard.service.status.test.ts src/__tests__/integration/storyboard.integration.test.ts
E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3000 npx playwright test e2e/storyboard-fixes.spec.ts e2e/storyboard-history-regression.spec.ts
```

Then run broader checks if the focused suite passes:

```bash
docker compose exec -T -w /app/apps/web-editor web-editor npm run typecheck
docker compose exec -T -w /app/apps/api api npm run typecheck
```

Known baseline caveat from `docs/development_logs.md`: workspace-wide web-editor typecheck has pre-existing failures outside recent storyboard work. If typecheck still fails, record whether changed storyboard files introduce any new errors.

## Out of Scope

- Required Work 2 draft model changes.
- Required Work 3 AI storyboard planning endpoint/job.
- Required Work 4+ automatic scene creation, scene illustration generation, and Step 3 project creation.
- Reworking the Storyboard UI design unless needed to fix broken behavior.

## Completion Notes To Add Later

When complete, append a short entry to `docs/development_logs.md` with:

- Files changed.
- Behavior fixed.
- Focused tests/E2E run and results.
- Any remaining known issues.
