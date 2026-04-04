import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { RenderPreset } from '@ai-video-editor/project-schema';

/** Valid values for render_jobs.status, mirroring the DB ENUM. */
export type RenderJobStatus = 'queued' | 'processing' | 'complete' | 'failed';

/** Full render job record as returned by get-by-id. */
export type RenderJob = {
  jobId: string;
  projectId: string;
  versionId: number;
  requestedBy: string | null;
  status: RenderJobStatus;
  progressPct: number;
  preset: RenderPreset;
  outputUri: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Lightweight render job summary for list endpoints (same fields — render jobs are small). */
export type RenderJobSummary = RenderJob;

type RenderJobRow = RowDataPacket & {
  job_id: string;
  project_id: string;
  version_id: number;
  requested_by: string | null;
  status: RenderJobStatus;
  progress_pct: number;
  preset_json: unknown;
  output_uri: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRowToRenderJob(row: RenderJobRow): RenderJob {
  const preset =
    typeof row.preset_json === 'string'
      ? (JSON.parse(row.preset_json) as RenderPreset)
      : (row.preset_json as RenderPreset);

  return {
    jobId: row.job_id,
    projectId: row.project_id,
    versionId: row.version_id,
    requestedBy: row.requested_by,
    status: row.status,
    progressPct: row.progress_pct,
    preset,
    outputUri: row.output_uri,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Parameters for inserting a new render job row. */
export type InsertRenderJobParams = {
  jobId: string;
  projectId: string;
  versionId: number;
  requestedBy: string | null;
  preset: RenderPreset;
};

/**
 * Inserts a new render job row with status='queued' and progress_pct=0.
 * Returns the created job record.
 */
export async function insertRenderJob(params: InsertRenderJobParams): Promise<RenderJob> {
  await pool.execute<ResultSetHeader>(
    `INSERT INTO render_jobs (job_id, project_id, version_id, requested_by, preset_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.jobId,
      params.projectId,
      params.versionId,
      params.requestedBy,
      JSON.stringify(params.preset),
    ],
  );

  const job = await getRenderJobById(params.jobId);
  if (!job) {
    throw new Error(`Failed to retrieve inserted render job ${params.jobId}`);
  }
  return job;
}

/** Returns a single render job record by its job_id, or null if not found. */
export async function getRenderJobById(jobId: string): Promise<RenderJob | null> {
  const [rows] = await pool.execute<RenderJobRow[]>(
    'SELECT * FROM render_jobs WHERE job_id = ?',
    [jobId],
  );
  return rows.length ? mapRowToRenderJob(rows[0]!) : null;
}

/** Returns all render jobs for a project, newest first. */
export async function listRenderJobsByProject(projectId: string): Promise<RenderJobSummary[]> {
  const [rows] = await pool.execute<RenderJobRow[]>(
    'SELECT * FROM render_jobs WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  );
  return rows.map(mapRowToRenderJob);
}

/** Parameters for updating progress during an active render. */
export type UpdateProgressParams = {
  jobId: string;
  status: RenderJobStatus;
  progressPct: number;
};

/**
 * Updates the `status` and `progress_pct` fields of a render job.
 * Used by the render worker to report incremental progress.
 */
export async function updateRenderProgress(params: UpdateProgressParams): Promise<void> {
  await pool.execute(
    'UPDATE render_jobs SET status = ?, progress_pct = ? WHERE job_id = ?',
    [params.status, params.progressPct, params.jobId],
  );
}

/** Parameters for marking a render job as complete. */
export type CompleteRenderJobParams = {
  jobId: string;
  outputUri: string;
};

/**
 * Marks a render job as complete with its S3 output URI and progress_pct=100.
 */
export async function completeRenderJob(params: CompleteRenderJobParams): Promise<void> {
  await pool.execute(
    `UPDATE render_jobs
     SET status = 'complete', progress_pct = 100, output_uri = ?
     WHERE job_id = ?`,
    [params.outputUri, params.jobId],
  );
}

/** Parameters for marking a render job as failed. */
export type FailRenderJobParams = {
  jobId: string;
  errorMessage: string;
};

/**
 * Marks a render job as failed with an error message.
 */
export async function failRenderJob(params: FailRenderJobParams): Promise<void> {
  await pool.execute(
    `UPDATE render_jobs SET status = 'failed', error_message = ? WHERE job_id = ?`,
    [params.errorMessage, params.jobId],
  );
}

/**
 * Counts the number of non-terminal (queued or processing) render jobs for a given user
 * across all projects. Used to enforce the concurrent-render limit per user.
 */
export async function countActiveJobsByUser(requestedBy: string): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM render_jobs
     WHERE requested_by = ? AND status IN ('queued', 'processing')`,
    [requestedBy],
  );
  return (rows[0]!['cnt'] as number) ?? 0;
}

/** Acquires a connection from the pool for use within a transaction. */
export async function getConnection(): Promise<PoolConnection> {
  return pool.getConnection();
}
