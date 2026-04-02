---
name: Ruling — split test files and fixture extraction convention
description: How to handle multi-part test file names (.seek.test.ts) and shared fixtures across split test files
type: project
---

When a test file would exceed 300 lines (§9), the dev splits it into a sibling file with a descriptive infix (e.g. `usePlaybackControls.seek.test.ts`, `usePlaybackControls.raf.test.ts`). This pattern is now formally documented in `architecture-rules.md` §9 "Split test file naming convention" (added during epic 2 review cycle).

**Ruling:** Multi-part test file suffixes (`.seek.test.ts`, `.raf.test.ts`, etc.) are fully valid — any violation of this convention is a hard violation, not a warning, because §9 now explicitly mandates it.

**Fixture extraction:** Shared fixture helpers (e.g. `makePlayerRef`, `makeProjectDoc`) MUST be extracted to a co-located `.fixtures.ts` file. Verbatim duplication across split test files is a hard violation per §9. The canonical pattern is `usePlaybackControls.fixtures.ts` imported in all split sibling files.

**How to apply:** When reviewing split test files for the same module, verify (1) the naming suffix matches the documented convention, (2) a `.fixtures.ts` file exists and is imported by all split files, and (3) no fixture helpers are duplicated inline.
