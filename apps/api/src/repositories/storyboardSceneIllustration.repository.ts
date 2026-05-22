import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { AiJobStatus } from '@/repositories/aiGenerationJob.repository.js';

export type StoryboardSceneIllustrationStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed';

export type StoryboardSceneIllustrationJob = {
  id: string;
  draftId: string;
  blockId: string;
  aiJobId: string;
  status: StoryboardSceneIllustrationStatus;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type IllustrationJobRow = RowDataPacket & {
  id: string;
  draft_id: string;
  block_id: string;
  ai_job_id: string;
  status: StoryboardSceneIllustrationStatus;
  output_file_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: IllustrationJobRow): StoryboardSceneIllustrationJob {
  return {
    id: row.id,
    draftId: row.draft_id,
    blockId: row.block_id,
    aiJobId: row.ai_job_id,
    status: row.status,
    outputFileId: row.output_file_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSceneIllustrationStatus(
  status: AiJobStatus,
): StoryboardSceneIllustrationStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'processing':
      return 'running';
    case 'completed':
      return 'ready';
    case 'failed':
      return 'failed';
  }
}

export async function createIllustrationJobMapping(params: {
  id: string;
  draftId: string;
  blockId: string;
  aiJobId: string;
  status?: StoryboardSceneIllustrationStatus;
}): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status, active_lock)
     SELECT ?, sb.draft_id, sb.id, ?, ?, 1
       FROM storyboard_blocks sb
      WHERE sb.id = ?
        AND sb.draft_id = ?
        AND sb.block_type = 'scene'`,
    [
      params.id,
      params.aiJobId,
      params.status ?? 'queued',
      params.blockId,
      params.draftId,
    ],
  );
  return result.affectedRows === 1;
}

export async function listIllustrationJobsByDraftId(
  draftId: string,
): Promise<StoryboardSceneIllustrationJob[]> {
  const [rows] = await pool.execute<IllustrationJobRow[]>(
    `SELECT id, draft_id, block_id, ai_job_id, status, output_file_id,
            error_message, created_at, updated_at
       FROM storyboard_scene_illustration_jobs
      WHERE draft_id = ?
      ORDER BY created_at ASC, id ASC`,
    [draftId],
  );
  return rows.map(mapRow);
}

export async function findIllustrationJobById(
  id: string,
): Promise<StoryboardSceneIllustrationJob | null> {
  const [rows] = await pool.execute<IllustrationJobRow[]>(
    `SELECT id, draft_id, block_id, ai_job_id, status, output_file_id,
            error_message, created_at, updated_at
       FROM storyboard_scene_illustration_jobs
      WHERE id = ?`,
    [id],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findIllustrationJobByAiJobId(
  aiJobId: string,
): Promise<StoryboardSceneIllustrationJob | null> {
  const [rows] = await pool.execute<IllustrationJobRow[]>(
    `SELECT id, draft_id, block_id, ai_job_id, status, output_file_id,
            error_message, created_at, updated_at
       FROM storyboard_scene_illustration_jobs
      WHERE ai_job_id = ?`,
    [aiJobId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findLatestIllustrationJobByBlockId(params: {
  draftId: string;
  blockId: string;
}): Promise<StoryboardSceneIllustrationJob | null> {
  const [rows] = await pool.execute<IllustrationJobRow[]>(
    `SELECT id, draft_id, block_id, ai_job_id, status, output_file_id,
            error_message, created_at, updated_at
       FROM storyboard_scene_illustration_jobs
      WHERE draft_id = ?
        AND block_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [params.draftId, params.blockId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findLatestIllustrationJobsByDraftId(
  draftId: string,
): Promise<StoryboardSceneIllustrationJob[]> {
  const [rows] = await pool.execute<IllustrationJobRow[]>(
    `SELECT sj.id, sj.draft_id, sj.block_id, sj.ai_job_id, sj.status,
            sj.output_file_id, sj.error_message, sj.created_at, sj.updated_at
       FROM storyboard_scene_illustration_jobs sj
       INNER JOIN (
         SELECT block_id, MAX(created_at) AS max_created_at
           FROM storyboard_scene_illustration_jobs
          WHERE draft_id = ?
          GROUP BY block_id
       ) latest
         ON latest.block_id = sj.block_id
        AND latest.max_created_at = sj.created_at
      WHERE sj.draft_id = ?
        AND sj.id = (
          SELECT sj2.id
            FROM storyboard_scene_illustration_jobs sj2
           WHERE sj2.draft_id = sj.draft_id
             AND sj2.block_id = sj.block_id
             AND sj2.created_at = sj.created_at
           ORDER BY sj2.id DESC
           LIMIT 1
        )
      ORDER BY sj.created_at ASC, sj.id ASC`,
    [draftId, draftId],
  );
  return rows.map(mapRow);
}

export async function findLatestIllustrationJobsByDraftIdForUpdate(
  conn: PoolConnection,
  draftId: string,
): Promise<StoryboardSceneIllustrationJob[]> {
  const [rows] = await conn.execute<IllustrationJobRow[]>(
    `SELECT sj.id, sj.draft_id, sj.block_id, sj.ai_job_id, sj.status,
            sj.output_file_id, sj.error_message, sj.created_at, sj.updated_at
       FROM storyboard_scene_illustration_jobs sj
       INNER JOIN (
         SELECT block_id, MAX(created_at) AS max_created_at
           FROM storyboard_scene_illustration_jobs
          WHERE draft_id = ?
          GROUP BY block_id
       ) latest
         ON latest.block_id = sj.block_id
        AND latest.max_created_at = sj.created_at
      WHERE sj.draft_id = ?
        AND sj.id = (
          SELECT sj2.id
            FROM storyboard_scene_illustration_jobs sj2
           WHERE sj2.draft_id = sj.draft_id
             AND sj2.block_id = sj.block_id
             AND sj2.created_at = sj.created_at
           ORDER BY sj2.id DESC
           LIMIT 1
        )
      ORDER BY sj.created_at ASC, sj.id ASC
      FOR UPDATE`,
    [draftId, draftId],
  );
  return rows.map(mapRow);
}

export async function updateIllustrationJobStatus(params: {
  aiJobId: string;
  status: StoryboardSceneIllustrationStatus;
  errorMessage?: string | null;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_scene_illustration_jobs
        SET status = ?,
            error_message = ?,
            active_lock = CASE
              WHEN ? = 'failed' THEN NULL
              ELSE 1
            END
      WHERE ai_job_id = ?`,
    [params.status, params.errorMessage ?? null, params.status, params.aiJobId],
  );
}

export async function setIllustrationJobOutput(params: {
  aiJobId: string;
  outputFileId: string;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_scene_illustration_jobs
        SET status = 'ready',
            output_file_id = ?,
            error_message = NULL,
            active_lock = 1
      WHERE ai_job_id = ?`,
    [params.outputFileId, params.aiJobId],
  );
}

export async function attachIllustrationOutputToBlock(params: {
  id: string;
  aiJobId: string;
  outputFileId: string;
}): Promise<void> {
  await setIllustrationJobOutput({
    aiJobId: params.aiJobId,
    outputFileId: params.outputFileId,
  });

  await pool.execute(
    `INSERT INTO storyboard_block_media (id, block_id, file_id, media_type, sort_order)
     SELECT ?, sj.block_id, ?, 'image', COALESCE(MAX(existing.sort_order) + 1, 0)
       FROM storyboard_scene_illustration_jobs sj
       LEFT JOIN storyboard_block_media existing
         ON existing.block_id = sj.block_id
      WHERE sj.ai_job_id = ?
        AND sj.output_file_id = ?
        AND NOT EXISTS (
          SELECT 1
            FROM storyboard_block_media duplicate
           WHERE duplicate.block_id = sj.block_id
             AND duplicate.file_id = ?
             AND duplicate.media_type = 'image'
        )
      GROUP BY sj.block_id`,
    [
      params.id,
      params.outputFileId,
      params.aiJobId,
      params.outputFileId,
      params.outputFileId,
    ],
  );
}
