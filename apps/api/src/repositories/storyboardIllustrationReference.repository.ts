import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { AiJobStatus } from '@/repositories/aiGenerationJob.repository.js';

export type StoryboardIllustrationReferenceStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed';

export type StoryboardIllustrationReference = {
  id: string;
  draftId: string;
  aiJobId: string;
  status: StoryboardIllustrationReferenceStatus;
  outputFileId: string | null;
  sourceReferenceFileIds: string[];
  approvalStatus: 'pending' | 'approved';
  approvedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoryboardIllustrationReferenceRow = RowDataPacket & {
  id: string;
  draft_id: string;
  ai_job_id: string;
  status: StoryboardIllustrationReferenceStatus;
  output_file_id: string | null;
  source_reference_file_ids: unknown;
  approval_status?: 'pending' | 'approved';
  approved_at?: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function parseSourceReferenceFileIds(value: unknown): string[] {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === 'string');
}

function mapRow(row: StoryboardIllustrationReferenceRow): StoryboardIllustrationReference {
  return {
    id: row.id,
    draftId: row.draft_id,
    aiJobId: row.ai_job_id,
    status: row.status,
    outputFileId: row.output_file_id,
    sourceReferenceFileIds: parseSourceReferenceFileIds(row.source_reference_file_ids),
    approvalStatus: row.approval_status ?? 'pending',
    approvedAt: row.approved_at ?? null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStoryboardIllustrationReferenceStatus(
  status: AiJobStatus,
): StoryboardIllustrationReferenceStatus {
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

export async function createReferenceMapping(params: {
  id: string;
  draftId: string;
  aiJobId: string;
  sourceReferenceFileIds: string[];
  status?: StoryboardIllustrationReferenceStatus;
}): Promise<boolean> {
  const status = params.status ?? 'queued';
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO storyboard_illustration_references
       (id, draft_id, ai_job_id, status, source_reference_file_ids, active_lock)
     VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'failed' THEN NULL ELSE 1 END)`,
    [
      params.id,
      params.draftId,
      params.aiJobId,
      status,
      JSON.stringify(params.sourceReferenceFileIds),
      status,
    ],
  );
  return result.affectedRows === 1;
}

export async function findReferenceById(
  id: string,
): Promise<StoryboardIllustrationReference | null> {
  const [rows] = await pool.execute<StoryboardIllustrationReferenceRow[]>(
    `SELECT id, draft_id, ai_job_id, status, output_file_id,
            source_reference_file_ids, approval_status, approved_at,
            error_message, created_at, updated_at
       FROM storyboard_illustration_references
      WHERE id = ?`,
    [id],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findReferenceByAiJobId(
  aiJobId: string,
): Promise<StoryboardIllustrationReference | null> {
  const [rows] = await pool.execute<StoryboardIllustrationReferenceRow[]>(
    `SELECT id, draft_id, ai_job_id, status, output_file_id,
            source_reference_file_ids, approval_status, approved_at,
            error_message, created_at, updated_at
       FROM storyboard_illustration_references
      WHERE ai_job_id = ?`,
    [aiJobId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findLatestReferenceByDraftId(
  draftId: string,
): Promise<StoryboardIllustrationReference | null> {
  const [rows] = await pool.execute<StoryboardIllustrationReferenceRow[]>(
    `SELECT id, draft_id, ai_job_id, status, output_file_id,
            source_reference_file_ids, approval_status, approved_at,
            error_message, created_at, updated_at
       FROM storyboard_illustration_references
      WHERE draft_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [draftId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function findActiveReferenceByDraftId(
  draftId: string,
): Promise<StoryboardIllustrationReference | null> {
  const [rows] = await pool.execute<StoryboardIllustrationReferenceRow[]>(
    `SELECT id, draft_id, ai_job_id, status, output_file_id,
            source_reference_file_ids, approval_status, approved_at,
            error_message, created_at, updated_at
       FROM storyboard_illustration_references
      WHERE draft_id = ?
        AND active_lock = 1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [draftId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

export async function updateReferenceStatus(params: {
  aiJobId: string;
  status: StoryboardIllustrationReferenceStatus;
  errorMessage?: string | null;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_illustration_references
        SET status = ?,
            error_message = ?,
            approval_status = CASE
              WHEN ? = 'failed' THEN 'pending'
              ELSE approval_status
            END,
            approved_at = CASE
              WHEN ? = 'failed' THEN NULL
              ELSE approved_at
            END,
            active_lock = CASE
              WHEN ? = 'failed' THEN NULL
              ELSE 1
            END
      WHERE ai_job_id = ?`,
    [params.status, params.errorMessage ?? null, params.status, params.status, params.status, params.aiJobId],
  );
}

export async function setReferenceOutput(params: {
  aiJobId: string;
  outputFileId: string;
}): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_illustration_references
        SET status = 'ready',
            output_file_id = ?,
            error_message = NULL,
            approval_status = 'pending',
            approved_at = NULL,
            active_lock = 1
      WHERE ai_job_id = ?`,
    [params.outputFileId, params.aiJobId],
  );
}

export async function approveReference(params: {
  draftId: string;
  referenceId: string;
}): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_illustration_references
        SET approval_status = 'approved',
            approved_at = NOW(3)
      WHERE id = ?
        AND draft_id = ?
        AND status = 'ready'
        AND output_file_id IS NOT NULL
        AND active_lock = 1`,
    [params.referenceId, params.draftId],
  );
  return result.affectedRows === 1;
}

export async function deactivateActiveReference(draftId: string): Promise<void> {
  await pool.execute(
    `UPDATE storyboard_illustration_references
        SET active_lock = NULL,
            approval_status = 'pending',
            approved_at = NULL
      WHERE draft_id = ?
        AND active_lock = 1`,
    [draftId],
  );
}

export async function updateSourceReferenceFileIds(params: {
  draftId: string;
  referenceId: string;
  sourceReferenceFileIds: string[];
}): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_illustration_references
        SET source_reference_file_ids = ?,
            approval_status = 'pending',
            approved_at = NULL
      WHERE id = ?
        AND draft_id = ?
        AND active_lock = 1`,
    [JSON.stringify(params.sourceReferenceFileIds), params.referenceId, params.draftId],
  );
  return result.affectedRows === 1;
}
