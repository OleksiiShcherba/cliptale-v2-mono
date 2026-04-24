---
name: epic9-ticket6-asset-resolver
description: EPIC 9 Ticket 6 — Asset URL resolver for fal.ai image inputs — test coverage, fixtures, and acceptance criteria
type: project
---

## Feature Summary
Asset URL resolver (`resolveAssetImageUrls`) for fal.ai generation submissions. Walks a model's declared `inputSchema.fields` and rewrites `image_url` / `image_url_list` field values:
- https URLs → passthrough unchanged (case-insensitive)
- asset IDs → fetched via repo, ownership enforced, presigned URL issued (1-hour TTL)

**Key contract:** The resolver mutates nothing; returns a shallow clone of options with all image fields rewritten to https URLs or undefined.

## Test Coverage (48 tests across 5 files)

### 1. `aiGeneration.assetResolver.test.ts` (10 unit tests)
Tests the resolver function in isolation against the real `FAL_MODELS` catalog:

**Happy path (4 tests):**
- Https URLs pass through unchanged — no repo or presigner calls
- Asset ID → presigned URL (with Bucket/Key and expiresIn: 3600 assertions on the mock)
- Case-insensitive HTTPS scheme (uppercase)
- Undefined fields skipped (optional field behavior)

**image_url_list field (3 tests):**
- Mixed array (asset ID + https URL) — preserves order, replaces asset with presigned
- All-asset-ID array — resolves all three in order with sequential presigner calls
- Non-array value → ValidationError with field name in message

**Error states (2 tests):**
- Missing asset → NotFoundError with asset ID in message
- Cross-user asset → ForbiddenError with asset ID in message

**No-op model (1 test):**
- Text-to-image model (nano-banana-2) has no image fields — pure no-op, no repo/presigner calls

**Fixtures used:**
- `makeAssetRow(overrides)` factory for building test asset rows
- `getAssetByIdMock`, `getSignedUrlMock` for isolation
- `TEST_ASSET_ID`, `TEST_USER`, `FIXED_PRESIGNED_URL` constants

### 2. `aiGeneration.service.test.ts` (17 tests, +1 new case)
Tests the resolver **wiring** into the service submission flow:

**New case:** `fal-ai/ltx-2-19b/image-to-video` with `options.image_url: TEST_ASSET_ID`
- Asserts `getAssetByIdMock` was called with the asset ID
- Asserts both `enqueueAiGenerateJob` and `createJob` received the resolved presigned URL in their payloads

This confirms the resolver is invoked and its output is threaded to both queue and DB layers.

### 3. `falOptions.validator.test.ts` (12 tests, unmodified)
Shape validation for `image_url` and `image_url_list` fields:
- Rejects non-string `image_url`
- Rejects empty `image_url_list`
- Accepts valid `image_url_list` (non-empty array of strings)

These tests run **before** the resolver in the service layer (validation first, then resolution), so they protect against type errors the resolver assumes have already been checked.

### 4. `aiGeneration.service.status.test.ts` (4 tests, unmodified)
Tests the status query logic; unrelated to resolver, all passing.

### 5. `ai-generation-endpoints.test.ts` (5 integration tests, +1 new case)
Tests the full HTTP → resolver → DB flow:

**New case:** POST `/projects/:id/ai/generate` with `fal-ai/nano-banana-2/edit` and `options.image_urls: [testAssetId]`
- Returns 202
- Queries the `ai_generation_jobs` table and verifies the `options` JSON column contains `https://…` URL (not the original asset ID)
- Confirms presigner mock is wired into the endpoint context
- Includes `afterAll` cleanup to remove seeded test asset

This is a **smoke test** confirming the full integration; it doesn't re-test resolver logic (that's unit-tested) but validates the contract between service and DB.

## Architecture Compliance

✅ **Field-type keying:** The resolver walks `field.type` (never field name), so future catalog entries with names like `reference_images`, `mask_image_url`, etc. are picked up automatically.

✅ **Presigned TTL:** Local constant `PRESIGN_EXPIRY_SECONDS = 60 * 60` (1 hour per §11 security rule).

✅ **Ownership enforcement:** `asset.userId !== userId` guard prevents cross-tenant access.

✅ **Shallow clone:** The resolver returns a shallow clone of options; arrays are deep-cloned in place via `.map()`, so the caller's input is never mutated.

✅ **Defensive validation:** The resolver has one non-delegated guard (`Array.isArray(value)` check on `image_url_list`) to protect against future validator regressions.

## Known Pre-Existing Test Failures

The full suite runs 471 tests: 436 pass, 35 fail. All 35 failures are in **unrelated integration files** (`versions-*`, `assets-*`, `captions-*`, `clip-patch`, `renders-endpoint`) and are caused by `APP_DEV_AUTH_BYPASS=true` attaching `dev-user-001` regardless of the Authorization header. These failures pre-date the resolver work and are not regressions.

**Zero new regressions** in aiGeneration, the resolver, or any file modified by this ticket.

## TypeScript & Linting

✅ `npx tsc --noEmit` — clean (no type errors).
✅ No linting warnings in test or resolver files.

## Why This Coverage Is Sufficient

1. **Unit tests cover all acceptance criteria** (10 cases in the resolver test) — happy path, edge cases (undefined, case-insensitive, mixed arrays), error states (NotFound, Forbidden, ValidationError), and the no-op model.
2. **Service test proves wiring** — the resolver is invoked and its output reaches the queue and DB layers.
3. **Integration smoke test confirms full contract** — HTTP → resolver → JSON serialization to the database works end-to-end.
4. **No behavioral regressions** — full suite regression gate is clear for aiGeneration work.
5. **Mocks are isolated and inspectable** — tests verify not just the output but the internal contract (Bucket, Key, expiresIn assertions; ordered mock calls for arrays).
