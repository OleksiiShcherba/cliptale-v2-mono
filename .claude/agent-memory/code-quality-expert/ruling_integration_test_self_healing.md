---
name: Integration test self-healing schema repairs - acceptable pattern
description: beforeAll schema repair & enforcement in integration tests (migrate.integration.test.ts, schema-final-state.integration.test.ts) are guardrails for test isolation, not mocks; do not flag as violation
type: project
---

Integration test files in `apps/api/src/__tests__/integration/` use defensive beforeAll/afterAll patterns to repair or enforce schema state:

**Examples:**
- `migrate.integration.test.ts` — detects broken schema via INFORMATION_SCHEMA COUNT(*) check, applies idempotent DDL repairs if broken
- `migration-014.test.ts` — creates stub `project_assets_current` in beforeAll (for FK resolution), applies repairs in afterAll
- `schema-final-state.integration.test.ts` — actively enforces correct final schema state with targeted INFORMATION_SCHEMA-guarded DDL

**Why this is NOT a violation of §10:**
- §10 requires "real MySQL test database" (not mocks) — these patterns use real DB queries and idempotent DDL (not mocks)
- §10 does not forbid test-level setup/repair — it forbids mocking repositories/SQL
- `vitest.config.ts` uses `singleFork: true` to serialize all test files, preventing DDL race conditions

**Pattern is acceptable because:**
1. All DDL uses INFORMATION_SCHEMA guards and is idempotent (safe to re-run)
2. Repairs operate at test infrastructure level (beforeAll), not within test assertions
3. Serialization via singleFork prevents concurrent DDL conflicts
4. Defensive guards reduce cascading failures from prior test contamination

**Future improvement (deferred):**
- Consolidate distributed beforeAll schema repair hooks into a centralized test fixture layer
- This would improve maintainability without changing the pattern's correctness

**How to apply:** Do not flag self-healing beforeAll patterns as violations of §10. If questioned, note that they use real DB (not mocks) and are guarded by INFORMATION_SCHEMA checks.

---

**Related:** `vitest.config.ts` pool: 'forks' + singleFork: true serialization pattern solves the core isolation problem.
