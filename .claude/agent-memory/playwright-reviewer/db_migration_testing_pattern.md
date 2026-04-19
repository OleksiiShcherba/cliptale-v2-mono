---
name: Database migration testing pattern
description: When to defer Playwright E2E tests to integration tests for DB-only changes
type: feedback
updated: 2026-04-17
---

## Pattern: Database Migrations Verified By Integration Tests, Not E2E

**Rule:** Database-only migrations (new columns, indexes, backfill scripts) with no UI/route/component changes do NOT require Playwright E2E tests. They are verified exclusively by integration tests hitting a live MySQL instance.

**Why:**
- Database schema changes have no user-facing browser component to render
- The browser cannot verify database constraints, column types, or index structures
- Integration tests (querying information_schema, running INSERT/SELECT/UPDATE cycles) are the only appropriate verification method
- E2E tests cannot add value to a migration — they test user workflows, not database schema

**How to apply:**
1. Verify the change is migration-only (new .sql file in `apps/api/src/db/migrations/`)
2. Verify no UI files changed (zero changes in `apps/web-editor/`)
3. Verify zero new routes or endpoints (migration adds columns, not APIs)
4. Verify integration tests exist and pass (`apps/api/src/__tests__/integration/*-schema.test.ts` or similar)
5. If all above are true → mark `checked by playwright-reviewer: APPROVED` with explanation referencing the integration test coverage

**Applies to:**

1. Migration 020 (2026-04-17)
   - Change: new columns `owner_user_id`, `title`; composite index `idx_projects_owner_updated` on projects table
   - Integration tests: `projects-schema.test.ts` (11 tests: column existence, type, nullability, defaults, index structure, backfill, idempotency, INSERT behavior)
   - Playwright E2E: Not applicable (no UI to test)
   - Result: APPROVED with integration test citation

2. Task: Backend Repository Migration (2026-04-19, Subtask 1)
   - Change: Rewrote `asset.repository.ts` SQL to target `files` + `project_files` (instead of dropped `project_assets_current`)
   - Integration tests: `asset-repository.integration.test.ts` (22 tests), `asset.repository.test.ts` (21 tests), `asset.repository.list.test.ts` (21 tests)
   - Playwright E2E: Not applicable (repository layer only; zero UI/route/component changes)
   - Result: APPROVED with integration test citation

3. Task: Backend Repository Migration (2026-04-19, Subtask 4 — Test file migration)
   - Change: Renamed integration test files to dot-infix convention, extracted helpers to `.fixtures.ts`, migrated test seeds from dropped `project_assets_current` to `files` + `project_files` pattern
   - Files changed: `apps/api/src/__tests__/integration/generation-drafts-cards.{endpoint,shape}.test.ts`, `generation-drafts-cards.fixtures.ts`
   - Integration tests: 12 tests pass (7 endpoint auth/isolation/precedence tests + 5 shape/cap/dangling-ref tests) — verified against live Docker Compose stack
   - Playwright E2E: Not applicable (test-only changes; database seed pattern migration; zero UI/route/component changes)
   - Result: APPROVED with integration test citation
