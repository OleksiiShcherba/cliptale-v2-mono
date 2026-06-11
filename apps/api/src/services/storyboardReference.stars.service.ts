/**
 * storyboardReference.stars.service.ts — T9
 *
 * Star/unstar curation for storyboard-reference-flows:
 *   - starResult   (AC-06, AC-13) — idempotent PUT toggle
 *   - unstarResult (AC-06, AC-13) — idempotent DELETE toggle
 *
 * Contract: docs/features/storyboard-reference-flows/contracts/openapi.yaml
 *   PUT    /storyboards/{draftId}/references/blocks/{blockId}/stars/{fileId}
 *   DELETE /storyboards/{draftId}/references/blocks/{blockId}/stars/{fileId}
 *
 * Stars are versionless + commutative (ADR-0005 override for star path, SAD §1 ¶4).
 * At most one primary per block: MySQL UNIQUE on (reference_block_id, is_primary)
 * with NULL for non-primary rows (migration 055).
 */

import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type StarResultParams = {
  blockId: string;
  draftId: string;
  userId: string;
  fileId: string;
  /** When true, promote this file to primary preview (AC-06). Default false. */
  isPrimary: boolean;
};

export type UnstarResultParams = {
  blockId: string;
  draftId: string;
  userId: string;
  fileId: string;
};

export type StarEntry = {
  fileId: string;
  isPrimary: boolean;
  createdAt: string;
};

export type BlockStarsState = {
  blockId: string;
  stars: StarEntry[];
  previewFileId: string | null;
};

// ── Internal row types ────────────────────────────────────────────────────────

type DraftRow = RowDataPacket & { user_id: string };

type StarRow = RowDataPacket & {
  file_id: string;
  is_primary: number | null;
  created_at: Date;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

type BlockFlowRow = RowDataPacket & { flow_id: string | null };

/**
 * Verify the block belongs to the draft and return its linked flow_id.
 * Throws NotFoundError (existence-hiding) if the block is absent / wrong draft.
 */
async function assertBlockInDraft(
  conn: PoolConnection,
  blockId: string,
  draftId: string,
): Promise<string | null> {
  const [rows] = await conn.execute<BlockFlowRow[]>(
    `SELECT flow_id FROM storyboard_reference_blocks WHERE id = ? AND draft_id = ? LIMIT 1`,
    [blockId, draftId],
  );
  if (!rows.length) {
    throw new NotFoundError(`Block not found`);
  }
  return rows[0]!.flow_id;
}

/**
 * Verify `fileId` is a result file of the block's linked flow (flow_files pivot).
 * `files.file_id` is globally scoped, so without this guard a foreign/cross-tenant
 * private image could be starred and fed to scene generation (F7 — SEVERE).
 * Throws NotFoundError (existence-hiding) if the block has no flow or the file is
 * not a result of that flow.
 */
async function assertFileInFlow(
  conn: PoolConnection,
  flowId: string | null,
  fileId: string,
): Promise<void> {
  if (!flowId) {
    throw new NotFoundError(`File not found`);
  }
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT 1 FROM flow_files WHERE flow_id = ? AND file_id = ? LIMIT 1`,
    [flowId, fileId],
  );
  if (!rows.length) {
    throw new NotFoundError(`File not found`);
  }
}

async function readStarsState(conn: PoolConnection, blockId: string): Promise<BlockStarsState> {
  const [rows] = await conn.execute<StarRow[]>(
    `SELECT file_id, is_primary, created_at
       FROM storyboard_reference_stars
      WHERE reference_block_id = ?
      ORDER BY created_at ASC`,
    [blockId],
  );

  const stars: StarEntry[] = rows.map((r) => ({
    fileId: r.file_id,
    isPrimary: r.is_primary === 1,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  // AC-07: the primary star is the preview; with no explicit primary the OLDEST
  // star is the fallback — a starred result always surfaces as the block preview.
  const primaryStar = rows.find((r) => r.is_primary === 1);
  const previewFileId = primaryStar?.file_id ?? rows[0]?.file_id ?? null;

  return { blockId, stars, previewFileId };
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Star (or upsert-star) a result file for a reference block (AC-06).
 * Idempotent: starring the same file again just updates is_primary if needed.
 * isPrimary=true promotes this file to block preview; demotes the previous primary.
 * Non-owner → NotFoundError (AC-13).
 */
export async function starResult(params: StarResultParams): Promise<BlockStarsState> {
  const { blockId, draftId, userId, fileId, isPrimary } = params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);
    const flowId = await assertBlockInDraft(conn, blockId, draftId);
    // Boundary guard (F7): the file must be a result of the block's linked flow;
    // never let a cross-tenant file_id be starred.
    await assertFileInFlow(conn, flowId, fileId);

    if (isPrimary) {
      // Demote any existing primary for this block first (avoid unique constraint conflict).
      await conn.execute(
        `UPDATE storyboard_reference_stars
            SET is_primary = NULL
          WHERE reference_block_id = ? AND is_primary = 1 AND file_id != ?`,
        [blockId, fileId],
      );
    }

    // Upsert the star row. ON DUPLICATE KEY UPDATE handles idempotency.
    const newPrimary = isPrimary ? 1 : null;
    await conn.execute(
      `INSERT INTO storyboard_reference_stars (id, reference_block_id, file_id, is_primary)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)`,
      [randomUUID(), blockId, fileId, newPrimary],
    );

    await conn.commit();

    return readStarsState(conn, blockId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Unstar a result file for a reference block (AC-06).
 * Idempotent: unstarring an already-unstarred file is a no-op.
 * When the removed star was primary, previewFileId falls back to the oldest remaining
 * star's file_id (AC-07 fallback logic).
 * Non-owner → NotFoundError (AC-13).
 */
export async function unstarResult(params: UnstarResultParams): Promise<BlockStarsState> {
  const { blockId, draftId, userId, fileId } = params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Owner guard (AC-13).
    await assertDraftOwner(conn, draftId, userId);
    await assertBlockInDraft(conn, blockId, draftId);

    // Check if removed star was primary.
    const [primaryCheck] = await conn.execute<RowDataPacket[]>(
      `SELECT is_primary FROM storyboard_reference_stars
        WHERE reference_block_id = ? AND file_id = ? LIMIT 1`,
      [blockId, fileId],
    );
    const wasPrimary =
      primaryCheck.length > 0 && (primaryCheck[0] as StarRow).is_primary === 1;

    // Delete the star (idempotent — no error if already absent).
    await conn.execute(
      `DELETE FROM storyboard_reference_stars
        WHERE reference_block_id = ? AND file_id = ?`,
      [blockId, fileId],
    );

    // AC-07 fallback: promote the oldest remaining star to primary when the primary was removed.
    if (wasPrimary) {
      await conn.execute(
        `UPDATE storyboard_reference_stars
            SET is_primary = 1
          WHERE reference_block_id = ?
          ORDER BY created_at ASC
          LIMIT 1`,
        [blockId],
      );
    }

    await conn.commit();

    return readStarsState(conn, blockId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
