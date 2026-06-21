import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type ReferenceSceneLinkSnapshot = RowDataPacket & {
  reference_block_id: string;
  scene_block_id: string;
};

/**
 * Reads the (reference_block_id, scene_block_id) pairs for all reference blocks
 * that belong to this draft. Called BEFORE the block DELETE in replaceStoryboard
 * so the cascade does not lose them.
 *
 * Only reference blocks belonging to the draft are considered — avoids returning
 * cross-draft rows if the FK constraint is ever relaxed.
 */
export async function snapshotReferenceSceneLinksForDraft(
  conn: PoolConnection,
  draftId: string,
): Promise<ReferenceSceneLinkSnapshot[]> {
  const [rows] = await conn.execute<ReferenceSceneLinkSnapshot[]>(
    `SELECT l.reference_block_id, l.scene_block_id
       FROM storyboard_reference_scene_links l
       JOIN storyboard_reference_blocks rb
         ON rb.id = l.reference_block_id
      WHERE rb.draft_id = ?`,
    [draftId],
  );
  return rows;
}

/**
 * Re-inserts snapshotted reference→scene links for scene blocks that survived
 * the replace (i.e. whose ids are present in retainedBlockIds).
 *
 * INSERT IGNORE: idempotent across double-calls; also harmless when the row
 * already exists because a concurrent path re-created it.
 *
 * Links whose scene_block_id is NOT in retainedBlockIds are silently dropped —
 * the scene was removed, so the link should not exist.
 *
 * The reference_block_id FK is safe because reference blocks are never deleted
 * by replaceStoryboard (only storyboard_blocks rows are replaced).
 */
export async function restoreReferenceSceneLinksForRetainedScenes(
  conn: PoolConnection,
  links: ReferenceSceneLinkSnapshot[],
  retainedBlockIds: Set<string>,
): Promise<void> {
  for (const link of links) {
    if (!retainedBlockIds.has(link.scene_block_id)) continue;
    await conn.execute<ResultSetHeader>(
      `INSERT IGNORE INTO storyboard_reference_scene_links
         (reference_block_id, scene_block_id)
       VALUES (?, ?)`,
      [link.reference_block_id, link.scene_block_id],
    );
  }
}
