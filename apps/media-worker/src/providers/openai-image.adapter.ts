/** OpenAI DALL-E 3 image generation adapter. */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { ImageGenerationOptions, ImageGenerationResult, AdapterDeps } from './types.js';

const DALL_E_API_URL = 'https://api.openai.com/v1/images/generations';
const MODEL = 'dall-e-3';

/** Default size when none is specified. */
const DEFAULT_SIZE = '1024x1024';

type DallEResponse = {
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};

/** Generates an image using OpenAI DALL-E 3, receives it as base64, and uploads to S3. */
export async function generateImage(
  apiKey: string,
  options: ImageGenerationOptions,
  deps: AdapterDeps,
): Promise<ImageGenerationResult> {
  const size = options.size ?? DEFAULT_SIZE;

  const response = await fetch(DALL_E_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: options.prompt,
      n: 1,
      size,
      response_format: 'b64_json',
      ...(options.style ? { style: options.style } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI DALL-E API error (${response.status}): ${body}`);
  }

  const json = (await response.json()) as DallEResponse;
  const b64 = json.data[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI DALL-E returned no image data');
  }

  const imageBuffer = Buffer.from(b64, 'base64');

  // Upload to S3
  const assetKey = `projects/${deps.projectId}/ai-generated/${randomUUID()}.png`;
  await deps.s3.send(new PutObjectCommand({
    Bucket: deps.bucket,
    Key: assetKey,
    Body: imageBuffer,
    ContentType: 'image/png',
  }));

  const [w, h] = parseSize(size);

  return {
    imageUrl: `s3://${deps.bucket}/${assetKey}`,
    width: w,
    height: h,
    provider: 'openai',
    model: MODEL,
  };
}

/** Parses a size string like "1024x1024" into [width, height]. */
function parseSize(size: string): [number, number] {
  const [w, h] = size.split('x').map(Number);
  return [w ?? 1024, h ?? 1024];
}
