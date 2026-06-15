/**
 * ai-generate.referenceWindow.ts — Rolling-window completion-hook (T7).
 *
 * Called by ai-generate.job.ts after every terminal outcome (success or failure)
 * of a reference-block's first-generation job. Implements the DB-state rolling-
 * window (ADR-0003): atomically marks the block done/failed and claims + enqueues
 * the next pending block in cast order.
 */

import { randomUUID } from 'node:crypto';

import type { OkPacket } from 'mysql2';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Queue } from 'bullmq';

import { publishReferenceBlockStatus } from '@/lib/realtime.js';
import { onReferenceImagesAllTerminal } from './storyboardPipelineHooks.js';

export type ReferenceWindowHookParams = {
  jobId:        string;
  blockId:      string;
  draftId:      string;
  outcome:      'success' | 'failure';
  errorMessage?: string;
};

export type ReferenceWindowHookDeps = {
  pool:             Pool;
  aiGenerateQueue:  Queue;
};

type NextPendingRow = RowDataPacket & {
  id:         string;
  draft_id:   string;
  flow_id:    string;
  sort_order: number;
  user_id:    string;
  name:       string;
};

type CurrentJobRow = RowDataPacket & {
  model_id:   string;
  capability: string;
  prompt:     string;
  options:    string | null;
};

// Default generation params for reference blocks — mirrors storyboardReference.confirm.service.ts.
// Used as fallback when the current job row cannot be found (e.g. in unit tests).
const REF_DEFAULT_MODEL_ID   = 'openai/gpt-image-2';
const REF_DEFAULT_CAPABILITY = 'text_to_image';
const REF_DEFAULT_PROVIDER   = 'fal';
const REF_DEFAULT_OPTIONS    = {
  image_size: 'square_hd',
  num_images: 1,
  output_format: 'png',
  sync_mode: false,
};

/**
 * Finds the canvas generation block of a flow (reference flows seed exactly one).
 * Returns null when the flow/canvas has none — the job is then inserted without a
 * block binding, as before.
 */
async function findCanvasGenerationBlockId(pool: Pool, flowId: string): Promise<string | null> {
  const [rows] = await pool.execute(
    `SELECT canvas FROM generation_flows WHERE flow_id = ? LIMIT 1`,
    [flowId],
  );
  const raw = ((rows ?? []) as Array<{ canvas: unknown }>)[0]?.canvas;
  if (!raw) return null;
  try {
    const canvas = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const blocks: Array<{ blockId?: string; type?: string }> = Array.isArray(
      (canvas as { blocks?: unknown })?.blocks,
    )
      ? (canvas as { blocks: Array<{ blockId?: string; type?: string }> }).blocks
      : [];
    return blocks.find((b) => b.type === 'generation')?.blockId ?? null;
  } catch {
    return null;
  }
}

/**
 * Completion-hook for the rolling-window (ADR-0003, AC-03, AC-04).
 *
 * On success: marks `window_status='done'`, then atomically claims the next
 * `pending` block (ORDER BY sort_order) and enqueues its generation.
 *
 * On failure: marks `window_status='failed'` + `error_message`, then STILL
 * claims + enqueues the next pending (AC-04: failure does not stop the window).
 *
 * Idempotent: if the guarded UPDATE affects 0 rows (block already terminal),
 * the hook exits without claiming or enqueuing.
 */
export async function onReferenceBlockJobComplete(
  params: ReferenceWindowHookParams,
  deps: ReferenceWindowHookDeps,
): Promise<void> {
  const { jobId, blockId, draftId, outcome, errorMessage } = params;
  const { pool, aiGenerateQueue } = deps;

  // Step 1: Mark the completed block done or failed (idempotency guard).
  // The WHERE clause restricts to window_status='running' so a redelivery
  // (block already 'done'/'failed') returns affectedRows=0 and we stop.
  let updateResult: OkPacket;
  if (outcome === 'success') {
    const [result] = await pool.execute(
      `UPDATE storyboard_reference_blocks
          SET window_status = 'done',
              error_message = NULL
        WHERE id = ?
          AND window_status = 'running'`,
      [blockId],
    );
    updateResult = result as OkPacket;
  } else {
    const [result] = await pool.execute(
      `UPDATE storyboard_reference_blocks
          SET window_status = 'failed',
              error_message = ?
        WHERE id = ?
          AND window_status = 'running'`,
      [errorMessage ?? null, blockId],
    );
    updateResult = result as OkPacket;
  }

  // Idempotency: if 0 rows affected, the block was already terminal — stop.
  if (updateResult.affectedRows === 0) {
    return;
  }

  // Auto-star the first generation's output as the block's primary preview
  // (only when the block has no stars yet). Without this, a done block renders
  // empty until the Creator opens the flow and stars a result by hand.
  if (outcome === 'success') {
    const [outRows] = await pool.execute(
      `SELECT output_file_id FROM ai_generation_jobs WHERE job_id = ? LIMIT 1`,
      [jobId],
    );
    const outputFileId = ((outRows ?? []) as Array<{ output_file_id: string | null }>)[0]
      ?.output_file_id;
    if (outputFileId) {
      await pool.execute(
        `INSERT INTO storyboard_reference_stars (id, reference_block_id, file_id, is_primary)
         SELECT ?, ?, ?, 1
          WHERE NOT EXISTS (
            SELECT 1 FROM storyboard_reference_stars WHERE reference_block_id = ?
          )`,
        [randomUUID(), blockId, outputFileId, blockId],
      );
    }
  }

  // Publish realtime status for the completed block.
  await publishReferenceBlockStatus({ pool, blockId });

  // Step 2: Atomically claim the next pending block in cast order.
  // user_id is sourced from generation_drafts (the flow has no model column).
  const [pendingRows] = await pool.execute(
    `SELECT srb.id, srb.draft_id, srb.flow_id, srb.sort_order,
            gd.user_id,
            srb.name
       FROM storyboard_reference_blocks srb
       JOIN generation_drafts gd ON gd.id = srb.draft_id
      WHERE srb.draft_id = ?
        AND srb.window_status = 'pending'
      ORDER BY srb.sort_order ASC
      LIMIT 1`,
    [draftId],
  );

  const rows = (pendingRows ?? []) as NextPendingRow[];
  if (rows.length === 0) {
    // No more pending blocks — the rolling window is complete. T10 completion-hook
    // (ADR-0003, AC-03): when EVERY reference block is terminal (done/failed — a
    // failed reference is still terminal, failure-tolerant), advance reference_image
    // → completed and present the scene-image offer (scene_image → awaiting_review)
    // via the shared transition module. Best-effort: a hook failure must not fail the
    // generation job. (A running/pending block elsewhere → the hook self-guards and
    // no-ops.)
    try {
      await onReferenceImagesAllTerminal({ pool, draftId });
    } catch (hookError) {
      console.error('[referenceWindow] pipeline advance hook failed:', hookError);
    }
    return;
  }

  const next = rows[0]!;

  // Claim the block (set running). Another concurrent completion may race
  // here; only one will update 1 row.
  const [claimResult] = await pool.execute(
    `UPDATE storyboard_reference_blocks
        SET window_status = 'running'
      WHERE id = ?
        AND window_status = 'pending'`,
    [next.id],
  );

  const claimed = claimResult as OkPacket;
  if (claimed.affectedRows === 0) {
    return; // Already claimed by a concurrent completion.
  }

  // Step 3: Fetch the current (completed) job's generation params so the next
  // block reuses the same model/capability/options as the window was started with.
  const [jobRows] = await pool.execute(
    `SELECT model_id, capability, prompt, options
       FROM ai_generation_jobs
      WHERE job_id = ?
      LIMIT 1`,
    [jobId],
  );
  const jobRow = ((jobRows ?? []) as CurrentJobRow[])[0];

  const modelId    = jobRow?.model_id   ?? REF_DEFAULT_MODEL_ID;
  const capability = jobRow?.capability ?? REF_DEFAULT_CAPABILITY;
  const provider   = REF_DEFAULT_PROVIDER; // not stored in DB; reference flows always use fal
  const prompt     = jobRow?.prompt     ?? next.name;
  const parsedOpts = jobRow?.options
    ? (typeof jobRow.options === 'string' ? JSON.parse(jobRow.options) : jobRow.options)
    : { ...REF_DEFAULT_OPTIONS, prompt: next.name };

  // Step 4: Create the ai_generation_jobs row for the next block's run.
  // This lets the worker call setJobStatus / setOutputFile by the new jobId.
  // block_id binds the run to the flow canvas' generation block so the flow's
  // result block resolves this run's output as its preview.
  const nextGenBlockId = await findCanvasGenerationBlockId(pool, next.flow_id);
  const nextJobId = randomUUID();
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, flow_id, block_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nextJobId,
      next.user_id,
      modelId,
      capability,
      prompt,
      JSON.stringify(parsedOpts),
      next.flow_id,
      nextGenBlockId,
    ],
  );

  // Step 5: Link first_job_id on the next block (ADR-0003 rolling-window correlation).
  await pool.execute(
    `UPDATE storyboard_reference_blocks SET first_job_id = ? WHERE id = ?`,
    [nextJobId, next.id],
  );

  // Step 6: Enqueue the generation for the claimed block with the full
  // worker-consumable payload (events.md §70-76: jobId, userId, modelId,
  // capability, provider, prompt, options). draftId is included so the
  // worker can correlate the job back to its reference block without an
  // extra DB round-trip.
  await aiGenerateQueue.add('ai-generate', {
    jobId:      nextJobId,
    userId:     next.user_id,
    modelId,
    capability,
    provider,
    prompt,
    options:    parsedOpts,
    draftId:    next.draft_id,
    flowId:     next.flow_id,
    blockId:    next.id,
  });
}
