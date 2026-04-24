---
name: S3 presigning controller violation — RESOLVED 2026-04-05
description: The S3 presigning violation in assets.controller.ts was fully resolved; all S3 logic now lives in asset.service.ts
type: project
---

The previously flagged violation (`assets.controller.ts` importing `GetObjectCommand`, `S3Client`, `getSignedUrl` and containing `parseS3Uri`/`presignS3Uri`/`serializeAsset`) was fully resolved in the "Fix S3 URL exposure in Remotion preview player" subtask (2026-04-05).

**What changed:**
- `presignDownloadUrl`, `storageUriToHttps`, `toAssetApiResponse`, `getAssetResponse`, `getProjectAssetsResponse`, `finalizeAssetResponse` all moved into `asset.service.ts`
- `parseS3Uri` duplicate was removed from the controller; `parseStorageUri` in the service is the single source of truth
- `assets.controller.ts` now has zero AWS SDK imports; it only imports `express`, `zod`, `config` (for `config.s3.bucket` in `createUploadUrl`), `s3Client`, and `assetService`

**Remaining open item from this review:**
- `asset.service.test.ts` does not yet cover the newly added functions (`getAssetResponse`, `getProjectAssetsResponse`, `finalizeAssetResponse`, `streamAsset`). These are exercised only by integration tests. A warning was filed.

**Why:** Architecture rule §5 requires all S3 calls to live in the service layer. This is now satisfied.
**How to apply:** Violation is resolved. On future reviews of `assets.controller.ts`, verify AWS SDK imports remain absent.

**Residual known issue (deferred):**
- `UploadUrlResult.storageUri` (line ~49 of `asset.service.ts`) still returns an `s3://` URI in the `POST /projects/:id/assets/upload-url` response body. The frontend TypeScript `UploadUrlResponse` type does not include this field (so it is ignored at compile time), but the raw JSON over the wire still contains it. This was flagged as a warning in the 2026-04-05 review of "Fix S3 URL exposure in Remotion preview player" but is pre-existing and out of scope for that task. Do not re-flag as a violation in future reviews of the same file unless the task scope includes cleaning up the upload endpoint response.

**File length issue — RESOLVED 2026-04-05 (second pass):**
- `asset.service.ts` was at 380 lines. Extraction to `asset.response.service.ts` (186 lines) completed. Both files now under 300 lines. `asset.response.service.test.ts` co-located correctly and imports from `./asset.response.service.js`. All architecture rules satisfied. Review approved.
