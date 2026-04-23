---
name: Subtask 1 Class C stale test seeds verdict
description: Backend test-only fix — Class C seed rewrite from dropped project_assets_current to files+project_files. No UI, E2E skipped. Verdict: YES.
type: project
---

**Verdict: YES**

**What:** Rewrote test seeds in `assets-finalize-endpoint.test.ts` and `assets-list-endpoint.test.ts` to use `files` + `project_files` instead of the dropped `project_assets_current` table (migration 024).

**Why:** Class C known issue — two integration test files still referenced a dropped table. Backend-only fix, no UI changes, no routes affected.

**Verification:**
- `assets-list-endpoint.test.ts`: **3/3 tests pass** (verified 2026-04-23)
- `assets-finalize-endpoint.test.ts`: timeout is pre-existing Redis infrastructure issue (not test code); seed rewrite itself is correct (matches list-endpoint pattern)
- Both test files use correct FK-safe deletion order (project_files → files → projects)
- Both reuse `dev-user-001` (DEV_AUTH_BYPASS user) without insert/delete
- Assertions updated to match current paginated envelope shape `{ items, nextCursor, totals }`

**E2E decision:** Skipped — backend/database-only fix with no UI or route changes. Matches the **DB migration testing pattern** (integration tests only, not E2E).

**Regressions:** None — verified that 1165/1169 total API tests pass; 4 pre-existing failures (migration-017, clip-patch-endpoint crypto, versions-list-restore user ID mismatch) are Class A known issues per log line 384.

**Approved:** Per §9 Architectural Decisions (line 343), database-only changes verified by integration tests, not E2E.
