---
name: Stale test-debt hotspots after Files-as-Root rename
description: Integration test files still seeding legacy project_assets_current schema as of 2026-04-19; blocks whole describe() via beforeAll
type: project
---

The Batch-2 cleanup (2026-04-19) Subtask 3 patched three stale `asset_id`/`project_assets_current` test files but missed at least two others that still block at `beforeAll` after the table was legitimately dropped by migration 027:

- `apps/api/src/__tests__/integration/assets-patch-endpoint.test.ts` — beforeAll INSERTs into `project_assets_current`; 9 tests blocked.
- `apps/api/src/__tests__/integration/generation-drafts-cards-endpoint.test.ts` — beforeAll INSERTs into `project_assets_current`; both blocked-at-beforeAll AND a secondary `TypeError: Bind parameters must not contain undefined` in afterAll cleanup.

**Why:** The 2026-04-19 senior-dev log for Subtask 3 labeled its own acceptance criterion as `grep -c "Unknown column 'asset_id'" = 0`. That grep catches only the column-rename flavor of debt; it does NOT catch `INSERT INTO project_assets_current` because the error is at the table level (`ER_NO_SUCH_TABLE`), not the column level. The subtask's completion evidence was narrower than the actual bug surface.

**How to apply:** When the next batch claims "stale schema test debt is done," also grep for `INTO project_assets_current` and `FROM project_assets_current` across `apps/api/src/__tests__/integration/` — not just the `asset_id` column name. Every hit is a Class-C failure candidate and must be triaged.
