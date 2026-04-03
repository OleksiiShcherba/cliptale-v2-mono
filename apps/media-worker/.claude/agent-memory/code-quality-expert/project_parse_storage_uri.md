---
name: parseStorageUri extraction — resolved
description: parseStorageUri extracted to lib/storage-uri.ts; job files import from lib and re-export for test compat — approved pattern
type: project
---

`parseStorageUri` was previously duplicated in both job files. It was extracted to `apps/media-worker/src/lib/storage-uri.ts` (single definition).

Both `ingest.job.ts` and `transcribe.job.ts` now import from `@/lib/storage-uri.js` and re-export the function for backwards compatibility with tests that imported it from the job module.

**Why:** Re-exporting a lib helper through a job file is unusual but not prohibited. The user confirmed this is acceptable for test backwards compatibility. Architecture rules §3 are satisfied — the canonical definition is in `lib/`.

**How to apply:** This pattern is approved. Do not flag re-exports of lib helpers from job files as a layering violation when the purpose is test backwards compatibility.
