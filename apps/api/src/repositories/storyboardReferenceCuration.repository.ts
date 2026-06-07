/**
 * storyboardReferenceCuration.repository.ts
 *
 * Stars (AC-06, AC-07) and scene-links (AC-10, AC-10b) for reference blocks.
 *
 * Stars are versionless atomic toggles (Override SAD §1 ¶4, F1).
 * Scene-link saves use compare-and-set on storyboard_reference_blocks.version.
 */

import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReferenceStar {
  id: string;
  referenceBlockId: string;
  fileId: string;
  isPrimary: boolean;
}

export interface ReferenceSceneLink {
  referenceBlockId: string;
  sceneBlockId: string;
}

export type ToggleStarResult =
  | 'starred'
  | 'unstarred'
  | 'already_starred'
  | 'not_found';

export interface ReplaceSceneLinksResult {
  saved: boolean;
  newVersion: number | null;
}

// ── Internal row types ────────────────────────────────────────────────────────

type StarRow = RowDataPacket & {
  id: string;
  reference_block_id: string;
  file_id: string;
  is_primary: number | null;
};

type SceneLinkRow = RowDataPacket & {
  reference_block_id: string;
  scene_block_id: string;
};

function mapStarRow(row: StarRow): ReferenceStar {
  return {
    id: row.id,
    referenceBlockId: row.reference_block_id,
    fileId: row.file_id,
    isPrimary: row.is_primary === 1,
  };
}

// ── Stars ─────────────────────────────────────────────────────────────────────

/**
 * Idempotent star toggle (AC-06).
 *
 * Without `remove`: INSERT … ON DUPLICATE KEY (do nothing) → 'starred' or
 *   'already_starred' if the row already existed.
 * With `remove: true`: DELETE WHERE (block, file) → 'unstarred' or 'not_found'.
 *
 * Stars are versionless atomic toggles (Override SAD §1 ¶4, F1).
 */
export async function toggleStar(params: {
  referenceBlockId: string;
  fileId: string;
  remove?: boolean;
}): Promise<ToggleStarResult> {
  const { referenceBlockId, fileId, remove } = params;

  if (remove) {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM storyboard_reference_stars
        WHERE reference_block_id = ? AND file_id = ?`,
      [referenceBlockId, fileId],
    );
    return result.affectedRows > 0 ? 'unstarred' : 'not_found';
  }

  // INSERT IGNORE — if UNIQUE (reference_block_id, file_id) already exists, no-op.
  const id = randomUUID();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO storyboard_reference_stars
       (id, reference_block_id, file_id, is_primary)
     VALUES (?, ?, ?, NULL)`,
    [id, referenceBlockId, fileId],
  );
  return result.affectedRows > 0 ? 'starred' : 'already_starred';
}

/**
 * Designate `fileId` as the primary star of `referenceBlockId` (AC-06).
 * The previous primary (if any) must be demoted first so the UNIQUE
 * `(reference_block_id, is_primary)` constraint is never violated.
 *
 * The file must already be starred on this block; throws if it is not.
 */
export async function setPrimary(params: {
  referenceBlockId: string;
  fileId: string;
}): Promise<void> {
  const { referenceBlockId, fileId } = params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Demote any existing primary for this block.
    await conn.execute(
      `UPDATE storyboard_reference_stars
          SET is_primary = NULL
        WHERE reference_block_id = ? AND is_primary = 1`,
      [referenceBlockId],
    );

    // Promote the target file.
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE storyboard_reference_stars
          SET is_primary = 1
        WHERE reference_block_id = ? AND file_id = ?`,
      [referenceBlockId, fileId],
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      throw new Error(`File ${fileId} is not starred on block ${referenceBlockId}`);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Remove the primary designation from all stars on this block (AC-07).
 * Leaves the block with no primary star (no-preview state).
 */
export async function clearPrimary(params: {
  referenceBlockId: string;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_reference_stars
        SET is_primary = NULL
      WHERE reference_block_id = ? AND is_primary = 1`,
    [params.referenceBlockId],
  );
}

/**
 * Return all starred files for a reference block (AC-06 — block preview,
 * star gate, reference candidates).
 */
export async function listStarsForBlock(
  referenceBlockId: string,
): Promise<ReferenceStar[]> {
  const [rows] = await pool.execute<StarRow[]>(
    `SELECT id, reference_block_id, file_id, is_primary
       FROM storyboard_reference_stars
      WHERE reference_block_id = ?
      ORDER BY created_at ASC, id ASC`,
    [referenceBlockId],
  );
  return rows.map(mapStarRow);
}

/**
 * Return the single primary star for a block, or null when the block has
 * no primary star (no-preview state — AC-07 fallback).
 */
export async function getPrimaryStarForBlock(
  referenceBlockId: string,
): Promise<ReferenceStar | null> {
  const [rows] = await pool.execute<StarRow[]>(
    `SELECT id, reference_block_id, file_id, is_primary
       FROM storyboard_reference_stars
      WHERE reference_block_id = ? AND is_primary = 1
      LIMIT 1`,
    [referenceBlockId],
  );
  return rows.length ? mapStarRow(rows[0]!) : null;
}

// ── Scene links ───────────────────────────────────────────────────────────────

/**
 * Replace the full scene-link set for a reference block using compare-and-set
 * on `storyboard_reference_blocks.version` (AC-10, Override SAD §1 ¶4).
 *
 * Steps (in one transaction):
 *   1. UPDATE storyboard_reference_blocks SET version = version + 1
 *      WHERE id = ? AND version = parentVersion
 *   2. If affectedRows = 0 → stale; return { saved: false, newVersion: null }.
 *   3. DELETE existing scene_links for this block.
 *   4. INSERT new scene_links (if any).
 *   5. Commit; return { saved: true, newVersion: parentVersion + 1 }.
 */
export async function replaceSceneLinks(params: {
  referenceBlockId: string;
  sceneBlockIds: string[];
  parentVersion: number;
}): Promise<ReplaceSceneLinksResult> {
  const { referenceBlockId, sceneBlockIds, parentVersion } = params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Compare-and-set version bump.
    const [updateResult] = await conn.execute<ResultSetHeader>(
      `UPDATE storyboard_reference_blocks
          SET version = version + 1
        WHERE id = ? AND version = ?`,
      [referenceBlockId, parentVersion],
    );

    if (updateResult.affectedRows === 0) {
      await conn.rollback();
      return { saved: false, newVersion: null };
    }

    // Delete existing links.
    await conn.execute(
      `DELETE FROM storyboard_reference_scene_links
        WHERE reference_block_id = ?`,
      [referenceBlockId],
    );

    // Insert new links.
    if (sceneBlockIds.length > 0) {
      const placeholders = sceneBlockIds.map(() => '(?, ?)').join(', ');
      const values: string[] = [];
      for (const sceneId of sceneBlockIds) {
        values.push(referenceBlockId, sceneId);
      }
      await conn.execute(
        `INSERT INTO storyboard_reference_scene_links
           (reference_block_id, scene_block_id)
         VALUES ${placeholders}`,
        values,
      );
    }

    await conn.commit();
    return { saved: true, newVersion: parentVersion + 1 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Return all reference blocks linked to a specific scene block (star gate
 * per-scene scope — AC-08b).
 *
 * Used by the illustration service to determine which reference blocks must
 * have at least one star before allowing a per-scene regeneration.
 */
export async function listReferenceBlocksLinkedToScene(params: {
  sceneBlockId: string;
  draftId: string;
}): Promise<import('./storyboardReference.repository.js').ReferenceBlock[]> {
  type RefBlockRow = RowDataPacket & {
    id: string;
    draft_id: string;
    flow_id: string | null;
    cast_type: 'character' | 'environment';
    name: string;
    description: string | null;
    sort_order: number;
    position_x: number;
    position_y: number;
    window_status: import('./storyboardReference.repository.js').ReferenceBlockWindowStatus | null;
    first_job_id: string | null;
    error_message: string | null;
    version: number;
    created_at: Date;
    updated_at: Date;
  };

  const [rows] = await pool.execute<RefBlockRow[]>(
    `SELECT b.id, b.draft_id, b.flow_id, b.cast_type, b.name, b.description,
            b.sort_order, b.position_x, b.position_y, b.window_status,
            b.first_job_id, b.error_message, b.version, b.created_at, b.updated_at
       FROM storyboard_reference_blocks b
       JOIN storyboard_reference_scene_links l ON l.reference_block_id = b.id
      WHERE l.scene_block_id = ?
        AND b.draft_id = ?
      ORDER BY b.sort_order ASC`,
    [params.sceneBlockId, params.draftId],
  );

  return rows.map((row) => ({
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
    firstJobId: row.first_job_id,
    errorMessage: row.error_message,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Return all scene links for a reference block (AC-10 visible list).
 */
export async function listSceneLinksForBlock(
  referenceBlockId: string,
): Promise<ReferenceSceneLink[]> {
  const [rows] = await pool.execute<SceneLinkRow[]>(
    `SELECT reference_block_id, scene_block_id
       FROM storyboard_reference_scene_links
      WHERE reference_block_id = ?
      ORDER BY created_at ASC`,
    [referenceBlockId],
  );
  return rows.map((row) => ({
    referenceBlockId: row.reference_block_id,
    sceneBlockId: row.scene_block_id,
  }));
}
