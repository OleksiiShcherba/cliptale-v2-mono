/**
 * Confirm-cast service: T6 — storyboard-reference-flows.
 *
 * ACs: AC-03 (confirm creates K blocks + K flows + K pending rows, enqueues
 *      min(N, K) jobs), AC-13 (non-owner denied without revealing contents).
 *
 * Design:
 *   - Owner check via generation_drafts.user_id (NotFoundError hides existence).
 *   - Single DB transaction: K blocks + K flows + scene-link rows; atomicity
 *     means a FK violation rolls back everything.
 *   - Canvas pre-fill: content blocks for each imageFileId, or a text block
 *     for description if no images (AC-03: flows are pre-filled).
 *   - After commit: enqueue min(concurrencyLimit, K) ai-generate jobs.
 *     Each dispatch:
 *       1. INSERT ai_generation_jobs (status='queued', default reference model).
 *       2. UPDATE block.first_job_id (ADR-0003 rolling-window correlation).
 *       3. Queue.add with full worker-consumable payload.
 *   - No billing call — payment per-run is the worker's responsibility (ADR-0004).
 */

import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';
import { aiGenerateQueue } from '@/queues/bullmq.js';
import { DEFAULT_CONCURRENCY_LIMIT } from '@/services/settings.service.js';
import * as settingsRepository from '@/repositories/settings.repository.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default model used for the auto-started first reference generation.
 * Mirrors the storyboard illustration default (storyboardIllustration.config.ts).
 */
export const REFERENCE_DEFAULT_MODEL_ID = 'openai/gpt-image-2';
export const REFERENCE_DEFAULT_CAPABILITY = 'text_to_image' as const;
export const REFERENCE_DEFAULT_PROVIDER = 'fal' as const;

// ── Types ─────────────────────────────────────────────────────────────────────

/** One entry in the adjusted cast provided by the Creator at confirm time. */
export type CastEntry = {
  castType: 'character' | 'environment';
  name: string;
  description?: string;
  imageFileIds?: string[];
  sceneBlockIds?: string[];
};

/** Input for confirmCast. */
export type ConfirmCastParams = {
  draftId: string;
  userId: string;
  entries: CastEntry[];
  /**
   * Aggregate credits the Creator acknowledged at confirm time.
   * Stored for audit; not charged here (ADR-0004 — charge per-run in worker).
   */
  acknowledgedAggregateCredits: number;
};

/** Per-block result returned by confirmCast. */
export type ConfirmedBlock = {
  blockId: string;
  draftId: string;
  flowId: string;
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  sortOrder: number;
  positionX: number;
  positionY: number;
  /** 'pending' on creation; the dispatched min(N,K) are claimed to 'running' (F2). */
  windowStatus: 'pending' | 'running';
  errorMessage: string | null;
  version: number;
  /** Scene-block UUIDs from the confirm request, echoed back (no second DB read needed). */
  sceneBlockIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type DraftRow = RowDataPacket & { user_id: string };

/** Verify the draft exists and is owned by userId; throws NotFoundError otherwise. */
async function assertDraftOwner(
  conn: PoolConnection,
  draftId: string,
  userId: string,
): Promise<void> {
  const [rows] = await conn.execute<DraftRow[]>(
    `SELECT user_id FROM generation_drafts WHERE id = ? LIMIT 1`,
    [draftId],
  );
  if (!rows.length || rows[0]!.user_id !== userId) {
    throw new NotFoundError(`Draft not found`);
  }
}

/** Read concurrencyLimit from user_settings (default 4 when absent). */
async function getConcurrencyLimit(userId: string): Promise<number> {
  const record = await settingsRepository.getByUserId(userId);
  if (!record) return DEFAULT_CONCURRENCY_LIMIT;
  const blob = record.settings;
  if (typeof blob === 'object' && blob !== null) {
    const v = (blob as Record<string, unknown>)['concurrencyLimit'];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12) {
      return v;
    }
  }
  return DEFAULT_CONCURRENCY_LIMIT;
}

/**
 * Builds the initial canvas for a reference flow.
 *
 * Pre-fills with a content block per assigned image (if any), or a single text
 * content block with the description (if no images), so the Creator sees the
 * reference material immediately on opening the flow (AC-03).
 *
 * Returns a JSON-serialisable FlowCanvas-shaped object.
 *
 * Seeds the FULL visible chain — content → generation → result — not just the
 * content material. The auto-started first run carries `block_id = genBlockId`,
 * and the result block (no per-run jobId) falls back to the latest job of its
 * source generation block, so opening the flow shows the generated output
 * instead of an empty canvas.
 */
function buildReferenceCanvas(entry: CastEntry): {
  canvas: { blocks: unknown[]; edges: unknown[] };
  genBlockId: string;
} {
  const blocks: unknown[] = [];
  const edges: unknown[] = [];
  const imageFileIds = entry.imageFileIds ?? [];
  const contentIds: string[] = [];

  // Content params mirror the interactive addContentBlock shape — contentType +
  // modality are REQUIRED for the Inspector to offer the right editor (a bare
  // { text } falls through to the image/asset picker).
  if (imageFileIds.length > 0) {
    for (let idx = 0; idx < imageFileIds.length; idx++) {
      const contentId = randomUUID();
      contentIds.push(contentId);
      blocks.push({
        blockId: contentId,
        type: 'content',
        position: { x: 0, y: idx * 220 },
        params: { contentType: 'asset', fileId: imageFileIds[idx], modality: 'image' },
      });
    }
  } else if (entry.description) {
    const contentId = randomUUID();
    contentIds.push(contentId);
    blocks.push({
      blockId: contentId,
      type: 'content',
      position: { x: 0, y: 0 },
      params: { contentType: 'text', text: entry.description, modality: 'text' },
    });
  }

  // Generation block — the auto-run binds to it via ai_generation_jobs.block_id.
  const genBlockId = randomUUID();
  blocks.push({
    blockId: genBlockId,
    type: 'generation',
    position: { x: 340, y: 0 },
    params: { modelId: REFERENCE_DEFAULT_MODEL_ID },
  });
  for (const contentId of contentIds) {
    edges.push({
      edgeId: randomUUID(),
      sourceBlockId: contentId,
      sourceHandle: 'out',
      targetBlockId: genBlockId,
      targetHandle: 'prompt',
    });
  }

  // Result block (legacy binding: no jobId) — shows the LATEST run of the
  // generation block, which is exactly the auto-started first generation.
  const resultBlockId = randomUUID();
  blocks.push({
    blockId: resultBlockId,
    type: 'result',
    position: { x: 680, y: 0 },
    params: { sourceBlockId: genBlockId },
  });
  edges.push({
    edgeId: randomUUID(),
    sourceBlockId: genBlockId,
    sourceHandle: 'out',
    targetBlockId: resultBlockId,
    targetHandle: 'in',
  });

  return { canvas: { blocks, edges }, genBlockId };
}

/**
 * Derives the generation prompt for the auto-started first run.
 *
 * Uses the description when available, otherwise the entry name.
 */
function buildReferencePrompt(entry: CastEntry): string {
  return entry.description?.trim() || entry.name;
}

/**
 * Builds the options payload for the default reference generation job.
 * Uses the entry description or name as the image prompt.
 */
function buildReferenceOptions(entry: CastEntry): Record<string, unknown> {
  return {
    prompt: buildReferencePrompt(entry),
    image_size: 'square_hd',
    num_images: 1,
    output_format: 'png',
    sync_mode: false,
  };
}

// ── confirmCast ───────────────────────────────────────────────────────────────

/**
 * Transactionally creates K reference blocks, K generation flows (pre-filled),
 * K pending window rows and the requested scene links, then enqueues
 * min(concurrencyLimit, K) ai-generate jobs.
 *
 * For each dispatched job:
 *   1. Inserts an ai_generation_jobs row (status='queued', default reference model).
 *   2. Updates block.first_job_id for ADR-0003 rolling-window correlation.
 *   3. Enqueues the BullMQ job with a full worker-consumable payload.
 *
 * Throws NotFoundError when the draft does not exist or belongs to another user.
 */
export async function confirmCast(params: ConfirmCastParams): Promise<ConfirmedBlock[]> {
  const { draftId, userId, entries } = params;

  const concurrencyLimit = await getConcurrencyLimit(userId);

  const conn = await pool.getConnection();
  const confirmed: ConfirmedBlock[] = [];
  // Canvas generation-block id per flow — the dispatched job's block_id binds to it.
  const genBlockIdByFlow = new Map<string, string>();

  try {
    await conn.beginTransaction();

    // Owner guard — existence-hiding (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // F12: validate every client-supplied imageFileId belongs to the caller
    // before embedding it into the new flow canvas. Zod only validates UUID shape;
    // without this a foreign/cross-tenant file could be baked into the canvas.
    const allImageFileIds = [...new Set(entries.flatMap((e) => e.imageFileIds ?? []))];
    if (allImageFileIds.length) {
      const ph = allImageFileIds.map(() => '?').join(',');
      const [fileRows] = await conn.execute<RowDataPacket[]>(
        `SELECT file_id FROM files
          WHERE file_id IN (${ph}) AND user_id = ? AND deleted_at IS NULL`,
        [...allImageFileIds, userId],
      );
      const owned = new Set(fileRows.map((r) => (r as { file_id: string }).file_id));
      const foreign = allImageFileIds.find((id) => !owned.has(id));
      if (foreign) {
        // Existence-hiding: never reveal whether the file exists for another user.
        throw new NotFoundError(`File not found`);
      }
    }

    // Insert K flows + K blocks inside the transaction.
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const blockId = randomUUID();
      const flowId = randomUUID();

      // 1. Create the generation_flow row pre-filled with entry's reference material
      //    (full content → generation → result chain; the run binds to genBlockId).
      const { canvas, genBlockId } = buildReferenceCanvas(entry);
      genBlockIdByFlow.set(flowId, genBlockId);
      await conn.execute(
        `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
         VALUES (?, ?, ?, ?)`,
        [
          flowId,
          userId,
          entry.name,
          JSON.stringify(canvas),
        ],
      );

      // 2. Create the reference block linked to the flow, window_status='pending'.
      //    first_job_id is populated after the transaction commits when the job row is inserted.
      await conn.execute(
        `INSERT INTO storyboard_reference_blocks
           (id, draft_id, flow_id, cast_type, name, description, sort_order, window_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          blockId,
          draftId,
          flowId,
          entry.castType,
          entry.name,
          entry.description ?? null,
          i,
        ],
      );

      // 3. Insert scene links (FK → storyboard_blocks; bad id causes rollback).
      for (const sceneBlockId of entry.sceneBlockIds ?? []) {
        await conn.execute(
          `INSERT INTO storyboard_reference_scene_links
             (reference_block_id, scene_block_id)
           VALUES (?, ?)`,
          [blockId, sceneBlockId],
        );
      }

      confirmed.push({
        blockId,
        draftId,
        flowId,
        castType: entry.castType,
        name: entry.name,
        description: entry.description ?? null,
        sortOrder: i,
        positionX: 0,
        positionY: 0,
        windowStatus: 'pending',
        errorMessage: null,
        version: 1,
        sceneBlockIds: entry.sceneBlockIds ?? [],
        // Timestamps are populated from the DB fetch-back below.
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Fetch back DB-generated timestamps for all confirmed blocks in one query.
  if (confirmed.length > 0) {
    const placeholders = confirmed.map(() => '?').join(',');
    const ids = confirmed.map((b) => b.blockId);
    const [tsRows] = await pool.execute<
      RowDataPacket[] & { id: string; created_at: Date; updated_at: Date }[]
    >(
      `SELECT id, created_at, updated_at
         FROM storyboard_reference_blocks
        WHERE id IN (${placeholders})`,
      ids,
    );
    const tsMap = new Map(
      (tsRows as unknown as { id: string; created_at: Date; updated_at: Date }[]).map(
        (r) => [r.id, { createdAt: r.created_at, updatedAt: r.updated_at }],
      ),
    );
    for (const block of confirmed) {
      const ts = tsMap.get(block.blockId);
      if (ts) {
        block.createdAt = ts.createdAt;
        block.updatedAt = ts.updatedAt;
      }
    }
  }

  // Enqueue min(N, K) jobs AFTER the transaction has committed.
  // For each dispatched block: create the ai_generation_jobs row, write back
  // first_job_id, then enqueue the BullMQ job with a worker-consumable payload.
  const toDispatch = Math.min(concurrencyLimit, confirmed.length);
  for (let i = 0; i < toDispatch; i++) {
    const block = confirmed[i]!;
    const entry = entries[i]!;
    const jobId = randomUUID();
    const prompt = buildReferencePrompt(entry);
    const options = buildReferenceOptions(entry);

    // 1. Insert the ai_generation_jobs row so the worker can call setJobStatus('processing').
    //    block_id binds the run to the canvas generation block — the flow's result
    //    block resolves its preview via the latest job of that block.
    await pool.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, flow_id, block_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        userId,
        REFERENCE_DEFAULT_MODEL_ID,
        REFERENCE_DEFAULT_CAPABILITY,
        prompt,
        JSON.stringify(options),
        block.flowId,
        genBlockIdByFlow.get(block.flowId) ?? null,
      ],
    );

    // 2. Link first_job_id and claim the block to 'running' (F2). The block was
    //    created 'pending'; claiming it at enqueue time mirrors the completion
    //    hook's claim of the next block, so the hook's terminal UPDATE
    //    (guarded WHERE window_status='running') matches and the window advances.
    await pool.execute(
      `UPDATE storyboard_reference_blocks
          SET first_job_id = ?, window_status = 'running'
        WHERE id = ?`,
      [jobId, block.blockId],
    );
    block.windowStatus = 'running';

    // 3. Enqueue the BullMQ job with the full worker-consumable payload.
    await aiGenerateQueue.add('ai-generate', {
      jobId,
      userId,
      modelId: REFERENCE_DEFAULT_MODEL_ID,
      capability: REFERENCE_DEFAULT_CAPABILITY,
      provider: REFERENCE_DEFAULT_PROVIDER,
      prompt,
      options,
    });
  }

  return confirmed;
}
