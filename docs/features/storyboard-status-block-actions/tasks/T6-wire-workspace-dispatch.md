---
id: T6
title: "Wire menu, modal, hidden state, owner gate and Regenerate dispatch into the workspace"
layer: "wiring"
deps: ["T2", "T4", "T5"]
acs: ["AC-01", "AC-02", "AC-03", "AC-05", "AC-07", "AC-08", "AC-09"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardPageWorkspace.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx"
owner: "Frontend Eng"
estimate: "M"
status: "todo"
---

# T6 — Wire the feature into the workspace + Regenerate dispatch

## Why

This is the integration point that turns the presentational pieces into working behaviour. Derives from [spec §AC-01, §AC-02, §AC-03, §AC-05, §AC-07, §AC-08, §AC-09](../spec.md), [sad §5 `StoryboardPageWorkspace` modified, §6 runtime flows](../sad.md), [ADR-0001](../adr/0001-reuse-generation-start-path-gated-by-action-type.md) (dispatch by action type), [ADR-0002](../adr/0002-owner-gate-status-menu-by-not-rendering.md) (owner gate).

## What

In `StoryboardPageWorkspace.tsx` (threading the draft owner id from `StoryboardPage.tsx` if not already available):

- **Owner gate (AC-09):** compute `isOwner = useAuth().user?.id === draftOwnerId` and pass to both `StoryboardPlanControls` / `StoryboardIllustrationControls` (per ADR-0002, the gate is render-only — no server boundary added).
- **Hidden state (AC-02):** consume `useStoryboardHiddenBlocks` (T5), feed each block's visibility into the controls, and provide the `onHide` handlers; the sibling reflows up because the hidden block simply isn't rendered.
- **Regenerate dispatch (ADR-0001):**
  - Scene block `onRegenerate` → open `StoryboardRegenerateConfirmModal` (T2) with the present-loss list computed from current draft state (whichever of scenes / illustrations / music exist — AC-08); on confirm, call the existing destructive path `planGeneration.retry()` (AC-01, AC-08); on cancel, do nothing (AC-05).
  - Illustration block `onRegenerate` → call the existing additive path `illustrationGeneration.start()` directly, **no modal** (AC-03).
- **Single-generation invariant (AC-07):** structural — choosing Regenerate moves the block out of completed (the menu disappears via T4's state gate), so a rapid duplicate has no menu to act on; rely on the existing start-guard in the plan hook, add no new lock.
- Render the confirm modal at the workspace level.

## Definition of Done

- [ ] `isOwner` computed from `useAuth` vs draft owner id and passed to both blocks; non-owner sees no kebab — integration test (AC-09).
- [ ] Scene Regenerate opens the modal with the correct present-loss list and only calls `planGeneration.retry()` on confirm; cancel starts nothing (AC-01, AC-05, AC-08).
- [ ] Illustration Regenerate calls `illustrationGeneration.start()` with no modal (AC-03).
- [ ] Hide removes only the targeted block; sibling reflows; re-shows on a new cycle (AC-02).
- [ ] Rapid double Regenerate starts exactly one generation (AC-07).
- [ ] lint + typecheck clean.

## Notes

- **Hard rule (spec §6 / ADR-0001):** Regenerate must reuse the existing start paths — do not introduce a new generation call or timing budget.
- If the draft owner id is not yet available in the storyboard page state, thread it from the loaded draft metadata (ADR-0002 notes it is "already loaded with the draft").
- Open question (spec §8, resolved-by-default): illustration Regenerate re-runs all scenes and surfaces re-approval as it works today — do not add new style-drift handling here.
