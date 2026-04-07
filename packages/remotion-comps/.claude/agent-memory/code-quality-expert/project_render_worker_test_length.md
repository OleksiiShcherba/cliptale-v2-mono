---
name: render-worker test file length pattern
description: render-worker test files repeatedly exceed the 300-line hard limit when new test groups are added to existing files
type: project
---

`apps/render-worker/src/jobs/render.job.test.ts` reached 330 lines after the "Fix render black screen" subtask added 3 new test cases for presigned URL generation, deduplication, and empty-clips. This is a recurring violation pattern — when new feature tests are added to render.job.test.ts, always check if the file crosses 300 lines and split if so.

**Why:** Architecture §9 hard limit is 300 lines per file. The split convention for test files is `foo.test.ts` (core paths) + `foo.<group>.test.ts` (new group) with shared fixtures in `foo.fixtures.ts`.

**How to apply:** Whenever reviewing a subtask that touches `render.job.test.ts` or `remotion-renderer.test.ts`, run `wc -l` on the file immediately and flag any count over 300 as a violation before reading the content.
