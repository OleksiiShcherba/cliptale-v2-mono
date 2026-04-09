import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Job status lifecycle. */
export type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/** Generation type — matches the ENUM in migration 010. */
export type AiGenerationType = 'image' | 'video' | 'audio' | 'text';

/** Full job record as stored in ai_generation_jobs. */
export type AiGenerationJob = {
  jobId: string;
  userId: string;
  projectId: string;
  type: AiGenerationType;
  provider: string;
  prompt: string;
  options: Record<string, unknown> | null;
  status: AiJobStatus;
  progress: number;
  resultAssetId: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type JobRow = RowDataPacket & {
  job_id: string;
  user_id: string;
  project_id: string;
  type: AiGenerationType;
  provider: string;
  prompt: string;
  options: Record<string, unknown> | null;
  status: AiJobStatus;
  progress: number;
  result_asset_id: string | null;
  result_url: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: JobRow): AiGenerationJob {
  return {
    jobId: row.job_id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type,
    provider: row.provider,
    prompt: row.prompt,
    options: row.options,
    status: row.status,
    progress: row.progress,
    resultAssetId: row.result_asset_id,
    resultUrl: row.result_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Inserts a new job row with status='queued'. */
export async function createJob(params: {
  jobId: string;
  userId: string;
  projectId: string;
  type: AiGenerationType;
  provider: string;
  prompt: string;
  options: Record<string, unknown> | null;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, project_id, type, provider, prompt, options)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.jobId,
      params.userId,
      params.projectId,
      params.type,
      params.provider,
      params.prompt,
      params.options ? JSON.stringify(params.options) : null,
    ],
  );
}

/** Returns a job by ID, or null if not found. */
export async function getJobById(
  jobId: string,
): Promise<AiGenerationJob | null> {
  const [rows] = await pool.execute<JobRow[]>(
    'SELECT * FROM ai_generation_jobs WHERE job_id = ?',
    [jobId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/** Updates the job status. */
export async function updateJobStatus(
  jobId: string,
  status: AiJobStatus,
  errorMessage?: string,
): Promise<void> {
  await pool.execute(
    `UPDATE ai_generation_jobs SET status = ?, error_message = ? WHERE job_id = ?`,
    [status, errorMessage ?? null, jobId],
  );
}

/** Updates the job progress (0–100). */
export async function updateJobProgress(
  jobId: string,
  progress: number,
): Promise<void> {
  await pool.execute(
    'UPDATE ai_generation_jobs SET progress = ? WHERE job_id = ?',
    [progress, jobId],
  );
}

/** Updates the job result asset ID and marks it as completed. */
export async function updateJobResult(
  jobId: string,
  resultAssetId: string,
): Promise<void> {
  await pool.execute(
    `UPDATE ai_generation_jobs
     SET status = 'completed', progress = 100, result_asset_id = ?
     WHERE job_id = ?`,
    [resultAssetId, jobId],
  );
}
