/** Stability AI text-to-image adapter. */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { ImageGenerationOptions, ImageGenerationResult, AdapterDeps } from './types.js';

const STABILITY_API_URL =
  'https://api.stability.ai/v2beta/stable-image/generate/core';
const MODEL = 'stable-diffusion-core';

/** Default dimensions when not specified. */
const DEFAULT_SIZE = '1024x1024';

type StabilityResponse = {
  image: string;
  finish_reason: string;
  seed: number;
};

/** Generates an image using Stability AI, downloads it, and uploads to S3. */
export async function generateImage(
  apiKey: string,
  options: ImageGenerationOptions,
  deps: AdapterDeps,
): Promise<ImageGenerationResult> {
  const size = options.size ?? DEFAULT_SIZE;
  const [w, h] = parseSize(size);

  const formData = new FormData();
  formData.append('prompt', options.prompt);
  formData.append('output_format', 'png');
  if (options.negativePrompt) {
    formData.append('negative_prompt', options.negativePrompt);
  }
  if (options.style) {
    formData.append('style_preset', options.style);
  }

  const response = await fetch(STABILITY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stability AI API error (${response.status}): ${body}`);
  }

  const json = (await response.json()) as StabilityResponse;
  const imageBuffer = Buffer.from(json.image, 'base64');

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
    provider: 'stability_ai',
    model: MODEL,
  };
}

/** Parses a size string like "1024x1024" into [width, height]. */
function parseSize(size: string): [number, number] {
  const [w, h] = size.split('x').map(Number);
  return [w ?? 1024, h ?? 1024];
}
