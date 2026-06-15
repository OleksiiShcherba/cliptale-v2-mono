# T21 Cut-over Runbook — storyboard_pipeline backfill

One-time operation: seeds a `storyboard_pipeline` row for every migratable
old-flow draft that has no pipeline row yet —
- a `storyboard_plan_jobs`, `storyboard_cast_extraction_jobs`,
  `storyboard_scene_illustration_jobs`, or `storyboard_reference_blocks` row in
  `queued`/`running`/`pending` status, or a completed cast extraction with a
  non-null `proposal_json`; **or**
- a draft parked on Step-2 (`status='step2'`) **that already has generated `scene`
  blocks** — seeded `scene completed` (no active run), so resume returns it healthy.

> **F1 (review r3):** the bare `status='step2'` predicate was removed. `step2` is the
> normal status for ANY draft on the Step-2 screen, so the old scan over-seeded every
> idle/finished draft as `scene running` — throwing the Creator behind a phantom
> scene-gen loader the reaper then failed at the 10-min bound. Only step2 drafts with
> generated scenes are now migratable (as `scene completed`); a step2 draft with **no**
> scenes is left for resume lazy-create to auto-start.
>
> **Dev-DB cleanup (one-time):** the first dev apply (pre-F1) seeded ~158 `step2`
> drafts as `scene/running`. Re-running the backfill will NOT fix them (`INSERT IGNORE`
> skips existing rows). Delete the bad rows before/after re-applying:
> ```sql
> DELETE sp FROM storyboard_pipeline sp
> WHERE sp.active_run_phase = 'scene' AND sp.scene_status = 'running'
>   AND NOT EXISTS (SELECT 1 FROM storyboard_plan_jobs pj
>                   WHERE pj.draft_id = sp.draft_id AND pj.status IN ('queued','running'));
> ```
> Prod has not been backfilled yet, so prod is unaffected.

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
    OR (d.status = 'step2' AND EXISTS (SELECT 1 FROM storyboard_blocks b
               WHERE b.draft_id = d.id AND b.block_type = 'scene'))
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
