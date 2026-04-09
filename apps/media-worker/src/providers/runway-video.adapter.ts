/** Runway Gen-4 video generation adapter (task-based API with polling). */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { VideoGenerationOptions, VideoGenerationResult, AdapterDeps } from './types.js';

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1/image_to_video';
const MODEL = 'gen4_turbo';

/** Maximum time to wait for a task to complete (ms). */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval between status polls (ms). */
const POLL_INTERVAL_MS = 5_000;

type RunwayTask = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  output: string[] | null;
  failure: string | null;
};

/** Generates a video using Runway Gen-4, polls until complete, downloads, and uploads to S3. */
export async function generateVideo(
  apiKey: string,
  options: VideoGenerationOptions,
  deps: AdapterDeps,
): Promise<VideoGenerationResult> {
  const createResponse = await fetch(RUNWAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: MODEL,
      promptText: options.prompt,
      ...(options.duration ? { duration: options.duration } : {}),
      ...(options.aspectRatio ? { ratio: options.aspectRatio } : {}),
      ...(options.imageUrl ? { promptImage: options.imageUrl } : {}),
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Runway API error (${createResponse.status}): ${body}`);
  }

  let task = (await createResponse.json()) as RunwayTask;

  if (task.status !== 'SUCCEEDED' && task.status !== 'FAILED') {
    task = await pollForCompletion(apiKey, task.id);
  }

  const completedTask = task;

  if (completedTask.status === 'FAILED') {
    throw new Error(
      `Runway task failed: ${completedTask.failure ?? 'unknown error'}`,
    );
  }

  const videoUrl = completedTask.output?.[0];
  if (!videoUrl) {
    throw new Error('Runway returned no output URL');
  }

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video from Runway: ${videoResponse.status}`);
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  const assetKey = `projects/${deps.projectId}/ai-generated/${randomUUID()}.mp4`;
  await deps.s3.send(new PutObjectCommand({
    Bucket: deps.bucket,
    Key: assetKey,
    Body: videoBuffer,
    ContentType: 'video/mp4',
  }));

  return {
    videoUrl: `s3://${deps.bucket}/${assetKey}`,
    durationSeconds: options.duration ?? 5,
    width: 1280,
    height: 768,
    provider: 'runway',
    model: MODEL,
  };
}

/** Polls a Runway task until it reaches a terminal state. */
async function pollForCompletion(
  apiKey: string,
  taskId: string,
): Promise<RunwayTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(
      `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' } },
    );

    if (!response.ok) {
      throw new Error(`Runway poll error (${response.status}): ${await response.text()}`);
    }

    const task = (await response.json()) as RunwayTask;
    if (task.status === 'SUCCEEDED' || task.status === 'FAILED') {
      return task;
    }
  }

  throw new Error(`Runway task ${taskId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
