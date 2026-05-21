import {
  storyboardPlanJobStatusSchema,
  storyboardPlanSchema,
  type StoryboardPlan,
  type StoryboardPlanJobStatus,
} from '@ai-video-editor/project-schema';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

export type StoryboardPlanJob = {
  jobId: string;
  draftId: string;
  userId: string;
  status: StoryboardPlanJobStatus;
  model: string | null;
  promptSnapshot: unknown;
  mediaContext: unknown | null;
  plan: StoryboardPlan | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
};

export type ReservedStoryboardPlanJob = {
  jobId: string;
  status: 'queued' | 'running';
  created: boolean;
};

type StoryboardPlanJobRow = RowDataPacket & {
  job_id: string;
  draft_id: string;
  user_id: string;
  status: StoryboardPlanJobStatus;
  model: string | null;
  prompt_snapshot_json: unknown;
  media_context_json: unknown | null;
  plan_json: unknown | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  failed_at: Date | null;
};

function parseJsonColumn<T = unknown>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

function assertNoSignedUrls(value: unknown): void {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) {
      throw new Error('mediaContext must not contain signed URLs');
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) assertNoSignedUrls(item);
    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) assertNoSignedUrls(item);
  }
}

function mapRow(row: StoryboardPlanJobRow): StoryboardPlanJob {
  const status = storyboardPlanJobStatusSchema.parse(row.status);
  const rawPlan = row.plan_json === null ? null : parseJsonColumn(row.plan_json);
  const plan = rawPlan === null ? null : storyboardPlanSchema.parse(rawPlan);

  return {
    jobId: row.job_id,
    draftId: row.draft_id,
    userId: row.user_id,
    status,
    model: row.model,
    promptSnapshot: parseJsonColumn(row.prompt_snapshot_json),
    mediaContext: row.media_context_json === null ? null : parseJsonColumn(row.media_context_json),
    plan,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
  };
}

export function sanitizeStoryboardPlanJobError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutUrls = raw.replace(/\b(?:https?|s3|r2):\/\/\S+/gi, '[redacted-url]');
  const withoutTokenValues = withoutUrls.replace(
    /\b[A-Z0-9_-]*(?:api[_-]?key|secret|token|authorization)\s*[:=]\s*\S+/gi,
    '[redacted]',
  );
  const withoutKeys = withoutTokenValues.replace(/\b(?:sk|pk|rk|sess|secret|token|key)_[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
  const singleLine = withoutKeys
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const concise = singleLine ?? 'Storyboard plan job failed';
  return concise.slice(0, 512);
}

export async function createQueuedJob(params: {
  jobId: string;
  draftId: string;
  userId: string;
  model: string | null;
  promptSnapshot: unknown;
  mediaContext?: unknown | null;
}): Promise<void> {
  if (params.mediaContext !== undefined && params.mediaContext !== null) {
    assertNoSignedUrls(params.mediaContext);
  }

  await pool.query(
    `INSERT INTO storyboard_plan_jobs
       (job_id, draft_id, user_id, status, model, prompt_snapshot_json, media_context_json)
     VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    [
      params.jobId,
      params.draftId,
      params.userId,
      params.model,
      JSON.stringify(params.promptSnapshot),
      params.mediaContext === undefined || params.mediaContext === null ? null : JSON.stringify(params.mediaContext),
    ],
  );
}

export async function reserveQueuedJob(params: {
  jobId: string;
  draftId: string;
  userId: string;
  model: string | null;
  promptSnapshot: unknown;
  mediaContext?: unknown | null;
}): Promise<ReservedStoryboardPlanJob> {
  if (params.mediaContext !== undefined && params.mediaContext !== null) {
    assertNoSignedUrls(params.mediaContext);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockDraftRow(conn, params.draftId);

    const activeJob = await findActiveByDraftIdInConnection(conn, params.draftId);
    if (activeJob) {
      await conn.commit();
      return { jobId: activeJob.jobId, status: activeJob.status, created: false };
    }

    await conn.query(
      `INSERT INTO storyboard_plan_jobs
         (job_id, draft_id, user_id, status, model, prompt_snapshot_json, media_context_json)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
      [
        params.jobId,
        params.draftId,
        params.userId,
        params.model,
        JSON.stringify(params.promptSnapshot),
        params.mediaContext === undefined || params.mediaContext === null ? null : JSON.stringify(params.mediaContext),
      ],
    );
    await conn.commit();
    return { jobId: params.jobId, status: 'queued', created: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function lockDraftRow(conn: PoolConnection, draftId: string): Promise<void> {
  await conn.query(
    `SELECT id
       FROM generation_drafts
      WHERE id = ?
      FOR UPDATE`,
    [draftId],
  );
}

export async function markRunning(jobId: string): Promise<void> {
  await pool.query(
    `UPDATE storyboard_plan_jobs
        SET status = 'running',
            error_message = NULL,
            failed_at = NULL
      WHERE job_id = ?`,
    [jobId],
  );
}

export async function markCompleted(params: {
  jobId: string;
  plan: StoryboardPlan;
  mediaContext?: unknown | null;
}): Promise<void> {
  const plan = storyboardPlanSchema.parse(params.plan);
  if (params.mediaContext !== undefined && params.mediaContext !== null) {
    assertNoSignedUrls(params.mediaContext);
  }

  await pool.query(
    `UPDATE storyboard_plan_jobs
        SET status = 'completed',
            plan_json = ?,
            media_context_json = COALESCE(?, media_context_json),
            error_message = NULL,
            completed_at = NOW(3),
            failed_at = NULL
      WHERE job_id = ?`,
    [
      JSON.stringify(plan),
      params.mediaContext === undefined || params.mediaContext === null ? null : JSON.stringify(params.mediaContext),
      params.jobId,
    ],
  );
}

export async function markFailed(jobId: string, error: unknown): Promise<void> {
  await pool.query(
    `UPDATE storyboard_plan_jobs
        SET status = 'failed',
            error_message = ?,
            failed_at = NOW(3)
      WHERE job_id = ?`,
    [sanitizeStoryboardPlanJobError(error), jobId],
  );
}

export async function findByJobId(jobId: string): Promise<StoryboardPlanJob | null> {
  const [rows] = await pool.query<StoryboardPlanJobRow[]>(
    `SELECT job_id, draft_id, user_id, status, model, prompt_snapshot_json,
            media_context_json, plan_json, error_message, created_at, updated_at,
            completed_at, failed_at
       FROM storyboard_plan_jobs
      WHERE job_id = ?`,
    [jobId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findLatestByDraftId(draftId: string): Promise<StoryboardPlanJob | null> {
  const [rows] = await pool.query<StoryboardPlanJobRow[]>(
    `SELECT job_id, draft_id, user_id, status, model, prompt_snapshot_json,
            media_context_json, plan_json, error_message, created_at, updated_at,
            completed_at, failed_at
       FROM storyboard_plan_jobs
      WHERE draft_id = ?
      ORDER BY created_at DESC, job_id DESC
      LIMIT 1`,
    [draftId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findActiveByDraftId(draftId: string): Promise<StoryboardPlanJob | null> {
  const [rows] = await pool.query<StoryboardPlanJobRow[]>(
    `SELECT job_id, draft_id, user_id, status, model, prompt_snapshot_json,
            media_context_json, plan_json, error_message, created_at, updated_at,
            completed_at, failed_at
       FROM storyboard_plan_jobs
      WHERE draft_id = ? AND status IN ('queued', 'running')
      ORDER BY created_at DESC, job_id DESC
      LIMIT 1`,
    [draftId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

async function findActiveByDraftIdInConnection(
  conn: PoolConnection,
  draftId: string,
): Promise<ReservedStoryboardPlanJob | null> {
  const [rows] = await conn.query<Array<RowDataPacket & {
    job_id: string;
    status: 'queued' | 'running';
  }>>(
    `SELECT job_id, status
       FROM storyboard_plan_jobs
      WHERE draft_id = ? AND status IN ('queued', 'running')
      ORDER BY created_at DESC, job_id DESC
      LIMIT 1`,
    [draftId],
  );
  if (!rows.length) return null;
  return {
    jobId: rows[0]!.job_id,
    status: rows[0]!.status,
    created: false,
  };
}

export async function findLatestCompletedByDraftId(draftId: string): Promise<StoryboardPlanJob | null> {
  const [rows] = await pool.query<StoryboardPlanJobRow[]>(
    `SELECT job_id, draft_id, user_id, status, model, prompt_snapshot_json,
            media_context_json, plan_json, error_message, created_at, updated_at,
            completed_at, failed_at
       FROM storyboard_plan_jobs
      WHERE draft_id = ? AND status = 'completed'
      ORDER BY created_at DESC, job_id DESC
      LIMIT 1`,
    [draftId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}
