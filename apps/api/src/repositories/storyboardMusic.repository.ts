import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import { ValidationError } from '@/lib/errors.js';
import { mapMusicBlockRow } from '@/repositories/storyboardMusic.repository.types.js';
import type {
  MusicBlockRow,
  StoryboardMusicBlock,
  StoryboardMusicBlockInsert,
} from '@/repositories/storyboardMusic.repository.types.js';

export type {
  ElevenLabsCompositionPlan,
  StoryboardMusicLoopMode,
  StoryboardMusicBlock,
  StoryboardMusicBlockInsert,
  StoryboardMusicGenerationJob,
} from '@/repositories/storyboardMusic.repository.types.js';

export {
  createMusicGenerationJobMapping,
  findActiveMusicGenerationJobForUpdate,
  releaseInactiveMusicGenerationLocks,
  restoreMusicGenerationJobsForRetainedBlocks,
  setMusicGenerationJobOutput,
  snapshotMusicGenerationJobsForDraft,
  toMusicGenerationStatus,
  updateMusicGenerationJobStatus,
} from '@/repositories/storyboardMusicGeneration.repository.js';

const MUSIC_BLOCK_COLUMNS = `
  mb.id, mb.draft_id, mb.name, mb.source_mode, mb.prompt,
  mb.composition_plan_json, mb.existing_file_id, mb.start_scene_block_id,
  mb.end_scene_block_id, mb.position_x, mb.position_y, mb.sort_order,
  mb.volume, mb.fade_in_s, mb.fade_out_s, mb.loop_mode, mb.created_at,
  mb.updated_at, latest.status AS generation_status,
  latest.ai_job_id AS generation_job_id, latest.output_file_id,
  latest.error_message
`;

const LATEST_JOB_JOIN = `
  LEFT JOIN storyboard_music_generation_jobs latest
    ON latest.id = (
      SELECT smg.id
        FROM storyboard_music_generation_jobs smg
       WHERE smg.draft_id = mb.draft_id
         AND smg.music_block_id = mb.id
       ORDER BY smg.created_at DESC, smg.id DESC
       LIMIT 1
    )
`;

/** Lists all storyboard music blocks for a draft with the latest generation job state. */
export async function listMusicBlocksByDraftId(
  draftId: string,
): Promise<StoryboardMusicBlock[]> {
  const [rows] = await pool.execute<MusicBlockRow[]>(
    `SELECT ${MUSIC_BLOCK_COLUMNS}
       FROM storyboard_music_blocks mb
       ${LATEST_JOB_JOIN}
      WHERE mb.draft_id = ?
      ORDER BY mb.sort_order ASC, mb.created_at ASC, mb.id ASC`,
    [draftId],
  );
  return rows.map(mapMusicBlockRow);
}

/** Locks and returns all storyboard music blocks for a draft within a transaction. */
export async function findMusicBlocksByDraftIdForUpdate(
  conn: PoolConnection,
  draftId: string,
): Promise<StoryboardMusicBlock[]> {
  const [rows] = await conn.execute<MusicBlockRow[]>(
    `SELECT ${MUSIC_BLOCK_COLUMNS}
       FROM storyboard_music_blocks mb
       ${LATEST_JOB_JOIN}
      WHERE mb.draft_id = ?
      ORDER BY mb.sort_order ASC, mb.created_at ASC, mb.id ASC
      FOR UPDATE`,
    [draftId],
  );
  return rows.map(mapMusicBlockRow);
}

/** Replaces a draft's music blocks inside an existing transaction. */
export async function replaceMusicBlocksInTx(
  conn: PoolConnection,
  draftId: string,
  musicBlocks: StoryboardMusicBlockInsert[],
): Promise<void> {
  const normalizedBlocks = musicBlocks.map((block) => ({ ...block, draftId }));
  await assertMusicBlockSceneRefsInDraft(conn, draftId, normalizedBlocks);
  await conn.execute<ResultSetHeader>(
    'DELETE FROM storyboard_music_blocks WHERE draft_id = ?',
    [draftId],
  );
  for (const block of normalizedBlocks) {
    await insertMusicBlockInTx(conn, draftId, block);
  }
}

/** Inserts one storyboard music block inside an existing transaction. */
export async function insertMusicBlockInTx(
  conn: PoolConnection,
  draftId: string,
  block: StoryboardMusicBlockInsert,
): Promise<void> {
  await assertMusicBlockSceneRefsInDraft(conn, draftId, [{ ...block, draftId }]);
  await conn.execute<ResultSetHeader>(
    `INSERT INTO storyboard_music_blocks
       (id, draft_id, name, source_mode, prompt, composition_plan_json,
        existing_file_id, start_scene_block_id, end_scene_block_id,
        position_x, position_y, sort_order, volume, fade_in_s, fade_out_s,
        loop_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      block.id,
      draftId,
      block.name,
      block.sourceMode,
      block.prompt,
      block.compositionPlan ? JSON.stringify(block.compositionPlan) : null,
      block.existingFileId,
      block.startSceneBlockId,
      block.endSceneBlockId,
      block.positionX,
      block.positionY,
      block.sortOrder,
      block.volume,
      block.fadeInS,
      block.fadeOutS,
      block.loopMode,
    ],
  );
}

async function assertMusicBlockSceneRefsInDraft(
  conn: PoolConnection,
  draftId: string,
  musicBlocks: StoryboardMusicBlockInsert[],
): Promise<void> {
  const sceneIds = Array.from(
    new Set(musicBlocks.flatMap((block) => [block.startSceneBlockId, block.endSceneBlockId])),
  );
  if (sceneIds.length === 0) return;

  const placeholders = sceneIds.map(() => '?').join(', ');
  const [rows] = await conn.execute<(RowDataPacket & { id: string })[]>(
    `SELECT id
       FROM storyboard_blocks
      WHERE draft_id = ?
        AND block_type = 'scene'
        AND id IN (${placeholders})`,
    [draftId, ...sceneIds],
  );
  const validSceneIds = new Set(rows.map((row) => row.id));

  for (const block of musicBlocks) {
    if (!validSceneIds.has(block.startSceneBlockId)) {
      throw new ValidationError(
        `Music block ${block.id} references a start scene outside draft ${draftId}`,
      );
    }
    if (!validSceneIds.has(block.endSceneBlockId)) {
      throw new ValidationError(
        `Music block ${block.id} references an end scene outside draft ${draftId}`,
      );
    }
  }
}

/** Updates one persisted storyboard music block by draft and block id. */
export async function updateMusicBlock(params: {
  id: string;
  draftId: string;
  patch: Omit<StoryboardMusicBlockInsert, 'id' | 'draftId'>;
}): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_music_blocks
        SET name = ?, source_mode = ?, prompt = ?, composition_plan_json = ?,
            existing_file_id = ?, start_scene_block_id = ?,
            end_scene_block_id = ?, position_x = ?, position_y = ?,
            sort_order = ?, volume = ?, fade_in_s = ?, fade_out_s = ?,
            loop_mode = ?
      WHERE id = ? AND draft_id = ?`,
    [
      params.patch.name,
      params.patch.sourceMode,
      params.patch.prompt,
      params.patch.compositionPlan ? JSON.stringify(params.patch.compositionPlan) : null,
      params.patch.existingFileId,
      params.patch.startSceneBlockId,
      params.patch.endSceneBlockId,
      params.patch.positionX,
      params.patch.positionY,
      params.patch.sortOrder,
      params.patch.volume,
      params.patch.fadeInS,
      params.patch.fadeOutS,
      params.patch.loopMode,
      params.id,
      params.draftId,
    ],
  );
  return result.affectedRows === 1;
}

/** Stores the latest effective ElevenLabs composition plan for one music block. */
export async function updateMusicBlockCompositionPlan(params: {
  id: string;
  draftId: string;
  compositionPlan: StoryboardMusicBlockInsert['compositionPlan'];
}): Promise<void> {
  await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_music_blocks
        SET composition_plan_json = ?
      WHERE id = ? AND draft_id = ?`,
    [
      params.compositionPlan ? JSON.stringify(params.compositionPlan) : null,
      params.id,
      params.draftId,
    ],
  );
}
