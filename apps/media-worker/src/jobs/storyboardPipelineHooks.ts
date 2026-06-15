/**
 * storyboardPipelineHooks.ts — Worker completion-hooks that advance the pipeline
 * phase via the shared transition module (T10, ADR-0003).
 *
 * The media-worker owns its OWN db pool (apps/media-worker/src/lib/db.ts) and writes
 * the single `storyboard_pipeline` row DIRECTLY under a version CAS (ADR-0002, ADR-0007).
 * It does NOT import the api repositories. The pure transition module
 * (@ai-video-editor/project-schema) decides legality (canTransition); this module
 * performs the CAS write, mirroring the shape of apps/api/src/repositories/
 * storyboardPipeline.repository.ts (casUpdateState).
 *
 * Each hook runs at a worker completion point (Flow 1, sad.md §6):
 *   - onSceneGenerationComplete    — scene → completed, advance to reference_data running.
 *   - onCastProposalReady          — reference_data → awaiting_review (Review-cast modal).
 *   - onReferenceImagesAllTerminal — when EVERY reference block is terminal (done/failed),
 *                                    reference_image → completed, scene_image → awaiting_review
 *                                    (scene-image offer). A failed reference is still terminal:
 *                                    the phase advances regardless (AC-03 failure-tolerant).
 *
 * Every advance is a version CAS: read current version, decide via the transition module,
 * UPDATE ... WHERE draft_id = ? AND version = ?. affectedRows 0 = stale/lost-race → no-op
 * (idempotent on job redelivery).
 */

import {
  canTransition,
  type PhaseStatus,
  type PipelinePhase,
} from '@ai-video-editor/project-schema';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { publishPipelineState } from '@/lib/realtime.js';

/**
 * Best-effort realtime publish of the full projected pipeline state after a CAS
 * transition (T14, AC-05, ADR-0004). Wrapped so a publish failure NEVER fails the job.
 */
async function publishStateBestEffort(pool: Pool, draftId: string): Promise<void> {
  try {
    await publishPipelineState({ pool, draftId });
  } catch (error) {
    console.error('[storyboardPipelineHooks] publish failed:', error);
  }
}

/**
 * Illustration model used for both reference-image and scene-image phases (mirrors
 * apps/api/src/services/storyboardIllustration.config.ts; the worker cannot import
 * api services, so the value is co-located here).
 */
const STORYBOARD_ILLUSTRATION_MODEL_ID = 'openai/gpt-image-2';

/**
 * Compute the estimate-vs-actual delta as a signed percentage.
 *   delta = ((actual - estimate) / estimate) × 100
 *
 * Returns 0 when estimate is 0 (zero-guard). This is a deliberate 3-line duplication
 * of the pure helper in apps/api/src/services/storyboardPipeline.cost.service.ts
 * (estimateActualDeltaPct) because the worker cannot import API services. Both copies
 * are unit-tested. Metric name: `cost_estimate_actual_delta_pct` (SAD §7, ADR-0006).
 */
function computeEstimateActualDeltaPct(estimate: number, actual: number): number {
  if (estimate === 0) return 0;
  return ((actual - estimate) / estimate) * 100;
}

/**
 * Query the per-unit cost for the storyboard illustration model directly from the
 * worker's own DB pool. Priority: per_image → base_amount → 0.
 * The worker cannot import the api's getPricingForModel (separate app) so we issue a
 * direct query here — same table, same logic, no caching needed for completion hooks
 * (each runs once per phase).
 */
async function queryPerUnitCost(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<Array<RowDataPacket & { base_amount: string | null; per_image: string | null }>>(
    `SELECT base_amount, per_image FROM flow_model_pricing WHERE model_id = ? LIMIT 1`,
    [STORYBOARD_ILLUSTRATION_MODEL_ID],
  );
  if (!rows.length) return 0;
  const row = rows[0]!;
  const perImage = row.per_image != null ? parseFloat(row.per_image) : null;
  const baseAmount = row.base_amount != null ? parseFloat(row.base_amount) : 0;
  return perImage ?? baseAmount;
}

/** Whitelisted phase → status-column map (keeps dynamic column names injection-safe). */
const PHASE_STATUS_COLUMN: Record<PipelinePhase, string> = {
  scene: 'scene_status',
  reference_data: 'reference_data_status',
  reference_image: 'reference_image_status',
  scene_image: 'scene_image_status',
};

/** Reference-block window states that count as terminal for phase-advance (AC-03). */
const TERMINAL_WINDOW_STATUSES = ['done', 'failed', 'skipped'] as const;

/** Scene-illustration job states that count as terminal for scene-image phase-advance (AC-04). */
const TERMINAL_SCENE_ILLUSTRATION_STATUSES = ['ready', 'failed'] as const;

type CurrentStateRow = RowDataPacket & {
  version: number;
  scene_status: PhaseStatus;
  reference_data_status: PhaseStatus;
  reference_image_status: PhaseStatus;
  scene_image_status: PhaseStatus;
  cost_estimate: string | null;
};

type PhaseSetItem = { phase: PipelinePhase; status: PhaseStatus };

/** Read the columns the hooks reason over for one draft. */
async function readState(pool: Pool, draftId: string): Promise<CurrentStateRow | null> {
  const [rows] = await pool.execute<CurrentStateRow[]>(
    `SELECT version, scene_status, reference_data_status,
            reference_image_status, scene_image_status,
            CAST(cost_estimate AS CHAR) AS cost_estimate
       FROM storyboard_pipeline
      WHERE draft_id = ?`,
    [draftId],
  );
  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Apply a phase advance under a version CAS (ADR-0007), mirroring the api repository's
 * casUpdateState shape. Sets each supplied phase sub-state, foregrounds `activePhase`,
 * sets/clears the active-run marker, bumps the version, refreshes the heartbeat.
 * Returns affectedRows: 1 = applied, 0 = stale version (caller no-ops).
 */
async function casAdvance(
  pool: Pool,
  params: {
    draftId: string;
    currentVersion: number;
    activePhase: PipelinePhase;
    phaseSets: PhaseSetItem[];
    activeRunPhase: PipelinePhase | null;
    payloadJson?: unknown;
    actualCost?: string;
  },
): Promise<number> {
  const sets: string[] = [
    'version = version + 1',
    'heartbeat_at = NOW(3)',
    'active_phase = ?',
    'active_run_phase = ?',
  ];
  const values: Array<string | number | null> = [params.activePhase, params.activeRunPhase];

  for (const item of params.phaseSets) {
    sets.push(`${PHASE_STATUS_COLUMN[item.phase]} = ?`);
    values.push(item.status);
  }

  if (params.payloadJson !== undefined) {
    sets.push('payload_json = ?');
    values.push(params.payloadJson === null ? null : JSON.stringify(params.payloadJson));
  }

  if (params.actualCost !== undefined) {
    sets.push('actual_cost = ?');
    values.push(params.actualCost);
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_pipeline
        SET ${sets.join(',\n            ')}
      WHERE draft_id = ?
        AND version = ?`,
    [...values, params.draftId, params.currentVersion],
  );
  return result.affectedRows;
}

/**
 * AC-02 — scene generation completed: mark scene `completed` and advance to
 * reference-data `running` (the next phase begins behind the loader). Legality
 * checked via the shared transition module. No-op if scene is not `running`
 * (idempotent on redelivery) or the CAS loses the race.
 */
export async function onSceneGenerationComplete(params: {
  pool: Pool;
  draftId: string;
}): Promise<void> {
  const { pool, draftId } = params;
  const state = await readState(pool, draftId);
  if (!state) return;

  // running → completed must be legal, and idle → running for the next phase.
  if (!canTransition(state.scene_status, 'completed')) return;
  if (!canTransition(state.reference_data_status, 'running')) return;

  const affected = await casAdvance(pool, {
    draftId,
    currentVersion: state.version,
    activePhase: 'reference_data',
    phaseSets: [
      { phase: 'scene', status: 'completed' },
      { phase: 'reference_data', status: 'running' },
    ],
    activeRunPhase: 'reference_data',
  });
  if (affected > 0) await publishStateBestEffort(pool, draftId);
}

/**
 * AC-02 — cast proposal ready: advance reference-data to `awaiting_review` (the
 * Review-cast modal pending). Releases the active-run marker for review. No-op if
 * reference-data is not `running` or the CAS loses the race.
 */
export async function onCastProposalReady(params: {
  pool: Pool;
  draftId: string;
}): Promise<void> {
  const { pool, draftId } = params;
  const state = await readState(pool, draftId);
  if (!state) return;

  if (!canTransition(state.reference_data_status, 'awaiting_review')) return;

  const affected = await casAdvance(pool, {
    draftId,
    currentVersion: state.version,
    activePhase: 'reference_data',
    phaseSets: [{ phase: 'reference_data', status: 'awaiting_review' }],
    activeRunPhase: null,
  });
  if (affected > 0) await publishStateBestEffort(pool, draftId);
}

/** True when no reference block for the draft is still pending/running (all terminal). */
async function areAllReferenceBlocksTerminal(pool: Pool, draftId: string): Promise<boolean> {
  const [rows] = await pool.execute<Array<RowDataPacket & { total: number; non_terminal: number }>>(
    `SELECT COUNT(*) AS total,
            COUNT(CASE WHEN window_status NOT IN (?, ?, ?) THEN 1 END) AS non_terminal
       FROM storyboard_reference_blocks
      WHERE draft_id = ?`,
    [...TERMINAL_WINDOW_STATUSES, draftId],
  );
  const row = rows[0]!;
  const total = Number(row.total);
  const nonTerminal = Number(row.non_terminal);
  // No blocks at all → nothing to wait on (treat as not-terminal: don't advance a
  // phase that never had units). With blocks, advance only when every one is terminal.
  return total > 0 && nonTerminal === 0;
}

/**
 * AC-03 — reference-image completion point: when EVERY reference block has reached a
 * terminal window_status (done / failed / skipped), mark reference_image `completed`
 * and advance scene_image to `awaiting_review` (the scene-image offer). A reference
 * that FAILED still counts as terminal — the phase advances regardless (failure-
 * tolerant; the reaper owns whole-phase stalls, T11). No-op while any block is still
 * pending/running, or if the CAS loses the race / phase already advanced.
 *
 * `sceneImageOffer` is an optional minimal scene-image offer payload; the full modal
 * data (estimate plumbing) is finalized in the UI/cost tasks.
 */
export async function onReferenceImagesAllTerminal(params: {
  pool: Pool;
  draftId: string;
  sceneImageOffer?: unknown;
}): Promise<void> {
  const { pool, draftId } = params;

  if (!(await areAllReferenceBlocksTerminal(pool, draftId))) return;

  const state = await readState(pool, draftId);
  if (!state) return;

  // Gate on the FINISHING phase's legal transition (running → completed). Setting
  // scene_image to `awaiting_review` is presenting the next-phase OFFER (not a
  // scene_image sub-state transition) — a direct write, matching the api precedent
  // (storyboardPipeline.trigger.service: reference_image→completed then
  // scene_image→awaiting_review via casUpdateState, no idle→awaiting_review gate).
  if (!canTransition(state.reference_image_status, 'completed')) return;

  // T13 — compute actual cost: count reference blocks with window_status='done'
  // (those that produced an image) × per-unit price. Failed/skipped blocks consumed
  // no image generation credit so they don't count toward the actual charge.
  const [refCountRows] = await pool.execute<Array<RowDataPacket & { done_count: number }>>(
    `SELECT COUNT(*) AS done_count FROM storyboard_reference_blocks
      WHERE draft_id = ? AND window_status = 'done'`,
    [draftId],
  );
  const doneCount = Number(refCountRows[0]!.done_count);
  const perUnit = await queryPerUnitCost(pool);
  const actualCostNum = doneCount * perUnit;
  const actualCostStr = actualCostNum.toFixed(4);

  // Emit the estimate-vs-actual delta to telemetry (SAD §7, ADR-0006).
  const estimate = state.cost_estimate != null ? parseFloat(state.cost_estimate) : 0;
  const deltaPct = computeEstimateActualDeltaPct(estimate, actualCostNum);
  console.info(
    JSON.stringify({
      metric: 'cost_estimate_actual_delta_pct',
      draft_id: draftId,
      phase: 'reference_image',
      estimate: state.cost_estimate ?? '0.0000',
      actual: actualCostStr,
      delta_pct: deltaPct,
    }),
  );

  const affected = await casAdvance(pool, {
    draftId,
    currentVersion: state.version,
    activePhase: 'scene_image',
    phaseSets: [
      { phase: 'reference_image', status: 'completed' },
      { phase: 'scene_image', status: 'awaiting_review' },
    ],
    activeRunPhase: null,
    actualCost: actualCostStr,
    ...(params.sceneImageOffer !== undefined ? { payloadJson: params.sceneImageOffer } : {}),
  });
  if (affected > 0) await publishStateBestEffort(pool, draftId);
}

/** True when every scene-illustration job for the draft is terminal (ready / failed). */
async function areAllSceneImagesTerminal(pool: Pool, draftId: string): Promise<boolean> {
  const [rows] = await pool.execute<Array<RowDataPacket & { total: number; non_terminal: number }>>(
    `SELECT COUNT(*) AS total,
            COUNT(CASE WHEN status NOT IN (?, ?) THEN 1 END) AS non_terminal
       FROM storyboard_scene_illustration_jobs
      WHERE draft_id = ?`,
    [...TERMINAL_SCENE_ILLUSTRATION_STATUSES, draftId],
  );
  const row = rows[0]!;
  const total = Number(row.total);
  const nonTerminal = Number(row.non_terminal);
  // No scene-illustration jobs at all → nothing to advance (don't complete a phase
  // that never had units). With jobs, advance only when every one is terminal.
  return total > 0 && nonTerminal === 0;
}

/**
 * AC-04 — scene-image completion point: when EVERY scene-illustration job for the draft
 * has reached a terminal status (`ready` / `failed`), mark scene_image `completed`. A
 * scene that FAILED still counts as terminal — the phase completes regardless (failure-
 * tolerant; the failed scene is left without an image and stays individually re-triggerable,
 * and the whole-phase stall is the reaper's job, T11). No-op while any scene-illustration
 * job is still queued/running, or if the CAS loses the race / the phase already advanced.
 *
 * This is the scene-image mirror of onReferenceImagesAllTerminal: a best-effort advance
 * called at every scene-image job completion point (success OR failure). Idempotent on
 * redelivery via the version CAS.
 */
export async function onSceneImagesAllTerminal(params: {
  pool: Pool;
  draftId: string;
}): Promise<void> {
  const { pool, draftId } = params;

  if (!(await areAllSceneImagesTerminal(pool, draftId))) return;

  const state = await readState(pool, draftId);
  if (!state) return;

  // running → completed must be a legal scene_image transition (idempotent: a second
  // delivery sees scene_image already `completed` and this gate no-ops).
  if (!canTransition(state.scene_image_status, 'completed')) return;

  // T13 — compute actual cost: count scene illustration jobs with status='ready'
  // (those that produced an image) × per-unit price. Failed jobs consumed no credit.
  const [sceneCountRows] = await pool.execute<Array<RowDataPacket & { ready_count: number }>>(
    `SELECT COUNT(*) AS ready_count FROM storyboard_scene_illustration_jobs
      WHERE draft_id = ? AND status = 'ready'`,
    [draftId],
  );
  const readyCount = Number(sceneCountRows[0]!.ready_count);
  const perUnit = await queryPerUnitCost(pool);
  const actualCostNum = readyCount * perUnit;
  const actualCostStr = actualCostNum.toFixed(4);

  // Emit the estimate-vs-actual delta to telemetry (SAD §7, ADR-0006).
  const estimate = state.cost_estimate != null ? parseFloat(state.cost_estimate) : 0;
  const deltaPct = computeEstimateActualDeltaPct(estimate, actualCostNum);
  console.info(
    JSON.stringify({
      metric: 'cost_estimate_actual_delta_pct',
      draft_id: draftId,
      phase: 'scene_image',
      estimate: state.cost_estimate ?? '0.0000',
      actual: actualCostStr,
      delta_pct: deltaPct,
    }),
  );

  const affected = await casAdvance(pool, {
    draftId,
    currentVersion: state.version,
    activePhase: 'scene_image',
    phaseSets: [{ phase: 'scene_image', status: 'completed' }],
    activeRunPhase: null,
    actualCost: actualCostStr,
  });
  if (affected > 0) await publishStateBestEffort(pool, draftId);
}
