---
id: T4
title: "Mount the status menu on the completed state of both status blocks"
layer: "ui"
deps: ["T1", "T3"]
acs: ["AC-06", "AC-09"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.styles.ts"
owner: "Frontend Eng"
estimate: "S"
status: "todo"
---

# T4 — Mount the status menu on the completed state of both blocks

## Why

The menu must appear only on the completed state of each block, and only for the owner. Derives from [spec §AC-06 (state gate), §AC-09 (owner gate)](../spec.md), [sad §5](../sad.md) (`StoryboardPlanControls` modified), [ADR-0002](../adr/0002-owner-gate-status-menu-by-not-rendering.md).

## What

In `StoryboardPlanControls.tsx`, render `StoryboardStatusMenu` (T1) inside the completed branch of **both** `StoryboardPlanControls` (scene block) and `StoryboardIllustrationControls` (illustration block). Add the props needed to pass through: `isOwner`, `onRegenerate`, `onHide` (the handlers themselves are supplied by the workspace — T6). Adjust styles in `StoryboardPlanControls.styles.ts` for menu placement next to / replacing the "Done" badge.

- Render the menu **only** when `status === 'completed'` — never for `queued`/`running`/`applying`/`failed` (AC-06). The existing in-progress/failed copy and Retry control are untouched (spec §3 non-goal).
- Pass `isOwner` straight to the menu; the menu itself returns null for non-owners (T1) so this is the wire-through point for AC-09.

## Definition of Done

- [ ] Both blocks render the menu only in the completed state and only when `isOwner` is true — component test across all statuses (AC-06, AC-09).
- [ ] In-progress and failed states render unchanged (existing Retry/copy preserved).
- [ ] `onRegenerate` / `onHide` / `isOwner` props are threaded to the menu.
- [ ] lint + typecheck clean.

## Notes

- **Depends on T3** (same files — `StoryboardPlanControls.tsx` + `.styles.ts`); land T3's Ref/visual cleanup first, then add the menu here.
- Depends on T1 for the `StoryboardStatusMenu` component.
- New props on these components are consumed by the workspace in T6 — keep them required and typed.
