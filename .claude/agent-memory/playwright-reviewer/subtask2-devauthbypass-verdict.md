---
name: Subtask 2 DEV_AUTH_BYPASS user assertion (2026-04-23)
description: Test-only assertion fix in versions-list-restore integration test; app assertion matches DEV_AUTH_BYPASS behavior
type: feedback
---

**Test-only fix to DEV_AUTH_BYPASS user assertion** (2026-04-23) — VERDICT: **YES**

**Why:** No UI or production code changes. When `APP_DEV_AUTH_BYPASS=true` is set in a test, the auth middleware injects `dev-user-001` as the authenticated user regardless of JWT payload. The assertion was simply updated to match what the middleware actually provides.

**Verification:**
- Integration test file: `versions-list-restore-endpoint.test.ts`
- Change: Line 151 assertion `'user-test-001'` → `'dev-user-001'`
- Test result: 10/10 tests PASS (includes the fixed assertion)
- Verified pattern: Integration test only (no E2E needed per test-only + DB fixture pattern)

**Impact:** This is a test fixture setup correction, not a regression. All 10 tests now pass.
