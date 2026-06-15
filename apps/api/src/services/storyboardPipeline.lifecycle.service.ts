/**
 * storyboardPipeline.lifecycle.service.ts — T8 (cancel + skip use cases)
 *
 * Implements `cancelPhase` (SAD §6 Flow 3; spec §5 AC-06) and
 * `skipPhase` (SAD §6 Flow 4; spec §5 AC-07):
 *
 * cancelPhase:
 *   1. assertDraftOwner — evaluated FIRST (AC-13, SAD §8 cross-cutting). Non-owner
 *      → NotFoundError (deny-and-hide), before any state read or write.
 *   2. Load the pipeline state row.
 *   3. casUpdateState: set the phase sub-state → `idle`, clear active_run_phase → null,
 *      bump the version (ADR-0007). Per-unit terminal state (done reference blocks,
 *      ready illustration jobs) is NOT touched — kept in place (ADR-0008, AC-06
 *      cost-integrity guarantee). No units enqueued.
 *   4. Return the updated row.
 *
 * skipPhase:
 *   1. assertDraftOwner — evaluated FIRST (AC-13).
 *   2. Load the pipeline state row.
 *   3. casUpdateState: set the phase sub-state → `skipped` (DISTINCT from `idle` per AC-07),
 *      clear active_run_phase → null, bump the version (ADR-0007).
 *   4. Return the updated row.
 *
 * Reuse (no logic duplicated):
 *   - canTransition / isPhaseResolved / PipelinePhase — @ai-video-editor/project-schema (T2)
 *   - getPipelineByDraftId / casUpdateState           — storyboardPipeline.repository (T3)
 */

import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';
import { type PipelinePhase } from '@ai-video-editor/project-schema';
import {
  getPipelineByDraftId,
  casUpdateState,
  type StoryboardPipelineRow,
} from '@/repositories/storyboardPipeline.repository.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LifecyclePhaseParams = {
  draftId: string;
  userId: string;
  phase: PipelinePhase;
};

export type LifecyclePhaseResult = StoryboardPipelineRow;

// ── Helpers ───────────────────────────────────────────────────────────────────

type DraftOwnerRow = RowDataPacket & { user_id: string };

/** Verify the draft exists and is owned by userId; otherwise NotFoundError (AC-13). */
async function assertDraftOwner(draftId: string, userId: string): Promise<void> {
  const [rows] = await pool.execute<DraftOwnerRow[]>(
    `SELECT user_id FROM generation_drafts WHERE id = ? LIMIT 1`,
    [draftId],
  );
  if (!rows.length || rows[0]!.user_id !== userId) {
    throw new NotFoundError(`Draft not found`);
  }
}

// ── cancelPhase ───────────────────────────────────────────────────────────────

/**
 * Cancel a running pipeline phase (AC-06, Flow 3).
 *
 * Stops the phase by writing phase sub-state → `idle` and clearing the active-run
 * marker. Enqueues nothing. Per-unit terminal state (done reference blocks, ready
 * scene-image jobs) is kept exactly as-is — this is the cost-integrity guarantee
 * (ADR-0008): an incremental re-trigger will skip every already-done unit.
 *
 * Guard order: ownership → state load → CAS update (matches sibling services T6/T7).
 */
export async function cancelPhase(params: LifecyclePhaseParams): Promise<LifecyclePhaseResult> {
  const { draftId, userId, phase } = params;

  // 1. Authorization — must be first (AC-13).
  await assertDraftOwner(draftId, userId);

  // 2. Load the pipeline state.
  const row = await getPipelineByDraftId(draftId);
  if (row === null) {
    throw new NotFoundError(`Draft not found`);
  }

  // 3. CAS update: phase → idle, clear run marker, bump version (ADR-0007).
  //    Per-unit rows (storyboard_reference_blocks.window_status,
  //    storyboard_scene_illustration_jobs.status) are NOT touched.
  //    No queue jobs enqueued (Flow 3: "enqueue no further units").
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase,
    status: 'idle',
    activeRunPhase: null,
  });

  // 4. Return the fresh state after the update.
  const updated = await getPipelineByDraftId(draftId);
  return updated!;
}

// ── skipPhase ─────────────────────────────────────────────────────────────────

/**
 * Skip a pipeline phase that is awaiting Creator review (AC-07, Flow 4).
 *
 * Records the phase as `skipped` — DISTINCT from `idle` so a downstream prerequisite
 * check (`isPhaseResolved`) can tell an intentional dismissal from a never-run phase.
 * The phase remains re-triggerable from the corner controls (canTransition('skipped',
 * 'running') === true per the transition table in T2).
 *
 * Guard order: ownership → state load → CAS update (matches sibling services T6/T7).
 */
export async function skipPhase(params: LifecyclePhaseParams): Promise<LifecyclePhaseResult> {
  const { draftId, userId, phase } = params;

  // 1. Authorization — must be first (AC-13).
  await assertDraftOwner(draftId, userId);

  // 2. Load the pipeline state.
  const row = await getPipelineByDraftId(draftId);
  if (row === null) {
    throw new NotFoundError(`Draft not found`);
  }

  // 3. CAS update: phase → skipped, clear run marker, bump version (ADR-0007).
  //    `skipped` is the deliberate-decline sub-state; `idle` means never-run (AC-07).
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    phase,
    status: 'skipped',
    activeRunPhase: null,
  });

  // 4. Return the fresh state after the update.
  const updated = await getPipelineByDraftId(draftId);
  return updated!;
}
