/**
 * storyboardReference.blocks.service.ts — T8
 *
 * Block lifecycle service for storyboard-reference-flows:
 *   - createBlock  (AC-11, AC-13)
 *   - deleteBlock  (AC-14, AC-13)
 *   - retryBlock   (AC-04, AC-13)
 *   - saveSceneLinks (AC-10, AC-13)
 */

import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  SceneNotInDraftError,
} from '@/lib/errors.js';
import { checkFlowRateLimit } from '@/lib/flow-rate-limit.js';
import { aiGenerateQueue } from '@/queues/bullmq.js';
import {
  REFERENCE_DEFAULT_MODEL_ID,
  REFERENCE_DEFAULT_CAPABILITY,
  REFERENCE_DEFAULT_PROVIDER,
} from '@/services/storyboardReference.confirm.service.js';

// ── Types (public surface, derived from data-model.md + openapi.yaml) ─────────

export type ListBlocksParams = {
  userId: string;
  draftId: string;
};

export type UpdateBlockParams = {
  blockId: string;
  draftId: string;
  userId: string;
  positionX: number;
  positionY: number;
};

export type CreateBlockParams = {
  draftId: string;
  userId: string;
  castType: 'character' | 'environment';
  name: string;
  description?: string;
};

export type BlockStarEntry = {
  fileId: string;
  isPrimary: boolean;
  createdAt: string;
};

export type BlockResult = {
  id: string;
  draftId: string;
  flowId: string | null;
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  sortOrder: number;
  positionX: number;
  positionY: number;
  windowStatus: 'pending' | 'running' | 'done' | 'failed' | null;
  errorMessage: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /** Curated stars; populated by listBlocks for canvas reload (F1). */
  stars?: BlockStarEntry[];
  /** The primary star's file_id, or null; populated by listBlocks (F1). */
  previewFileId?: string | null;
  /** Linked scene block ids; populated by listBlocks (F1). */
  sceneBlockIds?: string[];
};

export type DeleteBlockParams = {
  blockId: string;
  draftId: string;
  userId: string;
};

export type RetryBlockParams = {
  blockId: string;
  draftId: string;
  userId: string;
};

export type SaveSceneLinksParams = {
  blockId: string;
  draftId: string;
  userId: string;
  sceneBlockIds: string[];
  /** The client's known block version (compare-and-set guard). */
  version: number;
};

export type SaveSceneLinksResult = {
  sceneBlockIds: string[];
  /** Incremented version after a successful save. */
  version: number;
};

// ── Internal row types ─────────────────────────────────────────────────────────

type DraftRow = RowDataPacket & { user_id: string };

type BlockRow = RowDataPacket & {
  id: string;
  draft_id: string;
  flow_id: string | null;
  cast_type: 'character' | 'environment';
  name: string;
  description: string | null;
  sort_order: number;
  position_x: number;
  position_y: number;
  window_status: 'pending' | 'running' | 'done' | 'failed' | null;
  error_message: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/**
 * Fetch the block and verify it belongs to the given draft (which is owned by userId).
 * Throws NotFoundError if the block doesn't exist or doesn't belong to the draft.
 * Caller must have already verified draft ownership.
 */
async function fetchBlockForDraft(
  conn: PoolConnection,
  blockId: string,
  draftId: string,
): Promise<BlockRow> {
  const [rows] = await conn.execute<BlockRow[]>(
    `SELECT id, draft_id, flow_id, cast_type, name, description,
            sort_order, position_x, position_y, window_status,
            error_message, version, created_at, updated_at
       FROM storyboard_reference_blocks
      WHERE id = ? AND draft_id = ?
      LIMIT 1`,
    [blockId, draftId],
  );
  if (!rows.length) {
    throw new NotFoundError(`Block not found`);
  }
  return rows[0]!;
}

function rowToBlockResult(row: BlockRow): BlockResult {
  return {
    id: row.id,
    draftId: row.draft_id,
    flowId: row.flow_id,
    castType: row.cast_type,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    positionX: row.position_x,
    positionY: row.position_y,
    windowStatus: row.window_status,
    errorMessage: row.error_message,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * List all reference blocks for a draft owned by userId (AC-11, AC-13).
 * Non-owner → NotFoundError (existence hiding).
 */
export async function listBlocks(userId: string, draftId: string): Promise<BlockResult[]> {
  const conn = await pool.getConnection();
  try {
    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    const [rows] = await conn.execute<BlockRow[]>(
      `SELECT id, draft_id, flow_id, cast_type, name, description,
              sort_order, position_x, position_y, window_status,
              error_message, version, created_at, updated_at
         FROM storyboard_reference_blocks
        WHERE draft_id = ?
        ORDER BY sort_order ASC, created_at ASC`,
      [draftId],
    );

    const enrichment = await enrichBlocks(conn, rows.map((r) => r.id));

    return rows.map((row) => {
      const base = rowToBlockResult(row);
      const e = enrichment.get(row.id);
      return {
        ...base,
        stars: e?.stars ?? [],
        previewFileId: e?.previewFileId ?? null,
        sceneBlockIds: e?.sceneBlockIds ?? [],
      };
    });
  } finally {
    conn.release();
  }
}

type StarEnrichRow = RowDataPacket & {
  reference_block_id: string;
  file_id: string;
  is_primary: number | null;
  created_at: Date | string;
};

type SceneLinkEnrichRow = RowDataPacket & {
  reference_block_id: string;
  scene_block_id: string;
};

type BlockEnrichment = {
  stars: BlockStarEntry[];
  previewFileId: string | null;
  sceneBlockIds: string[];
};

/**
 * Batch-load stars (with primary preview) and linked scene ids for a set of
 * blocks in two queries (F1). Without this, canvas reload loses the primary-star
 * preview and the visible linked-scene list.
 */
async function enrichBlocks(
  conn: PoolConnection,
  blockIds: string[],
): Promise<Map<string, BlockEnrichment>> {
  const result = new Map<string, BlockEnrichment>();
  if (!blockIds.length) return result;
  for (const id of blockIds) {
    result.set(id, { stars: [], previewFileId: null, sceneBlockIds: [] });
  }

  const ph = blockIds.map(() => '?').join(',');

  const [starRows] = await conn.execute<StarEnrichRow[]>(
    `SELECT reference_block_id, file_id, is_primary, created_at
       FROM storyboard_reference_stars
      WHERE reference_block_id IN (${ph})
      ORDER BY created_at ASC`,
    blockIds,
  );
  for (const s of starRows) {
    const entry = result.get(s.reference_block_id)!;
    const isPrimary = s.is_primary === 1;
    entry.stars.push({
      fileId: s.file_id,
      isPrimary,
      createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
    });
    if (isPrimary) entry.previewFileId = s.file_id;
  }

  const [linkRows] = await conn.execute<SceneLinkEnrichRow[]>(
    `SELECT reference_block_id, scene_block_id
       FROM storyboard_reference_scene_links
      WHERE reference_block_id IN (${ph})`,
    blockIds,
  );
  for (const l of linkRows) {
    result.get(l.reference_block_id)!.sceneBlockIds.push(l.scene_block_id);
  }

  return result;
}

/**
 * Update block XY position (PATCH, versionless, commutative — ADR-0005, AC-14).
 * Non-owner → NotFoundError (AC-13).
 */
export async function updateBlock(params: UpdateBlockParams): Promise<BlockResult> {
  const { blockId, draftId, userId, positionX, positionY } = params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // Existence guard.
    await fetchBlockForDraft(conn, blockId, draftId);

    await conn.execute(
      `UPDATE storyboard_reference_blocks
          SET position_x = ?, position_y = ?
        WHERE id = ? AND draft_id = ?`,
      [positionX, positionY, blockId, draftId],
    );

    await conn.commit();

    const block = await fetchBlockForDraft(conn, blockId, draftId);
    return rowToBlockResult(block);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Manually add a reference block with an empty linked flow.
 * No generation is started and nothing is charged (AC-11).
 * Non-owner → NotFoundError (AC-13).
 * NOT capped by cast size limit (AC-11).
 */
export async function createBlock(params: CreateBlockParams): Promise<BlockResult> {
  const { draftId, userId, castType, name, description } = params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Owner guard — existence-hiding (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // Bound manual creation by the existing per-user creation rate limit
    // (AC-11, SAD Flow 8). Creating a block creates an empty linked flow, so it
    // consumes a flow-creation slot; over the cap → 429, before any write.
    const rate = await checkFlowRateLimit(userId);
    if (!rate.allowed) {
      throw new RateLimitedError(
        'Creation rate limit exceeded; please retry shortly.',
        rate.retryAfterSeconds,
      );
    }

    const blockId = randomUUID();
    const flowId = randomUUID();

    // Determine next sort_order (after the current max).
    const [sortRows] = await conn.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
         FROM storyboard_reference_blocks
        WHERE draft_id = ?`,
      [draftId],
    );
    const maxSort = (sortRows[0]!['max_sort'] as number) ?? -1;
    const sortOrder = maxSort + 1;

    // Create empty generation_flow (linked flow, no nodes, no generation).
    await conn.execute(
      `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
       VALUES (?, ?, ?, ?)`,
      [flowId, userId, name, JSON.stringify({ blocks: [], edges: [] })],
    );

    // Create the reference block; window_status = NULL (AC-11: manually added, no auto-dispatch).
    await conn.execute(
      `INSERT INTO storyboard_reference_blocks
         (id, draft_id, flow_id, cast_type, name, description, sort_order, window_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [blockId, draftId, flowId, castType, name, description ?? null, sortOrder],
    );

    await conn.commit();

    // Fetch back the newly created block to return consistent data.
    const [blockRows] = await conn.execute<BlockRow[]>(
      `SELECT id, draft_id, flow_id, cast_type, name, description,
              sort_order, position_x, position_y, window_status,
              error_message, version, created_at, updated_at
         FROM storyboard_reference_blocks
        WHERE id = ?`,
      [blockId],
    );

    return rowToBlockResult(blockRows[0]!);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // No job enqueued — AC-11: no generation, no charge.
}

/**
 * Delete a reference block.
 * The linked flow and all its results survive (AC-14).
 * Scene links and stars are removed (cascade from FK ON DELETE CASCADE).
 * Non-owner → NotFoundError (AC-13).
 */
export async function deleteBlock(params: DeleteBlockParams): Promise<void> {
  const { blockId, draftId, userId } = params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // Verify block belongs to draft (existence hiding).
    await fetchBlockForDraft(conn, blockId, draftId);

    // Delete the block; FK ON DELETE CASCADE removes scene links and stars.
    // The linked flow survives (flow_id FK is ON DELETE SET NULL on the block side,
    // so deleting the block does NOT delete the flow — AC-14).
    await conn.execute(
      `DELETE FROM storyboard_reference_blocks WHERE id = ? AND draft_id = ?`,
      [blockId, draftId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Retry the first auto-started generation for a failed block (AC-04).
 * Re-queues the block (window_status → 'pending') and enqueues a job.
 * Block in done/pending/running state → ConflictError (AC-04 guard).
 * Non-owner → NotFoundError (AC-13).
 */
export async function retryBlock(params: RetryBlockParams): Promise<BlockResult> {
  const { blockId, draftId, userId } = params;

  const conn = await pool.getConnection();
  let flowId: string | null = null;
  let retryBlockData: BlockRow | null = null;

  try {
    await conn.beginTransaction();

    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // Fetch the block (existence hiding).
    const block = await fetchBlockForDraft(conn, blockId, draftId);

    if (block.window_status !== 'failed') {
      throw new ConflictError(
        `Block cannot be retried: current status is '${block.window_status ?? 'null'}' (expected 'failed')`,
      );
    }

    flowId = block.flow_id;
    retryBlockData = block;

    // Reset window_status to 'pending'.
    await conn.execute(
      `UPDATE storyboard_reference_blocks
          SET window_status = 'pending'
        WHERE id = ? AND draft_id = ?`,
      [blockId, draftId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Dispatch the retry job AFTER the transaction commits (ADR-0004).
  // Mirror confirmCast dispatch: insert ai_generation_jobs row, set first_job_id,
  // then enqueue with full worker-consumable payload (AC-04 / ADR-0003 / ADR-0004).
  {
    const jobId = randomUUID();
    // Build prompt and options from the block's name/description (same logic as confirmCast).
    const prompt = (retryBlockData!.description?.trim()) || retryBlockData!.name;
    const options: Record<string, unknown> = {
      prompt,
      image_size: 'square_hd',
      num_images: 1,
      output_format: 'png',
      sync_mode: false,
    };

    // 1. Insert the ai_generation_jobs row so the worker can call setJobStatus('processing').
    await pool.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, flow_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        userId,
        REFERENCE_DEFAULT_MODEL_ID,
        REFERENCE_DEFAULT_CAPABILITY,
        prompt,
        JSON.stringify(options),
        flowId,
      ],
    );

    // 2. Link first_job_id on the block (ADR-0003: rolling-window correlation).
    await pool.execute(
      `UPDATE storyboard_reference_blocks SET first_job_id = ? WHERE id = ?`,
      [jobId, blockId],
    );

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

  // Fetch updated block to return.
  const conn2 = await pool.getConnection();
  try {
    const block = await fetchBlockForDraft(conn2, blockId, draftId);
    return rowToBlockResult(block);
  } finally {
    conn2.release();
  }
}

/**
 * Replace the scene-link list for a block using compare-and-set on block version (AC-10).
 * Stale version → ConflictError (version_conflict, 409, reload prompt).
 * Non-owner → NotFoundError (AC-13).
 */
export async function saveSceneLinks(params: SaveSceneLinksParams): Promise<SaveSceneLinksResult> {
  const { blockId, draftId, userId, sceneBlockIds, version } = params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);

    // CAS update: atomically check-and-increment version.
    // If no rows are affected, version was stale (concurrent write won).
    const [updateResult] = await conn.execute<import('mysql2/promise').ResultSetHeader>(
      `UPDATE storyboard_reference_blocks
          SET version = version + 1
        WHERE id = ? AND draft_id = ? AND version = ?`,
      [blockId, draftId, version],
    );

    if (updateResult.affectedRows === 0) {
      // Either block doesn't exist (or wrong draft) OR version is stale.
      // Distinguish to give the right error.
      const [checkRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM storyboard_reference_blocks WHERE id = ? AND draft_id = ? LIMIT 1`,
        [blockId, draftId],
      );
      if (!checkRows.length) {
        throw new NotFoundError(`Block not found`);
      }
      throw new ConflictError(`version_conflict: block version has changed; reload and retry`);
    }

    // Validate every submitted scene belongs to THIS draft (F5). Without this,
    // an out-of-draft scene id is linked silently (foreign scene) or surfaces as
    // an FK 500; the contract requires a 422 references.scene_not_in_draft.
    const distinctScenes = [...new Set(sceneBlockIds)];
    if (distinctScenes.length) {
      const ph = distinctScenes.map(() => '?').join(',');
      const [sceneRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM storyboard_blocks
          WHERE id IN (${ph}) AND draft_id = ? AND block_type = 'scene'`,
        [...distinctScenes, draftId],
      );
      const found = new Set(sceneRows.map((r) => (r as { id: string }).id));
      const missing = distinctScenes.find((id) => !found.has(id));
      if (missing) {
        throw new SceneNotInDraftError(missing);
      }
    }

    // Replace scene links: delete all existing, insert new set.
    await conn.execute(
      `DELETE FROM storyboard_reference_scene_links WHERE reference_block_id = ?`,
      [blockId],
    );

    for (const sceneBlockId of sceneBlockIds) {
      await conn.execute(
        `INSERT INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
         VALUES (?, ?)`,
        [blockId, sceneBlockId],
      );
    }

    await conn.commit();

    return {
      sceneBlockIds,
      version: version + 1,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
