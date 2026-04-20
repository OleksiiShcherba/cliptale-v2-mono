---
name: C2 Thumbnail After Ingest QA Review
description: QA verification of media-worker thumbnail generation + DB write feature; unit tests for ingest job and file repository
type: project
---

**Subtask C2 — Media-worker writes files.thumbnail_uri after ingest**

**QA Date:** 2026-04-20

## Coverage Verdict: ✅ YES

### Test Files Created
1. **`apps/media-worker/src/jobs/ingest.job.thumbnail.test.ts`** (270 lines, 9 tests)
   - `extractThumbnail()` resolve/reject/seekInput behavior
   - Video thumbnail DB write with correct URI + fileId
   - S3 PutObject key + ContentType validation
   - Skip for audio content type
   - Skip for audio-only video container (no videoStream)
   - Short-clip seekSec = Math.min(1, durationSec/2)
   - Error propagation marks file as error

2. **`apps/api/src/repositories/file.repository.thumbnail.test.ts`** (119 lines, 5 tests)
   - `thumbnailUri` field mapping (string/null/absent pre-migration)
   - `setThumbnailUri()` SQL shape and parameter order
   - Null acceptance for clearing field

### Source Implementation Verified
- `extractThumbnail(inputPath, outputPath, atSeconds)` exported and testable
- `uploadThumbnail()` writes PutObjectCommand with correct Bucket/Key/ContentType
- `setThumbnailUri()` issues UPDATE with uri, fileId params (order correct)
- `IngestJobDeps` type includes `bucket: string`
- `processIngestJob()` calls all three helpers in correct sequence
- Thumbnail only generated for `contentType.startsWith('video/')` AND videoStream exists
- Seek offset = Math.min(1, durationSec / 2) for short clips
- Error handler marks file as error before re-throw
- `file.repository.ts` exports `setThumbnailUri(fileId, uri | null)`
- `FileRow` type includes `thumbnailUri: string | null`
- `file.repository.list.ts` mirrors DbRow with thumbnail_uri field

### Test Fixture Updates
- `ingest.job.test.ts` `IngestJobDeps` default now includes `bucket: 'test-bucket'`
- Default `contentType` changed to `'image/png'` to prevent thumbnail generation in unrelated tests
- Zero-duration test fixture explicitly uses `image/png`

### Mock Boundaries
- **S3:** Mocked at test level with `vi.fn().mockResolvedValue()`
- **DB:** Mocked via `vi.mock('@/db/connection.js')` to intercept Pool
- **FFmpeg:** Mocked with full builder chain (seekInput/outputOptions/output/on/run)
- No filesystem access outside mocked `node:fs` and `node:fs/promises`

### Regression Analysis
- Existing `ingest.job.test.ts` tests use image/png fixture → no thumbnail side effects
- `file.repository.softdelete.test.ts` unchanged → no regression
- Isolated test files with mocked dependencies → no cross-test contamination
- FFmpeg mock properly chains and fires callbacks → no hanging promises

### Migration Verification
- Migration `030_files_thumbnail_uri.sql` exists
- Migration test `migration-030.test.ts` validates column schema

## Why YES

All acceptance criteria from the dev log are fully covered by unit tests:
- Happy path: thumbnail extracted, uploaded, URI written to DB ✓
- Audio skipped (no thumbnail frame) ✓
- DB failure propagates (re-throw after error write) ✓
- S3 failure propagates (re-throw after error write) ✓
- Pre-existing files unaffected (column is nullable, defaults to NULL) ✓

Test structure follows project conventions:
- Vitest per-package, not root-level
- Pure helpers (extractThumbnail) exported for unit testing
- DB + external service mocking (S3, Pool) at module level
- No E2E tests needed (backend-only feature per playwright-reviewer)

No issues found in implementation or test code.

---

**Reference:** Subtask C2 development_logs.md entry at line 624–662.
