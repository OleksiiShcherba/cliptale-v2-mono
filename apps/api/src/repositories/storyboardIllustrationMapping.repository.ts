import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type IllustrationJobSnapshot = RowDataPacket & {
  id: string;
  draft_id: string;
  block_id: string;
  ai_job_id: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
  output_file_id: string | null;
  error_message: string | null;
  active_lock: number | null;
  created_at: Date;
  updated_at: Date;
};

export async function snapshotIllustrationJobsForDraft(
  conn: PoolConnection,
  draftId: string,
): Promise<IllustrationJobSnapshot[]> {
  const [rows] = await conn.execute<IllustrationJobSnapshot[]>(
    `SELECT id, draft_id, block_id, ai_job_id, status, output_file_id,
            error_message, active_lock, created_at, updated_at
       FROM storyboard_scene_illustration_jobs
      WHERE draft_id = ?`,
    [draftId],
  );
  return rows;
}

export async function restoreIllustrationJobsForRetainedBlocks(
  conn: PoolConnection,
  jobs: IllustrationJobSnapshot[],
  retainedBlockIds: Set<string>,
): Promise<void> {
  for (const job of jobs) {
    if (!retainedBlockIds.has(job.block_id)) continue;
    await conn.execute<ResultSetHeader>(
      `INSERT IGNORE INTO storyboard_scene_illustration_jobs
         (id, draft_id, block_id, ai_job_id, status, output_file_id,
          error_message, active_lock, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.draft_id,
        job.block_id,
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
