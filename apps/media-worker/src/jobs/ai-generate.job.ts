/**
 * BullMQ handler for the `ai-generate` queue — unified provider dispatcher.
 *
 * Branches on the job capability: ElevenLabs audio capabilities are dispatched
 * to `processElevenLabsCapability` (ai-generate-audio.handler.ts); all fal.ai
 * capabilities follow the existing submit → poll → download → S3 → ingest flow.
 */

import { randomUUID } from 'node:crypto';

import type { Job, Queue } from 'bullmq';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import {
  type FalStatusParams,
  type FalStatusResult,
  type FalSubmitParams,
  type FalSubmitResult,
} from '@/lib/fal-client.js';
import {
  parseFalOutput,
  type AiCapability,
  type AudioCapability,
  type FalCapability,
} from '@/jobs/ai-generate.output.js';
import {
  processElevenLabsCapability,
  type ElevenLabsClientFns,
} from '@/jobs/ai-generate-audio.handler.js';

/** Payload shape mirroring `apps/api/src/queues/jobs/enqueue-ai-generate.ts`. */
export type AiGenerateJobPayload = {
  jobId: string;
  userId: string;
  projectId: string;
  modelId: string;
  capability: AiCapability;
  provider: 'fal' | 'elevenlabs';
  prompt: string;
  options: Record<string, unknown>;
};

/**
 * Injected dependencies for the ai-generate job handler.
 *
 * The fal client, API key, and ingest queue are all passed via `deps` so the
 * handler never reaches for `process.env`, never imports `@/config`, and can
 * be unit-tested without patching module state.
 */
export type AiGenerateJobDeps = {
  s3: S3Client;
  pool: Pool;
  bucket: string;
  falKey: string;
  fal: {
    submitFalJob: (params: FalSubmitParams) => Promise<FalSubmitResult>;
    getFalJobStatus: (params: FalStatusParams) => Promise<FalStatusResult>;
  };
  elevenlabsKey: string;
  elevenlabs: ElevenLabsClientFns;
  ingestQueue: Queue<MediaIngestJobPayload>;
};

/** Max total time we will poll fal.ai before giving up and failing the job. */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
/** Delay between consecutive status checks. */
const POLL_INTERVAL_MS = 3_000;
/** Progress stored once fal.ai has accepted the submit. */
const PROGRESS_SUBMITTED = 50;
/** Progress is incremented by this amount per non-terminal poll tick. */
const PROGRESS_PER_POLL = 5;
/** Progress cap while still polling — 100 is reserved for the final update. */
const PROGRESS_POLL_CEILING = 95;

/**
 * Processes one `ai-generate` job end-to-end:
 *
 * 1. Mark the DB row `processing`.
 * 2. Submit to fal.ai queue via `deps.fal.submitFalJob`.
 * 3. Poll `deps.fal.getFalJobStatus` until terminal, bumping `progress`.
 * 4. Parse the output by capability into a normalized record.
 * 5. Download the fal CDN artifact into memory and upload to S3.
 * 6. INSERT an asset row with `status='processing'`.
 * 7. Enqueue a media-ingest job (idempotent by assetId) for FFprobe metadata.
 * 8. Mark the generation row `completed` with the new asset's `s3://` URI.
 *
 * Any thrown error marks the job row `failed` with the error message and is
 * re-thrown so BullMQ records the failure.
 */
const AUDIO_CAPABILITIES = new Set<AiCapability>([
  'text_to_speech', 'voice_cloning', 'speech_to_speech', 'music_generation',
]);

export async function processAiGenerateJob(
  job: Job<AiGenerateJobPayload>,
  deps: AiGenerateJobDeps,
): Promise<void> {
  const { jobId, userId, projectId, modelId, capability, options } = job.data;
  const { s3, pool, bucket, falKey, fal, elevenlabsKey, elevenlabs, ingestQueue } = deps;

  await setJobStatus(pool, jobId, 'processing');

  try {
    // Dispatch ElevenLabs audio capabilities to the dedicated audio handler.
    if (AUDIO_CAPABILITIES.has(capability)) {
      await processElevenLabsCapability(
        { jobId, userId, projectId, capability: capability as AudioCapability, options },
        { s3, pool, bucket, elevenlabsKey, elevenlabs, ingestQueue },
      );
      return;
    }

    // ── fal.ai path ────────────────────────────────────────────────────────
    // The API-side asset resolver already folded `prompt` into `options` and
    // rewrote asset IDs to 1-hour presigned URLs. Forward `options` verbatim.
    const falInput: Record<string, unknown> = { ...(options ?? {}) };

    const { requestId, statusUrl, responseUrl } = await fal.submitFalJob({
      modelId,
      input: falInput,
      apiKey: falKey,
    });
    await setJobProgress(pool, jobId, PROGRESS_SUBMITTED);

    const output = await pollFalWithProgress(
      { modelId, requestId, apiKey: falKey, statusUrl, responseUrl },
      fal.getFalJobStatus,
      (progress) => setJobProgress(pool, jobId, progress),
    );

    const parsed = parseFalOutput(capability as FalCapability, output);
    const body = await downloadArtifact(parsed.remoteUrl);

    const storageKey = `ai-generations/${projectId}/${randomUUID()}.${parsed.extension}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: body,
        ContentType: parsed.contentType,
      }),
    );

    const storageUri = `s3://${bucket}/${storageKey}`;
    const assetId = randomUUID();
    const filename = `ai-${capability}-${Date.now()}.${parsed.extension}`;

    await insertAssetRow(pool, {
      assetId,
      projectId,
      userId,
      filename,
      contentType: parsed.contentType,
      fileSizeBytes: body.length,
      storageUri,
      width: parsed.width,
      height: parsed.height,
    });

    // Enqueue media-ingest so FFprobe fills duration_frames / fps / thumbnail /
    // waveform. The asset stays `processing` until ingest upgrades it to
    // `ready`, matching the flow for client-uploaded media.
    await ingestQueue.add(
      'ingest',
      { assetId, storageUri, contentType: parsed.contentType },
      { jobId: assetId, removeOnComplete: true, removeOnFail: false },
    );

    await pool.execute(
      `UPDATE ai_generation_jobs
         SET status = 'completed', progress = 100, result_url = ?, result_asset_id = ?
       WHERE job_id = ?`,
      [storageUri, assetId, jobId],
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown generation error';
    await setJobStatus(pool, jobId, 'failed', message);
    throw err;
  }
}

/**
 * Polls fal.ai until the job reaches a terminal state. On each non-terminal
 * tick, bumps a capped progress value via `onProgress` so the FE panel sees
 * the bar move while fal runs.
 */
async function pollFalWithProgress(
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
async function downloadArtifact(remoteUrl: string): Promise<Buffer> {
  const response = await globalThis.fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download fal artifact from ${remoteUrl}: HTTP ${response.status}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

type AssetRowParams = {
  assetId: string;
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  storageUri: string;
  width: number | null;
  height: number | null;
};

async function insertAssetRow(pool: Pool, params: AssetRowParams): Promise<void> {
  await pool.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes,
        storage_uri, status, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
    [
      params.assetId,
      params.projectId,
      params.userId,
      params.filename,
      params.contentType,
      params.fileSizeBytes,
      params.storageUri,
      params.width,
      params.height,
    ],
  );
}

async function setJobStatus(
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

async function setJobProgress(
  pool: Pool,
  jobId: string,
  progress: number,
): Promise<void> {
  await pool.execute(
    'UPDATE ai_generation_jobs SET progress = ? WHERE job_id = ?',
    [progress, jobId],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
