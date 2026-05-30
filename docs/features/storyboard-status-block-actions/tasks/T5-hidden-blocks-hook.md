---
id: T5
title: "useStoryboardHiddenBlocks — session-only hide state with re-show on new cycle"
layer: "ui"
deps: []
acs: ["AC-02"]
files_hint:
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardHiddenBlocks.ts"
owner: "Frontend Eng"
estimate: "M"
status: "todo"
---

# T5 — useStoryboardHiddenBlocks (session-only hide state)

## Why

Hide removes a completed block for the current session only; the block returns on reload or when it re-enters a new generation cycle. Derives from [spec §AC-02 / US-04 / §3 non-goal](../spec.md), [sad §4 choice 3, §8 State management](../sad.md) (session-only, not persisted, not in the global `ephemeral-store`).

## What

A new hook `useStoryboardHiddenBlocks.ts` holding in-memory (component-lifetime) hidden flags for the two named blocks (`'plan'`, `'illustration'`). It exposes per-block `isHidden`, a `hide(block)` action, and auto-clears a block's hidden flag when that block re-enters a generation cycle — i.e. when its status transitions away from `completed` back into a running/queued phase (so completion of the new cycle re-shows it, including the indirect case where a scene Regenerate restarts illustrations).

- State is **in-memory only** — no localStorage, no server, no global store write (spec §3, data-model.md: no persistence).
- Hiding one block must not affect the sibling.
- Re-show is driven by the generation status the hook observes (passed in from the generation hooks), not by a manual un-hide affordance (there is none — AC-02).

## Definition of Done

- [ ] `hide('plan')` hides only the plan block; the illustration block stays visible — hook test (AC-02).
- [ ] A hidden block's flag clears when its status leaves `completed` (new cycle), so it re-shows on the next completion — hook test (AC-02 indirect re-show).
- [ ] State resets on remount (no persistence) — hook test.
- [ ] lint + typecheck clean.

## Notes

- Keep this hook free of generation-start logic — it only tracks visibility. Dispatch lives in T6.
- The workspace (T6) consumes this hook and feeds block visibility into `StoryboardPlanControls`.
