/** BullMQ job handler for ai-generate queue — routes to the correct provider adapter. */

import { randomUUID } from 'node:crypto';

import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';

import type { AdapterDeps } from '@/providers/types.js';

/** Payload shape matching the API-side AiGenerateJobPayload. */
export type AiGenerateJobPayload = {
  jobId: string;
  userId: string;
  projectId: string;
  type: 'image' | 'video' | 'audio' | 'text';
  provider: string;
  apiKey: string;
  prompt: string;
  options: Record<string, unknown> | null;
};

/** Injected dependencies for the ai-generate job handler. */
export type AiGenerateJobDeps = {
  s3: S3Client;
  pool: Pool;
  bucket: string;
};

/** Result returned by runAdapter with metadata needed to create an asset. */
type GenerationResult = {
  url: string;
  contentType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  filename: string;
};

/**
 * Processes an ai-generate job by routing to the correct provider adapter.
 *
 * 1. Updates job status to 'processing'.
 * 2. Resolves the adapter function based on type + provider.
 * 3. Calls the adapter with the decrypted API key and options.
 * 4. Creates an asset row in project_assets_current so the result appears in the asset browser.
 * 5. Updates the job row with result_url, result_asset_id, and status='completed'.
 */
export async function processAiGenerateJob(
  job: Job<AiGenerateJobPayload>,
  deps: AiGenerateJobDeps,
): Promise<void> {
  const { jobId, userId, projectId, type, provider, apiKey, prompt, options } = job.data;
  const { s3, pool, bucket } = deps;

  await setJobStatus(pool, jobId, 'processing');

  try {
    const adapterDeps: AdapterDeps = { s3, bucket, projectId };
    const result = await runAdapter(type, provider, apiKey, prompt, options, adapterDeps);

    // Create an asset row so the generated content shows up in the asset browser
    const assetId = randomUUID();
    await pool.execute(
      `INSERT INTO project_assets_current
         (asset_id, project_id, user_id, filename, content_type, file_size_bytes,
          storage_uri, status, width, height)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'ready', ?, ?)`,
      [assetId, projectId, userId, result.filename, result.contentType,
       result.url, result.width, result.height],
    );

    await pool.execute(
      `UPDATE ai_generation_jobs
       SET status = 'completed', progress = 100, result_url = ?, result_asset_id = ?
       WHERE job_id = ?`,
      [result.url, assetId, jobId],
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown generation error';
    await setJobStatus(pool, jobId, 'failed', message);
    throw err;
  }
}

/** Routes to the correct adapter based on type and provider, returning full metadata. */
async function runAdapter(
  type: string,
  provider: string,
  apiKey: string,
  prompt: string,
  options: Record<string, unknown> | null,
  deps: AdapterDeps,
): Promise<GenerationResult> {
  if (type === 'image') {
    const adapter = await loadImageAdapter(provider);
    const result = await adapter(apiKey, { prompt, ...options }, deps);
    return {
      url: result.imageUrl,
      contentType: 'image/png',
      width: result.width,
      height: result.height,
      durationSeconds: null,
      filename: `ai-${provider}-${Date.now()}.png`,
    };
  }

  if (type === 'video') {
    const adapter = await loadVideoAdapter(provider);
    const result = await adapter(apiKey, { prompt, ...options }, deps);
    return {
      url: result.videoUrl,
      contentType: 'video/mp4',
      width: result.width,
      height: result.height,
      durationSeconds: result.durationSeconds,
      filename: `ai-${provider}-${Date.now()}.mp4`,
    };
  }

  if (type === 'audio') {
    const adapter = await loadAudioAdapter(provider);
    const result = await adapter(apiKey, { prompt, ...options } as Parameters<typeof adapter>[1], deps);
    return {
      url: result.audioUrl,
      contentType: 'audio/mpeg',
      width: null,
      height: null,
      durationSeconds: result.durationSeconds,
      filename: `ai-${provider}-${Date.now()}.mp3`,
    };
  }

  throw new Error(`Unsupported generation type: ${type}`);
}

/** Lazily loads the image adapter for the given provider. */
async function loadImageAdapter(provider: string) {
  switch (provider) {
    case 'openai':
      return (await import('@/providers/openai-image.adapter.js')).generateImage;
    case 'stability_ai':
      return (await import('@/providers/stability-image.adapter.js')).generateImage;
    case 'replicate':
      return (await import('@/providers/replicate-image.adapter.js')).generateImage;
    default:
      throw new Error(`Unknown image provider: ${provider}`);
  }
}

/** Lazily loads the video adapter for the given provider. */
async function loadVideoAdapter(provider: string) {
  switch (provider) {
    case 'runway':
      return (await import('@/providers/runway-video.adapter.js')).generateVideo;
    case 'kling':
      return (await import('@/providers/kling-video.adapter.js')).generateVideo;
    case 'pika':
      return (await import('@/providers/pika-video.adapter.js')).generateVideo;
    default:
      throw new Error(`Unknown video provider: ${provider}`);
  }
}

/** Lazily loads the audio adapter for the given provider. */
async function loadAudioAdapter(provider: string) {
  switch (provider) {
    case 'elevenlabs':
      return (await import('@/providers/elevenlabs-audio.adapter.js')).generateAudio;
    case 'suno':
      return (await import('@/providers/suno-audio.adapter.js')).generateAudio;
    default:
      throw new Error(`Unknown audio provider: ${provider}`);
  }
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
