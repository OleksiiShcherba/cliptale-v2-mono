---
name: pre-existing-test-failures
description: Integration tests that were already failing before any recent feature work — do not count as regressions when running full API suite
type: project
---

Two integration tests in `apps/api/src/__tests__/integration/` are pre-existing failures unrelated to any feature under review:

1. `assets-endpoints.test.ts` line 207 — asserts `assetId: seededAssetId` in `GET /assets/:id` response body, but `serializeAsset` has always returned `id` (not `assetId`). Test bug: wrong key name.
2. `assets-finalize-endpoint.test.ts` line 144 — same issue: asserts `assetId` in `POST /assets/:id/finalize` response, but response shape uses `id`.

**Why:** Confirmed on 2026-04-05 by reverting the stream endpoint changes (git stash) and re-running — both tests failed identically before the stream feature was introduced. The `serializeAsset` function maps `asset.assetId → id` since the first commit.

**Impact:** When running `APP_DB_PASSWORD=cliptale vitest run` on the full API suite, expect `2 failed | 250 passed` (as of 2026-04-05). These 2 failures are NOT regressions from new features. Do not mark features as `COMMENTED` due to these failures — they pre-date all reviewed epics.
