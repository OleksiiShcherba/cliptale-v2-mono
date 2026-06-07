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
import { ConflictError, NotFoundError } from '@/lib/errors.js';
import { aiGenerateQueue } from '@/queues/bullmq.js';

// ── Types (public surface, derived from data-model.md + openapi.yaml) ─────────

export type CreateBlockParams = {
  draftId: string;
  userId: string;
  castType: 'character' | 'environment';
  name: string;
  description?: string;
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

  // Enqueue the retry job AFTER the transaction commits (ADR-0004).
  await aiGenerateQueue.add('ai-generate', {
    jobId: randomUUID(),
    userId,
    referenceBlockId: blockId,
    flowId,
    draftId,
  });

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
