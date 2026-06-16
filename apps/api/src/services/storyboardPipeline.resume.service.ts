/**
 * Resume read service — T4: storyboard-generation-pipeline
 *
 * Implements getPipelineState (AC-01, AC-05, AC-12, AC-13):
 *
 *   1. assertDraftOwner — evaluated before any other check (AC-13, SAD §8).
 *   2. Lazy create: if no pipeline row exists yet (fresh unplanned draft),
 *      insert the row, claim the 'scene' run, and enqueue the scene-plan job
 *      so generation starts automatically (AC-01).
 *   3. Lazy stuck-release: if the row's active run phase has a heartbeat older
 *      than the configured bound (default 10 min), flip the phase sub-state to
 *      'failed' and clear the active-run marker before returning (AC-12, ADR-0005).
 *   4. Return the current row projection (AC-05 resume).
 *
 * The stuck-phase bound is read from config (APP_PIPELINE_STUCK_PHASE_BOUND_MINUTES,
 * resolved in config.ts — the ONLY file allowed to read process.env per the repo
 * convention; see SAD §8 — configurable via APP_*).
 */

import { randomUUID } from 'node:crypto';

import type { RowDataPacket } from 'mysql2/promise';

import { config } from '@/config.js';
import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';
import { enqueueStoryboardPlan } from '@/queues/jobs/enqueue-storyboard-plan.js';
import {
  getPipelineByDraftId,
  insertPipelineRow,
  claimRun,
  casUpdateState,
  findStuckPhases,
  type StoryboardPipelineRow,
} from '@/repositories/storyboardPipeline.repository.js';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Stuck-phase bound in minutes (ADR-0005, spec §6 NFR) — resolved in config.ts. */
const STUCK_PHASE_BOUND_MINUTES: number = config.storyboardPipeline.stuckPhaseBoundMinutes;

// ── Domain type ───────────────────────────────────────────────────────────────

/** The pipeline state projection returned to callers on every Step-2 open. */
export type PipelineStateDto = StoryboardPipelineRow;

// ── Internal helpers ──────────────────────────────────────────────────────────

type DraftOwnerRow = RowDataPacket & { user_id: string; status: string };

/**
 * Verify the draft exists and is owned by userId.
 * Throws NotFoundError for both absent and wrong-owner cases (deny-and-hide,
 * AC-13: evaluated before any prerequisite/ordering check).
 *
 * Returns the draft status so callers can gate auto-start on step2+.
 */
async function assertDraftOwner(draftId: string, userId: string): Promise<string> {
  const [rows] = await pool.execute<DraftOwnerRow[]>(
    `SELECT user_id, status FROM generation_drafts WHERE id = ? LIMIT 1`,
    [draftId],
  );
  if (!rows.length || rows[0]!.user_id !== userId) {
    throw new NotFoundError(`Draft not found`);
  }
  return rows[0]!.status;
}

/**
 * True when the row's active run has a heartbeat older than STUCK_PHASE_BOUND_MINUTES,
 * evaluated via a DB-side SQL comparison (avoids Node/MySQL timezone offset issues).
 * Uses findStuckPhases which queries `heartbeat_at < (NOW(3) - INTERVAL ? MINUTE)`.
 */
async function isStuckDb(draftId: string): Promise<boolean> {
  const stuck = await findStuckPhases({ boundMinutes: STUCK_PHASE_BOUND_MINUTES });
  return stuck.some((r) => r.draftId === draftId);
}

/**
 * Lazy stuck-release (ADR-0005, AC-12): flip the over-bound running phase to
 * 'failed', clear the active-run marker. Returns the updated row.
 *
 * Uses casUpdateState — if a concurrent process already resolved it, the CAS
 * loses (0 affectedRows) and we re-read to get the latest state.
 */
async function lazyRelease(row: StoryboardPipelineRow): Promise<StoryboardPipelineRow> {
  const stuckPhase = row.activeRunPhase!; // non-null by isStuck() guard

  const affected = await casUpdateState({
    draftId: row.draftId,
    currentVersion: row.version,
    phase: stuckPhase,
    status: 'failed',
    activeRunPhase: null,
    errorMessage: `Phase '${stuckPhase}' exceeded the ${STUCK_PHASE_BOUND_MINUTES}-minute no-progress bound and was automatically released.`,
  });

  if (affected === 0) {
    // Lost the CAS race — re-read and return the current state
    const fresh = await getPipelineByDraftId(row.draftId);
    return fresh!; // row was just read above so it must exist
  }

  // Return a projected copy without issuing an extra read
  return {
    ...row,
    [stuckPhase === 'scene' ? 'sceneStatus'
     : stuckPhase === 'reference_data' ? 'referenceDataStatus'
     : stuckPhase === 'reference_image' ? 'referenceImageStatus'
     : 'sceneImageStatus']: 'failed',
    activeRunPhase: null,
    errorMessage: `Phase '${stuckPhase}' exceeded the ${STUCK_PHASE_BOUND_MINUTES}-minute no-progress bound and was automatically released.`,
    version: row.version + 1,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read the pipeline state for `draftId`, lazily creating it and auto-starting
 * scene generation when the draft has never been planned (AC-01), and lazily
 * releasing stuck phases on read (AC-12). Auth is checked first (AC-13).
 *
 * This is the single entry-point for "GET /generation-drafts/:id/pipeline-state"
 * (wired in T9).
 */
export async function getPipelineState(
  draftId: string,
  userId: string,
): Promise<PipelineStateDto> {
  // 1. Authorization — must be first (AC-13, SAD §8)
  const draftStatus = await assertDraftOwner(draftId, userId);

  // 2. Read existing row
  let row = await getPipelineByDraftId(draftId);

  // 3. Fresh draft — lazily create row + auto-start scene generation (AC-01).
  //    Guard: only auto-start for step2+ drafts. step1 ('draft') drafts are not
  //    in the storyboard phase yet, so enqueueing a scene-plan job would be premature
  //    (and would trigger real LLM calls for empty prompt docs).
  if (row === null) {
    // INSERT IGNORE so a concurrent first-open does not error (idempotent)
    await insertPipelineRow({ draftId });

    // Re-read to get the freshly inserted defaults (version = 1, scene_status = 'idle')
    row = (await getPipelineByDraftId(draftId))!;

    if (draftStatus === 'step2' || draftStatus === 'step3' || draftStatus === 'completed') {
      // Claim the 'scene' run via the active-run CAS (ADR-0007)
      const affected = await claimRun({ draftId, phase: 'scene', currentVersion: row.version });

      if (affected === 1) {
        // We won the claim — enqueue the scene-plan job (AC-01)
        const jobId = randomUUID();
        await enqueueStoryboardPlan({ jobId, draftId, userId });
      }

      // Re-read to return the post-claim state (running or whatever the winner set)
      row = (await getPipelineByDraftId(draftId))!;
    }

    return row;
  }

  // 4. Lazy stuck-release: if active run is over-bound, flip to failed (AC-12, ADR-0005)
  if (row.activeRunPhase !== null && (await isStuckDb(draftId))) {
    row = await lazyRelease(row);
    return row;
  }

  // 5. Existing healthy row — return as-is (AC-05 resume)
  return row;
}
