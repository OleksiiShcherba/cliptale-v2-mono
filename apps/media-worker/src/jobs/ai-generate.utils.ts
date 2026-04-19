/**
 * Utility helpers for the `ai-generate` BullMQ job handler.
 *
 * Extracted from `ai-generate.job.ts` to keep that file under the 300-line cap.
 * Do NOT import from `apps/api/` — workers must remain boundary-clean.
 */

import type { Pool } from 'mysql2/promise';

import { mimeToKind, type FileKind } from '@ai-video-editor/project-schema';

import type {
  FalStatusParams,
  FalStatusResult,
} from '@/lib/fal-client.js';

// Re-export so existing imports of FileKind / mimeToKind from this module continue to work.
export type { FileKind };
export { mimeToKind };

/** Max total time we will poll fal.ai before giving up and failing the job. */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
/** Delay between consecutive status checks. */
const POLL_INTERVAL_MS = 3_000;
/** Progress cap while still polling — 100 is reserved for the final update. */
const PROGRESS_POLL_CEILING = 95;
/** Progress is incremented by this amount per non-terminal poll tick. */
const PROGRESS_PER_POLL = 5;
/** Progress stored once fal.ai has accepted the submit. */
const PROGRESS_SUBMITTED = 50;

/**
 * Polls fal.ai until the job reaches a terminal state. On each non-terminal
 * tick, bumps a capped progress value via `onProgress` so the FE panel sees
 * the bar move while fal runs.
 */
export async function pollFalWithProgress(
  params: FalStatusParams,
  getStatus: (params: FalStatusParams) => Promise<FalStatusResult>,
  onProgress: (progress: number) => Promise<void>,
): Promise<unknown> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let progress = PROGRESS_SUBMITTED;

  while (Date.now() < deadline) {
    const result = await getStatus(params);

    if (result.status === 'COMPLETED') {
      return result.output;
    }

    if (result.status === 'FAILED') {
      const detail =
        result.output !== undefined ? `: ${JSON.stringify(result.output)}` : '';
      throw new Error(
        `fal.ai job ${params.requestId} reported status FAILED${detail}`,
      );
    }

    progress = Math.min(PROGRESS_POLL_CEILING, progress + PROGRESS_PER_POLL);
    await onProgress(progress);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `fal.ai job ${params.requestId} timed out after ${POLL_TIMEOUT_MS}ms`,
  );
}

/** Downloads a fal.ai CDN artifact into a Buffer. Throws with HTTP status on non-2xx. */
export async function downloadArtifact(remoteUrl: string): Promise<Buffer> {
  const response = await globalThis.fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download fal artifact from ${remoteUrl}: HTTP ${response.status}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function setJobStatus(
  pool: Pool,
  jobId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await pool.execute(
    'UPDATE ai_generation_jobs SET status = ?, error_message = ? WHERE job_id = ?',
    [status, errorMessage ?? null, jobId],
  );
}

export async function setJobProgress(
  pool: Pool,
  jobId: string,
  progress: number,
): Promise<void> {
  await pool.execute(
    'UPDATE ai_generation_jobs SET progress = ? WHERE job_id = ?',
    [progress, jobId],
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
