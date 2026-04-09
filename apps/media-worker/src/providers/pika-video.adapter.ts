/** Pika video generation adapter (polling-based). */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { VideoGenerationOptions, VideoGenerationResult, AdapterDeps } from './types.js';

const PIKA_API_URL = 'https://api.pika.art/v1/generate';
const MODEL = 'pika-v2';

/** Maximum time to wait for generation to complete (ms). */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval between status polls (ms). */
const POLL_INTERVAL_MS = 5_000;

type PikaGeneration = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  video_url: string | null;
  duration: number | null;
  error: string | null;
};

/** Generates a video using Pika, polls until complete, downloads, and uploads to S3. */
export async function generateVideo(
  apiKey: string,
  options: VideoGenerationOptions,
  deps: AdapterDeps,
): Promise<VideoGenerationResult> {
  const createResponse = await fetch(PIKA_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      ...(options.duration ? { duration: options.duration } : {}),
      ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      ...(options.imageUrl ? { image_url: options.imageUrl } : {}),
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Pika API error (${createResponse.status}): ${body}`);
  }

  let generation = (await createResponse.json()) as PikaGeneration;

  if (generation.status !== 'completed' && generation.status !== 'failed') {
    generation = await pollForCompletion(apiKey, generation.id);
  }

  const completedGeneration = generation;

  if (completedGeneration.status === 'failed') {
    throw new Error(
      `Pika generation failed: ${completedGeneration.error ?? 'unknown error'}`,
    );
  }

  const videoUrl = completedGeneration.video_url;
  if (!videoUrl) {
    throw new Error('Pika returned no video URL');
  }

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video from Pika: ${videoResponse.status}`);
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
    durationSeconds: completedGeneration.duration ?? options.duration ?? 4,
    width: 1280,
    height: 720,
    provider: 'pika',
    model: MODEL,
  };
}

/** Polls a Pika generation until it reaches a terminal state. */
async function pollForCompletion(
  apiKey: string,
  generationId: string,
): Promise<PikaGeneration> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(
      `${PIKA_API_URL}/${generationId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!response.ok) {
      throw new Error(`Pika poll error (${response.status}): ${await response.text()}`);
    }

    const generation = (await response.json()) as PikaGeneration;
    if (generation.status === 'completed' || generation.status === 'failed') {
      return generation;
    }
  }

  throw new Error(`Pika generation ${generationId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
