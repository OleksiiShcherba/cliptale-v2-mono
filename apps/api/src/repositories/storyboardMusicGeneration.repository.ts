import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { AiJobStatus } from '@/repositories/aiGenerationJob.repository.js';
import { mapMusicGenerationJobRow } from '@/repositories/storyboardMusic.repository.types.js';
import type {
  MusicGenerationJobRow,
  StoryboardMusicGenerationJob,
} from '@/repositories/storyboardMusic.repository.types.js';

export function toMusicGenerationStatus(status: AiJobStatus) {
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

export async function createMusicGenerationJobMapping(params: {
  id: string;
  draftId: string;
  musicBlockId: string;
  aiJobId: string;
  status?: StoryboardMusicGenerationJob['status'];
}): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO storyboard_music_generation_jobs
       (id, draft_id, music_block_id, ai_job_id, status, active_lock)
     SELECT ?, mb.draft_id, mb.id, ?, ?, 1
       FROM storyboard_music_blocks mb
      WHERE mb.id = ?
        AND mb.draft_id = ?`,
    [params.id, params.aiJobId, params.status ?? 'queued', params.musicBlockId, params.draftId],
  );
  return result.affectedRows === 1;
}

export async function findActiveMusicGenerationJobForUpdate(
  conn: PoolConnection,
  params: { draftId: string; musicBlockId: string },
): Promise<StoryboardMusicGenerationJob | null> {
  const [rows] = await conn.execute<MusicGenerationJobRow[]>(
    `SELECT id, draft_id, music_block_id, ai_job_id, status, output_file_id,
            error_message, active_lock, created_at, updated_at
       FROM storyboard_music_generation_jobs
      WHERE draft_id = ?
        AND music_block_id = ?
        AND active_lock = 1
        AND status IN ('queued', 'running')
      LIMIT 1
      FOR UPDATE`,
    [params.draftId, params.musicBlockId],
  );
  return rows.length ? mapMusicGenerationJobRow(rows[0]!) : null;
}

export async function snapshotMusicGenerationJobsForDraft(
  conn: PoolConnection,
  draftId: string,
): Promise<MusicGenerationJobRow[]> {
  const [rows] = await conn.execute<MusicGenerationJobRow[]>(
    `SELECT id, draft_id, music_block_id, ai_job_id, status, output_file_id,
            error_message, active_lock, created_at, updated_at
       FROM storyboard_music_generation_jobs
      WHERE draft_id = ?`,
    [draftId],
  );
  return rows;
}

export async function restoreMusicGenerationJobsForRetainedBlocks(
  conn: PoolConnection,
  jobs: MusicGenerationJobRow[],
  retainedMusicBlockIds: Set<string>,
): Promise<void> {
  for (const job of jobs) {
    if (!retainedMusicBlockIds.has(job.music_block_id)) continue;
    await conn.execute<ResultSetHeader>(
      `INSERT IGNORE INTO storyboard_music_generation_jobs
         (id, draft_id, music_block_id, ai_job_id, status, output_file_id,
          error_message, active_lock, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.draft_id,
        job.music_block_id,
        job.ai_job_id,
        job.status,
        job.output_file_id,
        job.error_message,
        job.active_lock,
        job.created_at,
        job.updated_at,
      ],
    );
  }
}

export async function updateMusicGenerationJobStatus(params: {
  aiJobId: string;
  status: StoryboardMusicGenerationJob['status'];
  errorMessage?: string | null;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_music_generation_jobs
        SET status = ?, error_message = ?,
            active_lock = CASE
              WHEN ? IN ('queued', 'running') THEN 1
              ELSE NULL
            END
      WHERE ai_job_id = ?`,
    [params.status, params.errorMessage ?? null, params.status, params.aiJobId],
  );
}

export async function setMusicGenerationJobOutput(params: {
  aiJobId: string;
  outputFileId: string;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_music_generation_jobs
        SET status = 'ready', output_file_id = ?, error_message = NULL,
            active_lock = NULL
      WHERE ai_job_id = ?`,
    [params.outputFileId, params.aiJobId],
  );
}

export async function releaseInactiveMusicGenerationLocks(params: {
  draftId: string;
  musicBlockId: string;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_music_generation_jobs
        SET active_lock = NULL
      WHERE draft_id = ?
        AND music_block_id = ?
        AND status IN ('ready', 'failed')`,
    [params.draftId, params.musicBlockId],
  );
}
