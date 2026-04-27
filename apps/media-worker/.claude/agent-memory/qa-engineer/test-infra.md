---
name: media-worker test infrastructure
description: Vitest setup, mock boundaries, and test conventions for the media-worker app
type: project
---

Unit test framework is **Vitest** (`npx vitest run`). No E2E framework detected for media-worker — Playwright is listed in architecture-rules.md for the web-editor only. E2E coverage for worker jobs is deferred.

**Mock boundaries:** All external I/O is mocked at the module level using `vi.mock()`:
- `node:fs/promises` — `mkdtemp`, `rm`
- `node:fs` — `createWriteStream`, `createReadStream`
- `node:stream/promises` — `pipeline`
- `node:crypto` — `randomUUID`
- S3Client, mysql2 Pool, and OpenAI client are passed as injectable deps (`TranscribeJobDeps`) and mocked as plain objects — no module-level mock needed for them.

**Why:** The job handler uses dependency injection for S3/DB/OpenAI, enabling unit tests without real infrastructure. Node built-ins (fs, stream, crypto) are mocked at the module level because they are called internally by helper functions that are not injectable.

**Impact:** When writing future job handler tests in media-worker, always use `vi.mock()` for Node built-ins used inside private helpers, and pass fake objects for injected service clients. Never import and test the private helpers directly.

**Test file location:** `src/jobs/*.test.ts` — co-located with the source file, not in a separate `__tests__` folder.

**Run command for targeted tests:** `npx vitest run src/jobs/<filename>.test.ts`
**Run command for full suite:** `npx vitest run`

**Known stderr noise:** Error path tests emit `[transcribe-job] Failed for asset ...` console.error lines. These are expected and do not indicate test failures.
