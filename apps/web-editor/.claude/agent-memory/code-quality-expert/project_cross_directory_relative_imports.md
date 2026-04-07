---
name: Cross-directory relative imports in timeline feature
description: ../hooks/ pattern is pervasive across timeline feature components but is a §9 violation — flag on new files, acknowledge as pre-existing on old files
type: project
---

The entire `features/timeline/` subtree uses cross-directory relative imports: `../hooks/` from components, and `../components/` from hooks. Confirmed violations in `ClipLane.tsx`, `ClipLane.test.tsx`, `TimelinePanel.tsx`, `TrackList.tsx`, `TrackList.test.tsx`, `ScrollbarStrip.tsx`, `useTimelineResize.ts`, `useTimelineResize.test.ts`. All violate §9 which forbids cross-directory relative imports and requires `@/` aliases. Also see: `App.tsx` split group-4 imports (a blank line separating two batches of `@/` imports) was flagged in the 2026-04-07 "Resizable video preview block" review.

**Why:** The pattern was present before code-reviewer started reviewing this codebase and was never previously flagged. It is not an approved deviation — it is an uncaught recurring violation.

**How to apply:** Flag this violation on any new file added to the timeline feature that follows this pattern. For pre-existing files (`ClipLane.tsx`, `TimelinePanel.tsx`, etc.) that were already reviewed without this flag being raised, note as pre-existing but do not block review of the current change on their account. New files (like `ScrollbarStrip.tsx`) must be flagged directly.
