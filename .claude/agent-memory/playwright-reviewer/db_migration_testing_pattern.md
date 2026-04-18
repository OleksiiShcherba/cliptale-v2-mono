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

**Applies to:** Migration 020 (2026-04-17)
- Change: new columns `owner_user_id`, `title`; composite index `idx_projects_owner_updated` on projects table
- Integration tests: `projects-schema.test.ts` (11 tests: column existence, type, nullability, defaults, index structure, backfill, idempotency, INSERT behavior)
- Playwright E2E: Not applicable (no UI to test)
- Result: APPROVED with integration test citation
