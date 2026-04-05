---
name: Cross-directory relative imports in timeline feature
description: ../hooks/ pattern is pervasive across timeline feature components but is a §9 violation — flag on new files, acknowledge as pre-existing on old files
type: project
---

The entire `features/timeline/components/` directory uses `../hooks/` relative imports to reach sibling hooks (e.g. `from '../hooks/useClipDrag'`). This appears in `ClipLane.tsx`, `ClipLane.test.tsx`, `TimelinePanel.tsx`, `TrackList.tsx`, `TrackList.test.tsx`, and the newly introduced `ScrollbarStrip.tsx`. All of these violate §9 which forbids cross-directory relative imports and requires `@/` aliases.

**Why:** The pattern was present before code-reviewer started reviewing this codebase and was never previously flagged. It is not an approved deviation — it is an uncaught recurring violation.

**How to apply:** Flag this violation on any new file added to the timeline feature that follows this pattern. For pre-existing files (`ClipLane.tsx`, `TimelinePanel.tsx`, etc.) that were already reviewed without this flag being raised, note as pre-existing but do not block review of the current change on their account. New files (like `ScrollbarStrip.tsx`) must be flagged directly.
