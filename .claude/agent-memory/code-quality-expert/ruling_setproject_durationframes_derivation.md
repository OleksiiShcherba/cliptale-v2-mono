---
name: setProject derives durationFrames — existing tests may break
description: setProject() now auto-derives durationFrames via computeProjectDuration; any test asserting getSnapshot() deep-equals the passed doc must account for this override
type: project
---

As of EPIC 7 subtask 2 (2026-04-04), `setProject()` in `project-store.ts` overwrites `durationFrames` with the result of `computeProjectDuration(doc.clips, doc.fps)`. The default minimum is `fps * 5`.

Any test that:
1. passes a doc with `clips: []` and `durationFrames` != `fps * 5` (e.g. `durationFrames: 300` with `fps: 30` gives 150, not 300), AND
2. then asserts `getSnapshot()` deep-equals the original doc

…will fail silently because the snapshot's `durationFrames` is derived, not the caller's value.

**Why:** The change was not accompanied by updates to `project-store.test.ts` line 54–58 which makes this exact assertion.

**How to apply:** Whenever reviewing tests for `setProject`, verify that any `toEqual(doc)` assertion either uses a doc whose `durationFrames` matches the derivation result, or asserts individual fields instead of full deep equality.
