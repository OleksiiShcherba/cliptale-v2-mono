import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { AiJobStatus } from '@/repositories/aiGenerationJob.repository.js';

export type StoryboardSceneVideoStatus = 'queued' | 'running' | 'ready' | 'failed';

export type StoryboardSceneVideoJob = {
  id: string;
  draftId: string;
  blockId: string;
  aiJobId: string;
  modelId: string;
  generateAudio: boolean;
  status: StoryboardSceneVideoStatus;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type VideoJobRow = RowDataPacket & {
  id: string;
  draft_id: string;
  block_id: string;
  ai_job_id: string;
  model_id: string;
  generate_audio: 0 | 1;
  status: StoryboardSceneVideoStatus;
  output_file_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: VideoJobRow): StoryboardSceneVideoJob {
  return {
    id: row.id,
    draftId: row.draft_id,
    blockId: row.block_id,
    aiJobId: row.ai_job_id,
    modelId: row.model_id,
    generateAudio: row.generate_audio === 1,
    status: row.status,
    outputFileId: row.output_file_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSceneVideoStatus(status: AiJobStatus): StoryboardSceneVideoStatus {
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

export async function createVideoJobMapping(params: {
  id: string;
  draftId: string;
  blockId: string;
  aiJobId: string;
  modelId: string;
  generateAudio: boolean;
  status?: StoryboardSceneVideoStatus;
}): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO storyboard_scene_video_jobs
       (id, draft_id, block_id, ai_job_id, model_id, generate_audio, status, active_lock)
     SELECT ?, sb.draft_id, sb.id, ?, ?, ?, ?, 1
       FROM storyboard_blocks sb
      WHERE sb.id = ?
        AND sb.draft_id = ?
        AND sb.block_type = 'scene'`,
    [
      params.id,
      params.aiJobId,
      params.modelId,
      params.generateAudio ? 1 : 0,
      params.status ?? 'queued',
      params.blockId,
      params.draftId,
    ],
  );
  return result.affectedRows === 1;
}

export async function listVideoJobsByDraftId(
  draftId: string,
): Promise<StoryboardSceneVideoJob[]> {
  const [rows] = await pool.execute<VideoJobRow[]>(
    `SELECT id, draft_id, block_id, ai_job_id, model_id, generate_audio, status,
            output_file_id, error_message, created_at, updated_at
       FROM storyboard_scene_video_jobs
      WHERE draft_id = ?
      ORDER BY created_at ASC, id ASC`,
    [draftId],
  );
  return rows.map(mapRow);
}

export async function findLatestVideoJobsByDraftId(
  draftId: string,
): Promise<StoryboardSceneVideoJob[]> {
  const [rows] = await pool.execute<VideoJobRow[]>(
    `SELECT sv.id, sv.draft_id, sv.block_id, sv.ai_job_id, sv.model_id,
            sv.generate_audio, sv.status, sv.output_file_id, sv.error_message,
            sv.created_at, sv.updated_at
       FROM storyboard_scene_video_jobs sv
       INNER JOIN (
         SELECT block_id, MAX(created_at) AS max_created_at
           FROM storyboard_scene_video_jobs
          WHERE draft_id = ?
          GROUP BY block_id
       ) latest
         ON latest.block_id = sv.block_id
        AND latest.max_created_at = sv.created_at
      WHERE sv.draft_id = ?
        AND sv.id = (
          SELECT sv2.id
            FROM storyboard_scene_video_jobs sv2
           WHERE sv2.draft_id = sv.draft_id
             AND sv2.block_id = sv.block_id
             AND sv2.created_at = sv.created_at
           ORDER BY sv2.id DESC
           LIMIT 1
        )
      ORDER BY sv.created_at ASC, sv.id ASC`,
    [draftId, draftId],
  );
  return rows.map(mapRow);
}

export async function findLatestVideoJobsByDraftIdForUpdate(
  conn: PoolConnection,
  draftId: string,
): Promise<StoryboardSceneVideoJob[]> {
  const [rows] = await conn.execute<VideoJobRow[]>(
    `SELECT sv.id, sv.draft_id, sv.block_id, sv.ai_job_id, sv.model_id,
            sv.generate_audio, sv.status, sv.output_file_id, sv.error_message,
            sv.created_at, sv.updated_at
       FROM storyboard_scene_video_jobs sv
       INNER JOIN (
         SELECT block_id, MAX(created_at) AS max_created_at
           FROM storyboard_scene_video_jobs
          WHERE draft_id = ?
          GROUP BY block_id
       ) latest
         ON latest.block_id = sv.block_id
        AND latest.max_created_at = sv.created_at
      WHERE sv.draft_id = ?
        AND sv.id = (
          SELECT sv2.id
            FROM storyboard_scene_video_jobs sv2
           WHERE sv2.draft_id = sv.draft_id
             AND sv2.block_id = sv.block_id
             AND sv2.created_at = sv.created_at
           ORDER BY sv2.id DESC
           LIMIT 1
        )
      ORDER BY sv.created_at ASC, sv.id ASC
      FOR UPDATE`,
    [draftId, draftId],
  );
  return rows.map(mapRow);
}

export async function updateVideoJobStatus(params: {
  aiJobId: string;
  status: StoryboardSceneVideoStatus;
  errorMessage?: string | null;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_scene_video_jobs
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

export async function setVideoJobOutput(params: {
  aiJobId: string;
  outputFileId: string;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_scene_video_jobs
        SET status = 'ready',
            output_file_id = ?,
            error_message = NULL,
            active_lock = 1
      WHERE ai_job_id = ?`,
    [params.outputFileId, params.aiJobId],
  );
}
