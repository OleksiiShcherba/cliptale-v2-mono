# T21 Cut-over Runbook — storyboard_pipeline backfill

One-time operation: seeds a `storyboard_pipeline` row for every in-flight
old-flow draft that has a `storyboard_plan_jobs`, `storyboard_cast_extraction_jobs`,
or `storyboard_scene_illustration_jobs` row in `queued`/`running` status (or a
completed cast extraction with a non-null `proposal_json`), and no pipeline row yet.

## Prerequisites

- Migration 057 (`057_storyboard_pipeline.sql`) must be applied on the target DB.
- Service can remain running; the backfill only INSERTs (INSERT IGNORE), no UPDATEs.

## Step 1 — Dry-run (review what will be seeded)

```ts
// scripts/backfill-pipeline-dry-run.ts
import mysql from 'mysql2/promise';
import { backfillStoryboardPipeline } from '../src/db/cutover/storyboardPipelineBackfill.js';

const pool = mysql.createPool({
  host:     process.env['APP_DB_HOST']     ?? 'localhost',
  port:     Number(process.env['APP_DB_PORT'] ?? 3306),
  database: process.env['APP_DB_NAME']     ?? 'cliptale',
  user:     process.env['APP_DB_USER']     ?? 'cliptale',
  password: process.env['APP_DB_PASSWORD'] ?? '',
  connectionLimit: 3,
});

const report = await backfillStoryboardPipeline(pool, { dryRun: true });
console.log('DRY-RUN report:', JSON.stringify(report, null, 2));
await pool.end();
```

Run:

```sh
APP_DB_PASSWORD=<password> npx tsx scripts/backfill-pipeline-dry-run.ts
```

Review `report.examined` (drafts that would be seeded) and `report.entries` (the
mapped state for each draft). Confirm the `activePhase` / `*_status` values look
correct before proceeding.

## Step 2 — Apply

Change `dryRun: true` to `dryRun: false` (or use a second script):

```sh
APP_DB_PASSWORD=<password> npx tsx scripts/backfill-pipeline-apply.ts
```

The function is idempotent: re-running returns `seeded: 0`, `skipped: N`.

## Verification query

After apply, confirm no in-flight draft remains without a pipeline row:

```sql
SELECT d.id, d.status
FROM generation_drafts d
LEFT JOIN storyboard_pipeline sp ON sp.draft_id = d.id
WHERE sp.draft_id IS NULL
  AND (
    EXISTS (SELECT 1 FROM storyboard_plan_jobs pj
            WHERE pj.draft_id = d.id AND pj.status IN ('queued','running'))
    OR EXISTS (SELECT 1 FROM storyboard_cast_extraction_jobs ce
               WHERE ce.draft_id = d.id AND ce.status IN ('queued','running'))
    OR EXISTS (SELECT 1 FROM storyboard_scene_illustration_jobs si
               WHERE si.draft_id = d.id AND si.status IN ('queued','running'))
    OR EXISTS (SELECT 1 FROM storyboard_reference_blocks rb
               WHERE rb.draft_id = d.id AND rb.window_status IN ('pending','running'))
  );
-- Expected: 0 rows.
```

## Rollback note

The backfill only adds rows; it never modifies existing ones. To roll back:

```sql
-- Remove ALL pipeline rows (caution: also removes live rows created by normal flow).
-- Safer: delete only rows created by the backfill (created_at window):
DELETE FROM storyboard_pipeline
WHERE created_at BETWEEN '<backfill-start>' AND '<backfill-end>';
```

If you need to fully reset the pipeline table (e.g., during initial staging),
the manual rollback from migration 057 is: `DROP TABLE IF EXISTS storyboard_pipeline;`
