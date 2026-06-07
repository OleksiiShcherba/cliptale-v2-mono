/**
 * ai-generate.referenceWindow.ts — Rolling-window completion-hook (T7).
 *
 * Called by ai-generate.job.ts after every terminal outcome (success or failure)
 * of a reference-block's first-generation job. Implements the DB-state rolling-
 * window (ADR-0003): atomically marks the block done/failed and claims + enqueues
 * the next pending block in cast order.
 */

import type { OkPacket } from 'mysql2';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Queue } from 'bullmq';

import { publishReferenceBlockStatus } from '@/lib/realtime.js';

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
  model_id:   string;
  name:       string;
};

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
  const { blockId, draftId, outcome, errorMessage } = params;
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

  // Publish realtime status for the completed block.
  await publishReferenceBlockStatus({ pool, blockId });

  // Step 2: Atomically claim the next pending block in cast order.
  const [pendingRows] = await pool.execute(
    `SELECT srb.id, srb.draft_id, srb.flow_id, srb.sort_order,
            gd.user_id,
            gf.model_id,
            srb.name
       FROM storyboard_reference_blocks srb
       JOIN generation_drafts gd ON gd.id = srb.draft_id
       JOIN generation_flows gf ON gf.flow_id = srb.flow_id
      WHERE srb.draft_id = ?
        AND srb.window_status = 'pending'
      ORDER BY srb.sort_order ASC
      LIMIT 1`,
    [draftId],
  );

  const rows = pendingRows as NextPendingRow[];
  if (rows.length === 0) {
    return; // No more pending blocks — window is complete.
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

  // Step 3: Enqueue the generation for the claimed block.
  await aiGenerateQueue.add('ai-generate', {
    draftId: next.draft_id,
    blockId: next.id,
    flowId:  next.flow_id,
    userId:  next.user_id,
    modelId: next.model_id,
  });
}
