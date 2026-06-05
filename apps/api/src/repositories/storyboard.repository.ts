import { randomUUID } from 'node:crypto';

import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import {
  mapBlockRow,
  mapEdgeRow,
  mapHistoryRow,
} from '@/repositories/storyboard.repository.types.js';
import {
  restoreIllustrationJobsForRetainedBlocks,
  snapshotIllustrationJobsForDraft,
} from '@/repositories/storyboardIllustrationMapping.repository.js';
import * as storyboardMusicRepository from '@/repositories/storyboardMusic.repository.js';
import type { StoryboardMusicBlockInsert } from '@/repositories/storyboardMusic.repository.js';
import type {
  BlockRow,
  BlockMediaRow,
  BlockMediaItem,
  EdgeRow,
  HistoryRow,
  BlockInsert,
  EdgeInsert,
  StoryboardBlock,
  StoryboardEdge,
  StoryboardHistoryEntry,
  BlockType,
} from '@/repositories/storyboard.repository.types.js';

// Re-export all public types so callers only need to import from this file.
export type {
  BlockType,
  BlockMediaItem,
  StoryboardBlock,
  StoryboardEdge,
  StoryboardHistoryEntry,
  BlockInsert,
  EdgeInsert,
} from '@/repositories/storyboard.repository.types.js';

// ── Connection helper (mirrors version.repository pattern) ────────────────────

/** Acquire a pool connection for use in a caller-managed transaction. */
export async function getConnection(): Promise<PoolConnection> {
  return pool.getConnection();
}

// ── Read queries ──────────────────────────────────────────────────────────────

/**
 * Returns all blocks for a draft, each hydrated with its media items.
 * Ordered by sort_order ASC.
 */
export async function findBlocksByDraftId(draftId: string): Promise<StoryboardBlock[]> {
  const [blockRows] = await pool.execute<BlockRow[]>(
    `SELECT id, draft_id, block_type, name, prompt, video_prompt, duration_s,
            position_x, position_y, sort_order, style, created_at, updated_at
     FROM storyboard_blocks
     WHERE draft_id = ?
     ORDER BY sort_order ASC`,
    [draftId],
  );

  if (blockRows.length === 0) return [];

  const blockIds = blockRows.map((r) => r.id);
  const placeholders = blockIds.map(() => '?').join(', ');

  const [mediaRows] = await pool.execute<BlockMediaRow[]>(
    `SELECT id, block_id, file_id, media_type, sort_order
     FROM storyboard_block_media
     WHERE block_id IN (${placeholders})
     ORDER BY sort_order ASC`,
    blockIds,
  );

  // Group media items by block_id.
  const mediaByBlock = new Map<string, BlockMediaItem[]>();
  for (const m of mediaRows) {
    const existing = mediaByBlock.get(m.block_id) ?? [];
    existing.push({
      id: m.id,
      fileId: m.file_id,
      mediaType: m.media_type,
      sortOrder: m.sort_order,
    });
    mediaByBlock.set(m.block_id, existing);
  }

  return blockRows.map((r) => mapBlockRow(r, mediaByBlock.get(r.id) ?? []));
}

export async function findBlocksByDraftIdForUpdate(
  conn: PoolConnection,
  draftId: string,
): Promise<StoryboardBlock[]> {
  const [blockRows] = await conn.execute<BlockRow[]>(
    `SELECT id, draft_id, block_type, name, prompt, video_prompt, duration_s,
            position_x, position_y, sort_order, style, created_at, updated_at
     FROM storyboard_blocks
     WHERE draft_id = ?
     ORDER BY sort_order ASC
     FOR UPDATE`,
    [draftId],
  );

  if (blockRows.length === 0) return [];

  const blockIds = blockRows.map((r) => r.id);
  const placeholders = blockIds.map(() => '?').join(', ');

  const [mediaRows] = await conn.execute<BlockMediaRow[]>(
    `SELECT id, block_id, file_id, media_type, sort_order
     FROM storyboard_block_media
     WHERE block_id IN (${placeholders})
     ORDER BY sort_order ASC
     FOR UPDATE`,
    blockIds,
  );

  const mediaByBlock = new Map<string, BlockMediaItem[]>();
  for (const m of mediaRows) {
    const existing = mediaByBlock.get(m.block_id) ?? [];
    existing.push({
      id: m.id,
      fileId: m.file_id,
      mediaType: m.media_type,
      sortOrder: m.sort_order,
    });
    mediaByBlock.set(m.block_id, existing);
  }

  return blockRows.map((r) => mapBlockRow(r, mediaByBlock.get(r.id) ?? []));
}

/**
 * Returns all edges for a draft.
 */
export async function findEdgesByDraftId(draftId: string): Promise<StoryboardEdge[]> {
  const [rows] = await pool.execute<EdgeRow[]>(
    `SELECT id, draft_id, source_block_id, target_block_id
     FROM storyboard_edges
     WHERE draft_id = ?`,
    [draftId],
  );
  return rows.map(mapEdgeRow);
}

export async function findEdgesByDraftIdForUpdate(
  conn: PoolConnection,
  draftId: string,
): Promise<StoryboardEdge[]> {
  const [rows] = await conn.execute<EdgeRow[]>(
    `SELECT id, draft_id, source_block_id, target_block_id
     FROM storyboard_edges
     WHERE draft_id = ?
     FOR UPDATE`,
    [draftId],
  );
  return rows.map(mapEdgeRow);
}

/**
 * Returns the last `limit` CHECKPOINT history entries for a draft, newest
 * first (AC-08). Legacy rows (origin='legacy') are filtered out at the query
 * level — never deleted; they age out via the origin-agnostic 50-cap prune.
 * Served by idx_storyboard_history_draft_origin (draft_id, origin, id DESC).
 */
export async function findHistoryByDraftId(
  draftId: string,
  limit: number,
): Promise<StoryboardHistoryEntry[]> {
  // pool.query (text protocol) instead of pool.execute (prepared statement)
  // because mysql2 cannot bind LIMIT as a prepared-statement parameter (ER_WRONG_ARGUMENTS).
  const [rows] = await pool.query<HistoryRow[]>(
    `SELECT id, draft_id, snapshot, preview_kind, created_at
     FROM storyboard_history
     WHERE draft_id = ? AND origin = 'checkpoint'
     ORDER BY id DESC
     LIMIT ?`,
    [draftId, limit],
  );
  return rows.map(mapHistoryRow);
}

/**
 * Counts blocks of a given type for a draft.
 * Used by the initialize endpoint for idempotency checking.
 */
export async function countBlocksByType(draftId: string, blockType: BlockType): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM storyboard_blocks
     WHERE draft_id = ? AND block_type = ?`,
    [draftId, blockType],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

// ── Write queries (transaction-aware) ────────────────────────────────────────

/**
 * Full-replace: deletes ALL blocks (cascades to edges + media) and edges for
 * the draft, then re-inserts from the provided arrays.
 *
 * MUST be called inside a caller-managed transaction (conn.beginTransaction /
 * conn.commit / conn.rollback). The service owns the transaction boundary.
 *
 * Risk: if the transaction rolls back, the storyboard retains its prior state
 * because the DELETE has not committed. The service always calls rollback on
 * error so partial state is never persisted.
 */
export async function replaceStoryboard(
  conn: PoolConnection,
  draftId: string,
  blocks: BlockInsert[],
  edges: EdgeInsert[],
  musicBlocks?: StoryboardMusicBlockInsert[],
): Promise<void> {
  const illustrationJobs = await snapshotIllustrationJobsForDraft(conn, draftId);
  const musicJobs = await storyboardMusicRepository.snapshotMusicGenerationJobsForDraft(conn, draftId);
  const existingMusicBlocks = musicBlocks === undefined
    ? await storyboardMusicRepository.findMusicBlocksByDraftIdForUpdate(conn, draftId)
    : [];
  const retainedBlockIds = new Set(blocks.map((block) => block.id));
  const nextMusicBlocks = (musicBlocks ?? existingMusicBlocks).filter((block) =>
    retainedBlockIds.has(block.startSceneBlockId) && retainedBlockIds.has(block.endSceneBlockId),
  );

  // Delete edges first (FK: storyboard_edges → storyboard_blocks).
  await conn.execute<ResultSetHeader>(
    'DELETE FROM storyboard_edges WHERE draft_id = ?',
    [draftId],
  );
  await conn.execute<ResultSetHeader>(
    'DELETE FROM storyboard_music_blocks WHERE draft_id = ?',
    [draftId],
  );
  // Delete blocks (cascades to storyboard_block_media).
  await conn.execute<ResultSetHeader>(
    'DELETE FROM storyboard_blocks WHERE draft_id = ?',
    [draftId],
  );

  // Insert blocks and their media items.
  for (const b of blocks) {
    await conn.execute<ResultSetHeader>(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, video_prompt, duration_s,
          position_x, position_y, sort_order, style)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.id, b.draftId, b.blockType, b.name, b.prompt, b.videoPrompt, b.durationS,
       b.positionX, b.positionY, b.sortOrder, b.style],
    );
    for (const m of b.mediaItems ?? []) {
      await conn.execute<ResultSetHeader>(
        `INSERT INTO storyboard_block_media (id, block_id, file_id, media_type, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [m.id, b.id, m.fileId, m.mediaType, m.sortOrder],
      );
    }
  }

  // Deleting blocks cascades active illustration-job mappings. Restore mappings
  // for blocks that survived the replace so in-flight image jobs can still
  // attach their output after an autosave.
  await restoreIllustrationJobsForRetainedBlocks(conn, illustrationJobs, retainedBlockIds);

  // Insert edges.
  for (const e of edges) {
    await conn.execute<ResultSetHeader>(
      `INSERT INTO storyboard_edges (id, draft_id, source_block_id, target_block_id)
       VALUES (?, ?, ?, ?)`,
      [e.id, e.draftId, e.sourceBlockId, e.targetBlockId],
    );
  }

  await storyboardMusicRepository.replaceMusicBlocksInTx(conn, draftId, nextMusicBlocks);
  await storyboardMusicRepository.restoreMusicGenerationJobsForRetainedBlocks(
    conn,
    musicJobs,
    new Set(nextMusicBlocks.map((block) => block.id)),
  );
}

/**
 * Inserts a single storyboard block.
 * Used by the initialize endpoint to seed START/END blocks.
 */
export async function insertBlock(block: BlockInsert): Promise<void> {
  await pool.execute<ResultSetHeader>(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, video_prompt, duration_s,
        position_x, position_y, sort_order, style)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [block.id, block.draftId, block.blockType, block.name, block.prompt,
     block.videoPrompt, block.durationS, block.positionX, block.positionY, block.sortOrder, block.style],
  );
}

/**
 * Counts START and END sentinel blocks for a draft using a locking read
 * (`FOR UPDATE`) inside a caller-supplied connection.
 *
 * MUST be called within an active transaction — the caller owns BEGIN/COMMIT/ROLLBACK.
 * The FOR UPDATE acquires gap locks that prevent concurrent inserts from racing
 * past the count = 0 check.
 */
export async function countSentinelBlocksForUpdate(
  conn: PoolConnection,
  draftId: string,
): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM storyboard_blocks
     WHERE draft_id = ? AND block_type IN ('start', 'end')
     FOR UPDATE`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

/**
 * Inserts START and END sentinel blocks inside a caller-supplied connection.
 * MUST be called within an active transaction — the caller owns BEGIN/COMMIT/ROLLBACK.
 */
export async function insertSentinelsInTx(
  conn: PoolConnection,
  start: BlockInsert,
  end: BlockInsert,
): Promise<void> {
  for (const block of [start, end]) {
    await conn.execute<ResultSetHeader>(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, video_prompt, duration_s,
          position_x, position_y, sort_order, style)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [block.id, block.draftId, block.blockType, block.name, block.prompt,
       block.videoPrompt, block.durationS, block.positionX, block.positionY, block.sortOrder, block.style],
    );
  }
}

/**
 * Inserts a checkpoint history row and then prunes rows beyond the most recent
 * `keepCount` for the draft (single DELETE + subquery in one round-trip).
 *
 * The row is stamped origin='checkpoint' here — a server-side stamp (ADR-0003),
 * never a request field, so clients cannot write 'legacy'. preview_kind records
 * whether the snapshot carries a real layout screenshot or the minimap fallback
 * (AC-04). The prune stays origin-agnostic: the cap applies to legacy +
 * checkpoint rows together (legacy rows age out — spec non-goal).
 *
 * Returns the auto-assigned id of the inserted row.
 */
export async function insertHistoryAndPrune(
  draftId: string,
  snapshot: unknown,
  keepCount: number,
  previewKind: 'screenshot' | 'minimap',
): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO storyboard_history (draft_id, snapshot, origin, preview_kind)
     VALUES (?, ?, 'checkpoint', ?)`,
    [draftId, JSON.stringify(snapshot), previewKind],
  );
  const insertedId = result.insertId;

  // Prune rows beyond the most recent keepCount using a derived-table subquery.
  // MySQL does not allow DELETE from a table with a direct self-referencing
  // subquery, so the inner SELECT is wrapped in an aliased derived table.
  // pool.query (text protocol) instead of pool.execute (prepared statement)
  // because mysql2 cannot bind LIMIT as a prepared-statement parameter (ER_WRONG_ARGUMENTS).
  await pool.query(
    `DELETE FROM storyboard_history
     WHERE draft_id = ?
       AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM storyboard_history
           WHERE draft_id = ?
           ORDER BY id DESC
           LIMIT ?
         ) AS kept
       )`,
    [draftId, draftId, keepCount],
  );

  return insertedId;
}

/**
 * Generates a valid UUID for a new block/edge.
 * Exported so the service can create IDs without importing node:crypto directly.
 */
export function newId(): string {
  return randomUUID();
}
