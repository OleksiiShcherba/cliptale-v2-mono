/**
 * storyboardPipelineReaper.job.ts — Repeatable BullMQ job that releases stuck phases.
 *
 * ADR-0005: lazy-on-read (T4/api) + reaper sweep (this file) at the 10-minute heartbeat
 * bound ensures the Creator is never permanently blocked behind the loader, including for
 * closed tabs where no read triggers the lazy path.
 *
 * The reaper:
 *   1. Queries over-bound running phases (active_run_phase IS NOT NULL AND
 *      heartbeat_at < NOW(3) - INTERVAL ? MINUTE).
 *   2. For each stuck row: sets <active_run_phase>_status = 'failed', error_message,
 *      active_run_phase = NULL, version = version + 1, under a version CAS
 *      (WHERE draft_id = ? AND version = ?). A concurrent advance that already bumped
 *      the version is not clobbered — affectedRows 0 = stale, skip.
 *   3. Best-effort publish after each release.
 *
 * Registration as a BullMQ repeatable is done in T14 (worker bootstrap). This file
 * exports the processor function + a default-bound wrapper suitable as a BullMQ handler.
 *
 * @see ADR-0005
 * @see spec.md §5 AC-12
 * @see sad.md §6 Flow 2, §8 Liveness
 */

import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// TODO(T14): publishPipelineState is wired in T14. Until then the best-effort publish
// sends a minimal event via publishAiGenerationJobStatus or is left as a no-op consistent
// with the seam used in T10's hooks.

/** Default stuck-phase time bound in minutes (spec §6 NFR, ADR-0005). */
const DEFAULT_BOUND_MINUTES = 10;

/** Whitelisted phase → status-column (injection-safe; mirrors storyboardPipelineHooks.ts). */
const PHASE_STATUS_COLUMN: Record<string, string> = {
  scene: 'scene_status',
  reference_data: 'reference_data_status',
  reference_image: 'reference_image_status',
  scene_image: 'scene_image_status',
};

type StuckRow = RowDataPacket & {
  draft_id: string;
  active_run_phase: string;
  version: number;
};

/**
 * Query stuck phases: rows where active_run_phase IS NOT NULL and the heartbeat is
 * older than `boundMinutes` (mirrors findStuckPhases in the api repository — worker
 * uses its own pool, not the api's).
 */
async function findStuckPhases(pool: Pool, boundMinutes: number): Promise<StuckRow[]> {
  const [rows] = await pool.execute<StuckRow[]>(
    `SELECT draft_id, active_run_phase, version
       FROM storyboard_pipeline
      WHERE active_run_phase IS NOT NULL
        AND heartbeat_at < (NOW(3) - INTERVAL ? MINUTE)`,
    [boundMinutes],
  );
  return rows;
}

/**
 * Release one stuck row under a version CAS. Sets:
 *   - <phase>_status = 'failed'
 *   - error_message = <plain-language>
 *   - active_run_phase = NULL
 *   - version = version + 1
 * Returns affectedRows: 1 = applied, 0 = stale version (concurrent advance won, no-op).
 */
async function releaseStuckPhase(
  pool: Pool,
  draftId: string,
  phase: string,
  currentVersion: number,
): Promise<number> {
  const statusColumn = PHASE_STATUS_COLUMN[phase];
  if (!statusColumn) {
    // Unknown phase name — skip to avoid SQL injection via a corrupted row.
    console.warn(`[reaper] Unknown phase "${phase}" for draft ${draftId}, skipping.`);
    return 0;
  }

  const errorMessage =
    `Phase "${phase}" exceeded its time bound without completing. ` +
    'Generation was stopped automatically. You can retry from the pipeline controls.';

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_pipeline
        SET ${statusColumn} = 'failed',
            error_message = ?,
            active_run_phase = NULL,
            version = version + 1
      WHERE draft_id = ?
        AND version = ?`,
    [errorMessage, draftId, currentVersion],
  );
  return result.affectedRows;
}

/**
 * Run one reaper sweep: find all over-bound running phases and release each via CAS.
 *
 * @param pool      Worker mysql2 pool (NOT the api pool — uses the worker's own db.ts).
 * @param boundMinutes Stuck-phase time bound in minutes (default: DEFAULT_BOUND_MINUTES).
 * @returns Count of rows where the CAS write was applied (affectedRows = 1).
 */
export async function runStoryboardPipelineReaper(params: {
  pool: Pool;
  boundMinutes?: number;
}): Promise<number> {
  const boundMinutes = params.boundMinutes ?? DEFAULT_BOUND_MINUTES;
  const stuckRows = await findStuckPhases(params.pool, boundMinutes);

  let released = 0;
  for (const row of stuckRows) {
    const affected = await releaseStuckPhase(
      params.pool,
      row.draft_id,
      row.active_run_phase,
      row.version,
    );
    if (affected > 0) {
      released++;
      // TODO(T14): best-effort publish pipeline state after release.
      // publishPipelineState({ pool: params.pool, draftId: row.draft_id }) is wired in T14.
    }
  }

  if (released > 0) {
    console.log(`[reaper] Released ${released} stuck pipeline phase(s).`);
  }

  return released;
}

/**
 * BullMQ repeatable job handler (default bound).
 * Registration in the worker bootstrap is T14 — this is the processor function only.
 *
 * Usage (T14):
 *   worker.process(STORYBOARD_PIPELINE_REAPER_JOB_NAME, reaperJobProcessor);
 */
export async function reaperJobProcessor(): Promise<void> {
  // Import the pool lazily so this file can be imported without instantiating a pool
  // at module load time (important for unit-test isolation in other test files).
  const { pool } = await import('@/lib/db.js');
  await runStoryboardPipelineReaper({ pool, boundMinutes: DEFAULT_BOUND_MINUTES });
}

export { DEFAULT_BOUND_MINUTES };
