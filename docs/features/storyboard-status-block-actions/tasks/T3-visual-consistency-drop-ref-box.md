---
id: T3
title: "Make the two completed blocks visually consistent and drop the Ref box"
layer: "ui"
deps: []
acs: ["AC-04"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.styles.ts"
owner: "Frontend Eng"
estimate: "S"
status: "todo"
---

# T3 — Visual consistency + drop the "Ref" box on the completed illustration block

## Why

The completed "Illustrations ready" block currently shows a stray "Ref" thumbnail that looks inconsistent with its sibling. Derives from [spec §AC-04 / US-05](../spec.md), [sad §4 choice 2](../sad.md) (Ref-removal is independent of ownership — applies to every viewer).

## What

In `StoryboardPlanControls.tsx`, stop rendering `StoryboardReferencePreview` (the "Ref" box) when the illustration block is in its **completed** state, and align the completed illustration block's layout/styles with the completed scene block so the two read identically. Adjust `StoryboardPlanControls.styles.ts` as needed.

- Removal applies to **every** viewer regardless of ownership (AC-04) — it is not gated by `isOwner`.
- Do **not** change the in-progress/reference/failed rendering of the preview (spec §3 non-goal) — the Ref/spinner preview still appears during those states.

## Definition of Done

- [ ] On the completed illustration block, `storyboard-reference-preview` is not rendered, for any viewer — component test on the completed state (AC-04).
- [ ] The completed illustration block matches the completed scene block's visual style.
- [ ] In-progress and failed states still render the existing reference preview (no regression).
- [ ] lint + typecheck clean.

## Notes

- **Shares a lane with T4** (both edit `StoryboardPlanControls.tsx` + `.styles.ts`); T4 depends on this task so they serialize cleanly — do the styling/Ref cleanup here first.
- Keep the existing `getStoryboardIllustrationCopy` / state logic intact; only the completed-state render changes.
