/**
 * generation-flow.stars.service.ts
 *
 * Star / unstar versionless atomic toggles for reference blocks (AC-06, AC-07, AC-13).
 *
 * Design notes:
 *   - Stars are versionless commutative toggles — no 409 on concurrent toggle
 *     (Override SAD §1 ¶4, critic F1; ADR-0009).
 *   - Owner-scoping with existence hiding (AC-13): non-owner or absent block/file
 *     throws NotFoundError (404) — never reveals existence via 403.
 *   - File MUST be a flow_files result of the block's linked flow.
 *   - Primary fallback (AC-07): unstarring the primary auto-promotes the earliest
 *     remaining star, or leaves no primary (no-preview state).
 */

import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { NotFoundError } from '@/lib/errors.js';
import {
  toggleStar,
  setPrimary,
  listStarsForBlock,
} from '@/repositories/storyboardReferenceCuration.repository.js';

// ── Public API ────────────────────────────────────────────────────────────────

export interface StarParams {
  /** Authenticated caller — must own the draft that owns the reference block. */
  userId: string;
  /** The reference block to star a result for. */
  referenceBlockId: string;
  /** The result file to star — must be a flow_files result of the block's linked flow. */
  fileId: string;
  /**
   * When true, designate this file as the primary star (block preview).
   * At most one primary per block; promoting a new primary demotes the old one.
   * Stars are versionless — no 409 on concurrent toggles (Override SAD §1 ¶4, F1).
   */
  primary?: boolean;
}

export interface UnstarParams {
  /** Authenticated caller — must own the draft that owns the reference block. */
  userId: string;
  /** The reference block to remove a star from. */
  referenceBlockId: string;
  /** The result file to unstar. */
  fileId: string;
}

// ── Internal row types ────────────────────────────────────────────────────────

type BlockOwnerRow = RowDataPacket & {
  flow_id: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify that `userId` owns the reference block and return its linked flow_id.
 * Throws NotFoundError (existence-hiding) if block is absent or not owned by userId.
 */
async function assertOwnerAndGetFlowId(
  userId: string,
  referenceBlockId: string,
): Promise<string | null> {
  const [rows] = await pool.execute<BlockOwnerRow[]>(
    `SELECT b.flow_id
       FROM storyboard_reference_blocks b
       JOIN generation_drafts d ON d.id = b.draft_id
      WHERE b.id = ?
        AND d.user_id = ?
      LIMIT 1`,
    [referenceBlockId, userId],
  );
  if (!rows.length) {
    throw new NotFoundError('Reference block not found');
  }
  return rows[0]!.flow_id;
}

/**
 * Verify that `fileId` is a result file of `flowId` (via flow_files pivot).
 * Throws NotFoundError (existence-hiding) if not found or block has no linked flow.
 */
async function assertFileInFlow(flowId: string | null, fileId: string): Promise<void> {
  if (!flowId) {
    throw new NotFoundError('Reference block has no linked flow');
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM flow_files WHERE flow_id = ? AND file_id = ? LIMIT 1`,
    [flowId, fileId],
  );
  if (!rows.length) {
    throw new NotFoundError('File is not a result of the block\'s linked flow');
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Star a flow-result file on a reference block (AC-06).
 *
 * Enforces:
 * - Owner-scoping with existence hiding (AC-13): non-owner or absent block →
 *   NotFoundError (404). Never leak existence via a 403.
 * - File must be a result of the block's linked flow (via flow_files) — starring
 *   a foreign/unlinked file is refused.
 * - Idempotent: re-starring the same file is a no-op (unique constraint).
 * - Versionless — no compare-and-set, no 409 (Override SAD §1 ¶4, F1).
 * - primary=true: at most one primary per block; promoting demotes the old one.
 */
export async function star(params: StarParams): Promise<void> {
  const { userId, referenceBlockId, fileId, primary } = params;

  const flowId = await assertOwnerAndGetFlowId(userId, referenceBlockId);
  await assertFileInFlow(flowId, fileId);

  // Idempotent insert — INSERT IGNORE handles duplicate (block, file) gracefully.
  await toggleStar({ referenceBlockId, fileId });

  // If primary requested, promote (demotes previous primary atomically in a transaction).
  if (primary) {
    await setPrimary({ referenceBlockId, fileId });
  }
}

/**
 * Unstar a flow-result file on a reference block (AC-06 / AC-07).
 *
 * Enforces:
 * - Owner-scoping with existence hiding (AC-13).
 * - Idempotent: unstarring a file that is not starred is a no-op.
 * - Primary fallback (AC-07): if the removed star was the primary, the service
 *   promotes the earliest remaining star as the new primary, or leaves the block
 *   with no primary (no-preview placeholder) if no stars remain.
 * - Versionless — no compare-and-set, no 409.
 */
export async function unstar(params: UnstarParams): Promise<void> {
  const { userId, referenceBlockId, fileId } = params;

  const flowId = await assertOwnerAndGetFlowId(userId, referenceBlockId);

  // For unstar we still verify ownership but we don't need flow-file membership
  // (the file may have been deleted, triggering this cleanup path). However the
  // test seeds an owner check so we need to preserve the NotFoundError for
  // non-owners even before checking flow membership.
  // We do NOT check file-in-flow for unstar — the file may have been deleted
  // by the time cleanup runs, and the star row would already be gone via CASCADE.
  void flowId; // ownership confirmed above; no file-flow check for unstar

  const result = await toggleStar({ referenceBlockId, fileId, remove: true });

  // If the removed star was the primary, apply fallback (AC-07).
  // `toggleStar` with remove returns 'unstarred' when a row was deleted;
  // we must check if there's a remaining primary — if not, auto-promote earliest.
  if (result === 'unstarred') {
    // Check if there is still a primary (the deleted row may or may not have been primary).
    const remaining = await listStarsForBlock(referenceBlockId);
    const hasPrimary = remaining.some((s) => s.isPrimary);

    if (!hasPrimary && remaining.length > 0) {
      // Promote the earliest remaining star (listStarsForBlock orders by created_at ASC).
      const earliest = remaining[0]!;
      await setPrimary({ referenceBlockId, fileId: earliest.fileId });
    }
    // If remaining.length === 0: no-preview placeholder state (no action needed).
  }
}
