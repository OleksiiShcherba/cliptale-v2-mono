---
name: Split test files must share fixtures via .fixtures.ts — not duplicate them
description: When render.job.test.ts was split, fixtures were duplicated verbatim instead of extracted to render.job.fixtures.ts
type: project
---

When `render.job.test.ts` was originally split, the developer duplicated the entire mock setup block and fixture helpers verbatim in both files instead of extracting them to `render.job.fixtures.ts`. This was flagged and fixed in the re-review (2026-04-07).

**Resolved state (as of 2026-04-07):** `render.job.fixtures.ts` exists (87 lines) and exports `docJson`, `makeJob`, `makeDeps`, `setupSuccessMocks`, `setupVersionNotFoundMocks`, `setupRenderFailureMocks`. Both `render.job.test.ts` (182 lines) and `render.job.assets.test.ts` (119 lines) import shared helpers from the fixtures file. `vi.hoisted`/`vi.mock` calls remain in each test file as required by Vitest hoisting semantics.

§9 of architecture-rules.md is explicit: shared fixture helpers MUST be extracted to a co-located `foo.fixtures.ts` file and imported in every split test file. Duplication is forbidden.

**Why:** The rule exists to prevent fixture drift — when the same mock evolves in one file but not the other, tests silently diverge.

**How to apply:** Any time a test file for `render.job.ts` is reviewed, check that `render.job.fixtures.ts` exists and both test files import from it rather than defining their own copies of `makeJob`, `makeDeps`, and shared mock setup.
