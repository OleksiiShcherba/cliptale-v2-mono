/** Replicate SDXL/Flux image generation adapter (async — polls for result). */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { ImageGenerationOptions, ImageGenerationResult, AdapterDeps } from './types.js';

const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';
const MODEL = 'black-forest-labs/flux-schnell';

/** Default dimensions when not specified. */
const DEFAULT_SIZE = '1024x1024';

/** Maximum time to wait for a prediction to complete (ms). */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** Interval between status polls (ms). */
const POLL_INTERVAL_MS = 3_000;

type ReplicatePrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: string[] | null;
  error: string | null;
};

/** Generates an image using Replicate, polls until complete, downloads, and uploads to S3. */
export async function generateImage(
  apiKey: string,
  options: ImageGenerationOptions,
  deps: AdapterDeps,
): Promise<ImageGenerationResult> {
  const size = options.size ?? DEFAULT_SIZE;
  const [w, h] = parseSize(size);

  // Create prediction
  const createResponse = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        prompt: options.prompt,
        width: w,
        height: h,
        ...(options.negativePrompt
          ? { negative_prompt: options.negativePrompt }
          : {}),
      },
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Replicate API error (${createResponse.status}): ${body}`);
  }

  let prediction = (await createResponse.json()) as ReplicatePrediction;

  // Poll if not yet complete
  if (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    prediction = await pollForCompletion(apiKey, prediction.id);
  }

  if (prediction.status === 'failed') {
    throw new Error(
      `Replicate prediction failed: ${prediction.error ?? 'unknown error'}`,
    );
  }

  const outputUrl = prediction.output?.[0];
  if (!outputUrl) {
    throw new Error('Replicate returned no output URL');
  }

  // Download the generated image
  const imageResponse = await fetch(outputUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image from Replicate: ${imageResponse.status}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // Upload to S3
  const assetKey = `projects/${deps.projectId}/ai-generated/${randomUUID()}.png`;
  await deps.s3.send(new PutObjectCommand({
    Bucket: deps.bucket,
    Key: assetKey,
    Body: imageBuffer,
    ContentType: 'image/png',
  }));

  return {
    imageUrl: `s3://${deps.bucket}/${assetKey}`,
    width: w,
    height: h,
    provider: 'replicate',
    model: MODEL,
  };
}

/** Polls a Replicate prediction until it reaches a terminal state. */
async function pollForCompletion(
  apiKey: string,
  predictionId: string,
): Promise<ReplicatePrediction> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(`${REPLICATE_API_URL}/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(
        `Replicate poll error (${response.status}): ${await response.text()}`,
      );
    }

    const prediction = (await response.json()) as ReplicatePrediction;

    if (
      prediction.status === 'succeeded' ||
      prediction.status === 'failed' ||
      prediction.status === 'canceled'
    ) {
      return prediction;
    }
  }

  throw new Error(`Replicate prediction ${predictionId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses a size string like "1024x1024" into [width, height]. */
function parseSize(size: string): [number, number] {
  const [w, h] = size.split('x').map(Number);
  return [w ?? 1024, h ?? 1024];
}
