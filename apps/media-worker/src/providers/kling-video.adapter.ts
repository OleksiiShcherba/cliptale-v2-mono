/** Kling video generation adapter (polling-based). */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { VideoGenerationOptions, VideoGenerationResult, AdapterDeps } from './types.js';

const KLING_API_URL = 'https://api.klingai.com/v1/videos/text2video';
const MODEL = 'kling-v1';

/** Maximum time to wait for generation to complete (ms). */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval between status polls (ms). */
const POLL_INTERVAL_MS = 5_000;

type KlingTask = {
  task_id: string;
  task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
  task_result?: { videos?: Array<{ url: string; duration: string }> };
  task_status_msg?: string;
};

type KlingCreateResponse = {
  data: { task_id: string };
};

/** Generates a video using Kling, polls until complete, downloads, and uploads to S3. */
export async function generateVideo(
  apiKey: string,
  options: VideoGenerationOptions,
  deps: AdapterDeps,
): Promise<VideoGenerationResult> {
  const createResponse = await fetch(KLING_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_name: MODEL,
      prompt: options.prompt,
      ...(options.duration ? { duration: String(options.duration) } : {}),
      ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      ...(options.imageUrl ? { image: options.imageUrl } : {}),
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Kling API error (${createResponse.status}): ${body}`);
  }

  const createJson = (await createResponse.json()) as KlingCreateResponse;
  const taskId = createJson.data.task_id;

  // Kling always returns a task_id — must poll for result
  const completedTask = await pollForCompletion(apiKey, taskId);

  if (completedTask.task_status === 'failed') {
    throw new Error(
      `Kling task failed: ${completedTask.task_status_msg ?? 'unknown error'}`,
    );
  }

  const videoUrl = completedTask.task_result?.videos?.[0]?.url;
  if (!videoUrl) {
    throw new Error('Kling returned no video URL');
  }

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video from Kling: ${videoResponse.status}`);
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  const assetKey = `projects/${deps.projectId}/ai-generated/${randomUUID()}.mp4`;
  await deps.s3.send(new PutObjectCommand({
    Bucket: deps.bucket,
    Key: assetKey,
    Body: videoBuffer,
    ContentType: 'video/mp4',
  }));

  const durationStr = completedTask.task_result?.videos?.[0]?.duration;
  const durationSeconds = durationStr ? parseFloat(durationStr) : (options.duration ?? 5);

  return {
    videoUrl: `s3://${deps.bucket}/${assetKey}`,
    durationSeconds,
    width: 1280,
    height: 720,
    provider: 'kling',
    model: MODEL,
  };
}

/** Polls a Kling task until it reaches a terminal state. */
async function pollForCompletion(
  apiKey: string,
  taskId: string,
): Promise<KlingTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(
      `https://api.klingai.com/v1/videos/text2video/${taskId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!response.ok) {
      throw new Error(`Kling poll error (${response.status}): ${await response.text()}`);
    }

    const result = (await response.json()) as { data: KlingTask };
    const task = result.data;
    if (task.task_status === 'succeed' || task.task_status === 'failed') {
      return task;
    }
  }

  throw new Error(`Kling task ${taskId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
