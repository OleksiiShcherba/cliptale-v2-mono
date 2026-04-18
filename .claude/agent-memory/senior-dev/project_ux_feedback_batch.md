---
name: Project: Editor + Generate-Wizard UX Feedback Batch
description: 6-item UX feedback batch (editor home nav, hydration, manual save, wizard back-nav, chip deletion, drag-drop + chip X-icon); ALL 6 subtasks COMPLETE (2026-04-17)
type: project
---

Task: Editor + Generate-Wizard UX Feedback Batch (6 items)
Source: `docs/general_tasks.md` FEEDBACK block

**Subtask 1 — COMPLETE (2026-04-17)**
Add Home button to editor TopBar.
- Pattern: added `onNavigateHome: () => void` prop to `TopBarProps` — TopBar stays a pure presentational component; App.tsx wires `navigate('/')` into the prop.
- Both mobile and desktop `<TopBar>` invocations in App.tsx receive `onNavigateHome={handleNavigateHome}`.
- Style uses `BORDER` + `TEXT_SECONDARY` tokens, 4px/8px spacing — no new hex literals.
- Tests in `TopBar.test.tsx` (4 new cases) — renders, click callback, leftmost position check.

**Subtask 2 — COMPLETE (2026-04-17)**
Hydrate ProjectDoc from latest version on editor mount.
- BE: `getLatestVersion(projectId)` added to `version.service.ts`; controller handler + `GET /projects/:id/versions/latest` route registered with `authMiddleware` + `aclMiddleware('viewer')`.
- Route ordering note: `GET /projects/:id/versions/latest` must be registered BEFORE any `/:versionId/*` patterns to avoid "latest" matching the param capture group.
- FE: `fetchLatestVersion(projectId)` added to `features/version-history/api.ts`; `useProjectInit` now has a `hydrating` state between `loading`/creation and `ready`. On success calls `setProjectSilent` + `setCurrentVersionId` (no patches to history-store). On 404 falls through to blank seed.
- New `hydrating` discriminant in `ProjectInitState` union — callers of `useProjectInit` that don't pattern-match exhaustively may silently treat it as "loading" (App.tsx currently handles it as not-ready, which is correct).
- `DEV_PROJECT` in `project-store.ts` remains but is overwritten by `setProjectSilent` on hydration.
- OpenAPI contract: `GET /projects/{projectId}/versions/latest` + `LatestVersionResponse` schema added to `packages/api-contracts/src/openapi.ts`.
- Tests: `version.service.latest.test.ts` (unit), `versions-latest-endpoint.test.ts` (integration), `useProjectInit.test.ts` (rewrote FE unit, 6 new scenarios).

**Why:** TopBar previously had no return path; project-store was seeded from DEV_PROJECT on every mount regardless of saved versions.

**Subtask 3 — COMPLETE (2026-04-17)**
Manual save button + conflict-overwrite action in TopBar.
- `useAutosave` now returns `save()` and `resolveConflictByOverwrite()` alongside status fields.
- `performSave` gained optional `force = false` param — bypasses `hasPendingPatches` guard so overwrite can POST the current snapshot even after patch buffer was drained by the prior failed attempt.
- `resolveConflictByOverwrite` calls `fetchLatestVersion`, then `setCurrentVersionId(latest.versionId)`, then `performSave(true)`. Repeat 409 stays in `'conflict'` — no infinite retry.
- Save button in TopBar: `aria-label="Save project"`, disabled + style change when `saveStatus === 'saving'`.
- SaveStatusBadge: accepts `onOverwrite` prop; renders Overwrite button with `aria-label="Overwrite server version with local changes"` only when `saveStatus === 'conflict'` and handler is provided. Conflict label changed from "Conflict — reload to get latest" to just "Conflict" (the Overwrite button replaces the reload guidance).
- All 4 `useAutosave.*.test.ts` mocks updated to include `fetchLatestVersion`.
- New `SaveStatusBadge.test.tsx` (12 tests); extended `TopBar.test.tsx` (5 new Save button tests via vi.hoisted pattern); 1 manual-save test + 3 overwrite tests added to existing hook tests.

**Subtask 4 — COMPLETE (2026-04-17)**
"Back to Storyboard" button in generate wizard.
- `BackToStoryboardButton.tsx` — standalone component, absolutely positioned in header left, `aria-label="Back to Storyboard"`, keyboard-accessible (Enter/Space via `onKeyDown`), design-guide tokens only (12px/500 label, `TEXT_SECONDARY`→`TEXT_PRIMARY` hover).
- `GenerateWizardPage.tsx` — imports `useNavigate`, adds `handleBackToStoryboard` → `navigate('/?tab=storyboard')`, renders `BackToStoryboardButton` in header before `WizardStepper`. Header is `position: relative`; button is `position: absolute; left: 16px`. WizardStepper wrapped in `flex: 1` div to remain centered.
- `HomePage.tsx` — reads `?tab=storyboard` via `useSearchParams` on render to set initial tab state. Absent or unrecognised values keep Projects default.
- Tab-hint transport: query param (`?tab=storyboard`) — bookmarkable, no sessionStorage cleanup needed. Documented in code comment and dev log.
- Tests split per §9.7 (300-line cap): `BackToStoryboardButton.test.tsx` (8 unit tests), `GenerateWizardPage.navigate.test.tsx` (2 page-level integration tests). Extended `HomePage.test.tsx` (3 new tests).
- useNavigate mock pattern: `vi.hoisted` + `vi.mock('react-router-dom', async importOriginal => { ...actual, useNavigate: () => mockNavigate })` — same as WizardFooter.test.tsx.

**Subtask 5 — COMPLETE (2026-04-17)**
Fix chip deletion bug in PromptEditor after rapid insertion.
- Root cause confirmed: after `handleKeyDown` removes a chip, the two adjacent empty text-node pads (`{ type:'text', value:'' }` emitted by `insertMediaRefAtOffset`) remain as consecutive DOM siblings. On the next Backspace, `previousSibling` is the second empty text node (not the chip), so `isChipNode` returns false and the press no-ops.
- Fix: `handleKeyDown` Backspace path now walks backward past consecutive empty text nodes (`while prev.nodeType === TEXT_NODE && prev.textContent === ''`) before calling `isChipNode`. One-line while-loop addition; `beforeinput` char-limit path completely unchanged.
- DO NOT use `root.normalize()` after chip removal — it merges adjacent text nodes but can disturb caret positions in complex documents.
- New `PromptEditor.deletion.test.tsx` (3 cases). Case 2 was the initial failing repro; cases 1 and 3 validated boundary behavior.
- Full web-editor suite: 1951/1951 pass.

**Why:** `insertMediaRefAtOffset` always pads chips with empty text blocks for DOM navigability. These pads accumulate as orphaned siblings after deletion since `renderDocToDOM` only re-fires when the serialized doc changes, and `serializeDOMToDoc` merges them before serialization.

**Subtask 6 — COMPLETE (2026-04-17)**
Drag-and-drop assets into PromptEditor + X-icon on chips.
- `AssetThumbCard` + `AudioRowCard`: `draggable`, `onDragStart` sets `application/x-cliptale-asset` MIME with `{assetId, type, label}` JSON payload; off-screen chip clone mounted via `document.body.appendChild` for `setDragImage`, removed on `dragend`; hover `borderColor` changes to `CHIP_COLORS[asset.type]` as drag affordance.
- `PromptEditor`: `onDragOver` + `onDrop` added; drop resolves caret offset via `resolveCaretOffsetAtPoint` (caretPositionFromPoint/caretRangeFromPoint fallback), then inserts chip via `insertMediaRefAtOffset` — same path as `insertMediaRef` imperative handle.
- `createChipElement` now appends a `<button type="button" aria-label="Remove <label>" data-chip-remove="true">×</button>` inside each chip span. `userSelect: 'all'` preserved on the chip wrapper.
- `removeChipByElement(chipEl, onRemove)` helper added to `promptEditorDOM.ts`.
- `onClick` in PromptEditor walks up to `[data-chip-remove]` then to `[data-media-ref-id]` and calls `removeChipByElement`. `e.preventDefault()` + `e.stopPropagation()` prevents unwanted caret shifts.
- jsdom note: `caretPositionFromPoint` is unavailable in jsdom → fallback appends chip at end. Tests assert the fallback; pixel-accurate drop position requires browser manual verification.
- File-size compliance: `promptEditorDOM.ts` exceeded 300 lines after × button additions → `insertMediaRefAtOffset` + `countTextChars` extracted to `promptEditorInsert.ts` (re-exported from DOM file); all event handlers extracted to `usePromptEditorHandlers.ts`; drop-point logic to `promptEditorDrop.ts`.
- New MIME constant: `application/x-cliptale-asset` — defined locally in each file (matches existing `application/cliptale-asset` constant style in asset-manager feature).
- Tests: `AssetThumbCard.drag.test.tsx` (7), `PromptEditor.drag.test.tsx` (8), `PromptEditor.test.tsx` extended (+3). 149/149 generate-wizard tests pass.

**All 6 subtasks complete. EPIC done.**
