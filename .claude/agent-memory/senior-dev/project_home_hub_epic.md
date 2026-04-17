---
name: Project: Home Hub EPIC progress
description: EPIC — Home: Projects & Storyboard Hub; 7 subtasks; subtask 1 complete as of 2026-04-17
type: project
---

EPIC: Home — Projects & Storyboard Hub (replaces /editor as post-login landing).

Build order: 1 → 2 (must land together re createProject sig). 3 is independent. 4 independent. 5 requires 2+4. 6 requires 3+4. 7 independent, ships last.

**Subtask 1** — COMPLETE (2026-04-17)
- Migration: `apps/api/src/db/migrations/020_projects_owner_title.sql`
- Integration test: `apps/api/src/__tests__/integration/projects-schema.test.ts`
- Key decision: `ADD COLUMN IF NOT EXISTS` with `DEFAULT 'dev-user-001'` handles backfill automatically; the UPDATE in the migration is a deliberate no-op for documentation clarity.

**Subtasks 2–7** — pending.

**Why:** MySQL 8.0.29+ required for `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — both used for idempotency in migration 020.

**How to apply:** When continuing this epic, subtask 2 needs migration 020 already applied (depends on subtask 1). Check integration tests run against the Docker Compose MySQL instance.
