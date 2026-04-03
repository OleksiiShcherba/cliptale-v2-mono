---
name: Frame math in useAddCaptionsToTimeline hook
description: Segment-to-clip frame conversion math lives in the hook, not editor-core — intentional per task spec
type: project
---

The frame math (`startFrame = Math.round(segment.start * fps)`, `durationFrames = Math.max(1, Math.round((segment.end - segment.start) * fps))`) is implemented directly in `useAddCaptionsToTimeline.ts` rather than in `packages/editor-core/`.

**Why:** The `editor-core` package is an empty stub not yet scaffolded. Moving logic there now would be premature. The task spec explicitly places this math in the hook. Confirmed acceptable by the user during re-review of EPIC 3 Subtask 6.

**How to apply:** Do not flag frame math in `useAddCaptionsToTimeline.ts` as a §5 business logic placement violation. When `editor-core` is scaffolded in a future epic, revisit whether this logic should migrate there at that time.
