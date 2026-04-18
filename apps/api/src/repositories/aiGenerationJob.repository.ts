import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Job status lifecycle — matches the ENUM in migration 014. */
export type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * All capability values accepted by the `ai_generation_jobs.capability` ENUM.
 *
 * Mirrors migration 015 which extends the original four fal.ai values with four
 * ElevenLabs audio capabilities. Re-exported from the repository so the queue
 * payload (and any other DB-adjacent consumer) can reference the DB-shaped type
 * without reaching into the contracts package.
 *
 * fal.ai capabilities: text_to_image, image_edit, text_to_video, image_to_video
 * ElevenLabs audio:    text_to_speech, voice_cloning, speech_to_speech, music_generation
 */
export type AiCapability =
  | 'text_to_image'
  | 'image_edit'
  | 'text_to_video'
  | 'image_to_video'
  | 'text_to_speech'
  | 'voice_cloning'
  | 'speech_to_speech'
  | 'music_generation';

/** Full job record as stored in ai_generation_jobs (after migrations 025 + 026). */
export type AiGenerationJob = {
  jobId: string;
  userId: string;
  modelId: string;
  capability: AiCapability;
  prompt: string;
  options: Record<string, unknown> | null;
  status: AiJobStatus;
  progress: number;
  outputFileId: string | null;
  /** Set when the job was submitted via POST /generation-drafts/:id/ai/generate. */
  draftId: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type JobRow = RowDataPacket & {
  job_id: string;
  user_id: string;
  model_id: string;
  capability: AiCapability;
  prompt: string;
  options: Record<string, unknown> | null;
  status: AiJobStatus;
  progress: number;
  output_file_id: string | null;
  draft_id: string | null;
  result_url: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: JobRow): AiGenerationJob {
  return {
    jobId: row.job_id,
    userId: row.user_id,
    modelId: row.model_id,
    capability: row.capability,
    prompt: row.prompt,
    options: row.options,
    status: row.status,
    progress: row.progress,
    outputFileId: row.output_file_id,
    draftId: row.draft_id,
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
  modelId: string;
  capability: AiCapability;
  prompt: string;
  options: Record<string, unknown> | null;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.jobId,
      params.userId,
      params.modelId,
      params.capability,
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

/**
 * Records the generation draft that owns this job.
 *
 * Called immediately after a job is enqueued via the draft AI generate endpoint
 * so that setOutputFile can link the output file to the draft automatically
 * upon completion.
 */
export async function setDraftId(jobId: string, draftId: string): Promise<void> {
  await pool.execute(
    'UPDATE ai_generation_jobs SET draft_id = ? WHERE job_id = ?',
    [draftId, jobId],
  );
}

/**
 * Marks the job as completed and links it to the generated file in `files`.
 * The file row must already exist (created by the worker completion path).
 *
 * When draft_id is set on the job row, also inserts a row into `draft_files`
 * so the output file appears in the draft's asset gallery. The INSERT IGNORE
 * makes the link idempotent; a missing draft (deleted after submit) silently
 * produces no row because the FK would fail — which is the correct behaviour.
 */
export async function setOutputFile(
  jobId: string,
  outputFileId: string,
): Promise<void> {
  // Look up draft_id before updating so we can conditionally link draft_files.
  const [rows] = await pool.execute<JobRow[]>(
    'SELECT draft_id FROM ai_generation_jobs WHERE job_id = ?',
    [jobId],
  );
  const draftId = rows.length ? rows[0]!.draft_id : null;

  await pool.execute(
    `UPDATE ai_generation_jobs
     SET status = 'completed', progress = 100, output_file_id = ?
     WHERE job_id = ?`,
    [outputFileId, jobId],
  );

  if (draftId) {
    // Intentionally uses INSERT IGNORE: if the draft was deleted between job
    // submit and completion the FK will reject the insert and the link is
    // silently skipped — no orphan rows.
    await pool.execute(
      'INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)',
      [draftId, outputFileId],
    );
  }
}
