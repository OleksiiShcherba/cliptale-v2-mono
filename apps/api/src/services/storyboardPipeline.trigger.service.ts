/**
 * storyboardPipeline.trigger.service.ts — T7 (trigger phase: guards + incremental re-trigger)
 *
 * Implements `triggerPhase` (SAD §6 Flow 3/5; spec §5 AC-04, AC-06, AC-08, AC-15):
 *
 *   1. assertDraftOwner — evaluated FIRST (AC-13, SAD §8 cross-cutting). Non-owner
 *      → NotFoundError (deny-and-hide), before any prerequisite/guard/write.
 *   2. Scenes-required guard (AC-15, BEFORE phase-order): triggering any phase that
 *      consumes scenes with zero generated scene blocks → ScenesRequiredError
 *      (pipeline.scenes_required). Must precede the order guard so the Creator gets
 *      the specific "generate scenes first" message rather than the generic order message.
 *   3. Phase-order guard (AC-08): every earlier phase must be completed or skipped →
 *      PhaseOutOfOrderError (pipeline.phase_out_of_order).
 *   4. Idempotency / already-running (AC-14): a trigger that finds the same phase
 *      already in flight returns the existing run without re-enqueueing.
 *   5. Accept awaiting_review for scene_image (AC-04): transition from awaiting_review
 *      → running, then run the incremental enqueue.
 *   6. Incremental enqueue (AC-06, ADR-0008): read per-unit terminal state and enqueue
 *      ONLY non-terminal units:
 *        - reference_image phase: `window_status` ∈ {pending, running, failed} → re-enqueue
 *        - scene_image phase:     latest illustration job `status` ∈ {queued, running, failed}
 *          OR no job exists yet → enqueue
 *        - done (`window_status = 'done'` / `status = 'ready'`) → skip, no re-spend.
 *      If every unit is already done → advance to 'completed' without enqueueing (Flow 3 `else`).
 *
 * Reuse (no logic duplicated):
 *   - checkPhaseOrder / checkScenesRequired    — @ai-video-editor/project-schema (T2)
 *   - decideRunClaim / PipelinePhase           — @ai-video-editor/project-schema (T2)
 *   - getPipelineByDraftId / claimRun / casUpdateState — storyboardPipeline.repository (T3)
 *   - listReferenceBlocksByDraftId             — storyboardReference.repository
 *   - findLatestIllustrationJobsByDraftId      — storyboardSceneIllustration.repository
 *   - REFERENCE_DEFAULT_* + ai_generate enqueue — storyboardReference.confirm.service
 *   - createIllustrationJobMapping + enqueue   — storyboardSceneIllustration.repository + enqueue-storyboard-openai-image
 */

import { randomUUID } from 'node:crypto';

import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { GateError, NotFoundError } from '@/lib/errors.js';
import { aiGenerateQueue } from '@/queues/bullmq.js';
import { enqueueStoryboardOpenAIImage } from '@/queues/jobs/enqueue-storyboard-openai-image.js';
import {
  checkPhaseOrder,
  checkScenesRequired,
  decideRunClaim,
  type PipelinePhase,
  type PipelinePhaseStatuses,
} from '@ai-video-editor/project-schema';
import {
  getPipelineByDraftId,
  claimRun,
  casUpdateState,
  type StoryboardPipelineRow,
} from '@/repositories/storyboardPipeline.repository.js';
import { listReferenceBlocksByDraftId } from '@/repositories/storyboardReference.repository.js';
import {
  findLatestIllustrationJobsByDraftId,
  createIllustrationJobMapping,
} from '@/repositories/storyboardSceneIllustration.repository.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import {
  REFERENCE_DEFAULT_MODEL_ID,
  REFERENCE_DEFAULT_CAPABILITY,
  REFERENCE_DEFAULT_PROVIDER,
} from '@/services/storyboardReference.confirm.service.js';
import {
  STORYBOARD_OPENAI_IMAGE_MODEL_ID,
  STORYBOARD_ILLUSTRATION_QUALITY,
  getOpenAIImageSize,
} from '@/services/storyboardIllustration.config.js';

// ── Typed guard error classes (HTTP mapping delegated to T9 controller) ────────

/**
 * Raised when a phase is triggered before its prerequisites are resolved
 * (completed or skipped). Maps to HTTP 422 with code `pipeline.phase_out_of_order`.
 */
export class PhaseOutOfOrderError extends GateError {
  constructor(message: string) {
    super(message, 'pipeline.phase_out_of_order', {});
    this.name = 'PhaseOutOfOrderError';
  }
}

/**
 * Raised when a phase that consumes scenes (anything past `scene`) is triggered
 * with no generated scene blocks present. Maps to HTTP 422 with code `pipeline.scenes_required`.
 */
export class ScenesRequiredError extends GateError {
  constructor(message: string) {
    super(message, 'pipeline.scenes_required', {});
    this.name = 'ScenesRequiredError';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggerPhaseParams = {
  draftId: string;
  userId: string;
  phase: PipelinePhase;
};

export type TriggerPhaseResult = StoryboardPipelineRow;

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

/** Count scene blocks for a draft (scenes-required guard, AC-15). */
async function countSceneBlocks(draftId: string): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_blocks WHERE draft_id = ? AND block_type = 'scene'`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

/** Row shape from storyboard_blocks needed for scene-image enqueue. */
type SceneBlockRow = { id: string; name: string | null; sort_order: number };

/** All scene blocks for a draft (used to build scene-image jobs). */
async function listSceneBlocks(draftId: string): Promise<SceneBlockRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, sort_order FROM storyboard_blocks
      WHERE draft_id = ? AND block_type = 'scene'
      ORDER BY sort_order ASC`,
    [draftId],
  );
  return rows as SceneBlockRow[];
}

/**
 * Draft aspect_ratio for image-size calculation. The `generation_drafts` table
 * does not carry aspect_ratio (it lives in the video project config); default to
 * '16:9' (landscape — the pipeline's primary target format). T12 will wire the real
 * aspect ratio when it builds the full scene-image payload from the video config.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getDraftAspectRatio(_draftId: string): Promise<string> {
  return '16:9';
}

/**
 * Extract the PipelinePhaseStatuses projection from a row
 * (needed by the pure transition-module guards).
 */
function phaseStatuses(row: StoryboardPipelineRow): PipelinePhaseStatuses {
  return {
    scene: row.sceneStatus,
    reference_data: row.referenceDataStatus,
    reference_image: row.referenceImageStatus,
    scene_image: row.sceneImageStatus,
  };
}

// ── Incremental enqueue — reference_image phase ───────────────────────────────

/**
 * Enqueue reference-image generation for non-terminal reference blocks only
 * (ADR-0008). `done` blocks are skipped. Returns the count of jobs enqueued.
 */
async function enqueueNonTerminalReferenceBlocks(
  draftId: string,
  userId: string,
): Promise<number> {
  const blocks = await listReferenceBlocksByDraftId({ draftId, userId });
  let enqueued = 0;
  for (const block of blocks) {
    // Terminal: done → skip (ADR-0008 cost-integrity guarantee)
    if (block.windowStatus === 'done') continue;

    const jobId = randomUUID();
    const prompt = block.description?.trim() || block.name;
    const options = {
      prompt,
      image_size: 'square_hd',
      num_images: 1,
      output_format: 'png',
      sync_mode: false,
    };

    await pool.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [jobId, userId, REFERENCE_DEFAULT_MODEL_ID, REFERENCE_DEFAULT_CAPABILITY, prompt, JSON.stringify(options)],
    );
    await pool.execute(
      `UPDATE storyboard_reference_blocks SET first_job_id = ? WHERE id = ?`,
      [jobId, block.id],
    );
    await aiGenerateQueue.add('ai-generate', {
      jobId,
      userId,
      modelId: REFERENCE_DEFAULT_MODEL_ID,
      capability: REFERENCE_DEFAULT_CAPABILITY,
      provider: REFERENCE_DEFAULT_PROVIDER,
      prompt,
      options,
    });
    enqueued++;
  }
  return enqueued;
}

// ── Incremental enqueue — scene_image phase ───────────────────────────────────

/**
 * Enqueue scene-image generation for non-terminal scene units only (ADR-0008).
 * `ready` illustration jobs are skipped. Returns the count of jobs enqueued.
 *
 * Non-terminal = no existing job OR latest job status ∈ {queued, running, failed}.
 * Terminal     = latest job status = 'ready'.
 */
async function enqueueNonTerminalSceneIllustrations(
  draftId: string,
  userId: string,
): Promise<number> {
  const sceneBlocks = await listSceneBlocks(draftId);
  const existingJobs = await findLatestIllustrationJobsByDraftId(draftId);

  // Build a map blockId → latest illustration job status
  const latestStatusByBlockId = new Map<string, string>(
    existingJobs.map((j) => [j.blockId, j.status]),
  );

  const aspectRatio = await getDraftAspectRatio(draftId);
  const size = getOpenAIImageSize(aspectRatio as Parameters<typeof getOpenAIImageSize>[0]);

  let enqueued = 0;
  for (const scene of sceneBlocks) {
    const latestStatus = latestStatusByBlockId.get(scene.id);

    // Terminal: 'ready' → skip (ADR-0008 cost-integrity guarantee)
    if (latestStatus === 'ready') continue;

    // Non-terminal (no job, queued, running, or failed) → enqueue a new job
    const jobId = randomUUID();
    const prompt = scene.name ?? 'Scene';

    await aiGenerationJobRepository.createJob({
      jobId,
      userId,
      modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
      capability: 'image_edit',
      prompt,
      options: {
        kind: 'scene',
        blockId: scene.id,
        referenceFileIds: [],
        previousSceneFileId: null,
        size,
        quality: STORYBOARD_ILLUSTRATION_QUALITY,
      },
    });
    await aiGenerationJobRepository.setDraftId(jobId, draftId);

    await createIllustrationJobMapping({
      id: randomUUID(),
      draftId,
      blockId: scene.id,
      aiJobId: jobId,
      status: 'queued',
    });

    await enqueueStoryboardOpenAIImage({
      jobId,
      userId,
      draftId,
      kind: 'scene',
      blockId: scene.id,
      prompt,
      referenceFileIds: [],
      size,
    });

    enqueued++;
  }
  return enqueued;
}

// ── triggerPhase ──────────────────────────────────────────────────────────────

/**
 * Trigger (or re-trigger) a pipeline phase, enforcing guards and performing
 * incremental enqueue of non-terminal units (ADR-0008).
 *
 * Check order:
 *   ownership → scenes-required (AC-15, before order) → phase-order (AC-08) →
 *   run-claim CAS → incremental enqueue.
 */
export async function triggerPhase(params: TriggerPhaseParams): Promise<TriggerPhaseResult> {
  const { draftId, userId, phase } = params;

  // 1. Authorization — must be first (AC-13).
  await assertDraftOwner(draftId, userId);

  // 2. Load the pipeline state.
  let row = await getPipelineByDraftId(draftId);
  if (row === null) {
    throw new NotFoundError(`Draft not found`);
  }

  // 3. Scenes-required guard (AC-15) — BEFORE phase-order so the Creator gets the
  //    specific "generate scenes first" message rather than the generic order message.
  const sceneCount = await countSceneBlocks(draftId);
  const scenesResult = checkScenesRequired(phase, sceneCount > 0);
  if (!scenesResult.ok) {
    throw new ScenesRequiredError(scenesResult.message);
  }

  // 4. Phase-order guard (AC-08).
  const orderResult = checkPhaseOrder(phaseStatuses(row), phase);
  if (!orderResult.ok) {
    throw new PhaseOutOfOrderError(orderResult.message);
  }

  // 5. Idempotency / already-running (AC-14): if the same phase is already in flight,
  //    return the existing run without re-enqueueing.
  const decision = decideRunClaim({
    activeRunPhase: row.activeRunPhase,
    version: row.version,
    target: phase,
  });
  if (decision.kind === 'return_existing') {
    return row;
  }
  if (decision.kind === 'conflict') {
    // A different phase holds the active run — return the existing state.
    return row;
  }

  // 6. Claim the run via the active_run_phase CAS (ADR-0007).
  //    For scene_image in awaiting_review, claimRun transitions it to running.
  //    For all other legal states (idle/cancelled/failed/skipped), same.
  const affected = await claimRun({
    draftId,
    phase,
    currentVersion: row.version,
  });
  if (affected === 0) {
    // Lost the CAS race — return the current state (concurrent trigger won).
    const fresh = await getPipelineByDraftId(draftId);
    return fresh!;
  }

  // Re-read after the claim so we have the updated version for subsequent CAS calls.
  row = (await getPipelineByDraftId(draftId))!;

  // 7. Incremental enqueue (AC-06, ADR-0008): only non-terminal units.
  let enqueuedCount = 0;
  if (phase === 'reference_image') {
    enqueuedCount = await enqueueNonTerminalReferenceBlocks(draftId, userId);
  } else if (phase === 'scene_image') {
    enqueuedCount = await enqueueNonTerminalSceneIllustrations(draftId, userId);
  }
  // For 'scene' and 'reference_data', the worker enqueues sub-jobs from the queue
  // job itself (enqueue-storyboard-plan / cast-extraction); no per-unit enqueue here.

  // 8. All-done short-circuit (Flow 3 `else`): if every unit was already terminal,
  //    advance directly to 'completed' without having enqueued anything.
  if (enqueuedCount === 0 && (phase === 'reference_image' || phase === 'scene_image')) {
    await casUpdateState({
      draftId,
      currentVersion: row.version,
      phase,
      status: 'completed',
      activeRunPhase: null,
    });
    const completed = await getPipelineByDraftId(draftId);
    return completed!;
  }

  // 9. Return the running state.
  return row;
}
