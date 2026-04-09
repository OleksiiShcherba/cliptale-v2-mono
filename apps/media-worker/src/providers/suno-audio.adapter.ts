/** Suno music generation adapter (polling-based). */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { AudioGenerationOptions, AudioGenerationResult, AdapterDeps } from './types.js';

const SUNO_API_URL = 'https://studio-api.suno.ai/api/external/generate';
const MODEL = 'suno-v4';

/** Maximum time to wait for generation to complete (ms). */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval between status polls (ms). */
const POLL_INTERVAL_MS = 5_000;

type SunoClip = {
  id: string;
  status: 'queued' | 'streaming' | 'complete' | 'error';
  audio_url: string | null;
  duration: number | null;
  error_message: string | null;
};

type SunoCreateResponse = {
  clips: SunoClip[];
};

/** Generates music/audio using Suno, polls until complete, downloads, and uploads to S3. */
export async function generateAudio(
  apiKey: string,
  options: AudioGenerationOptions,
  deps: AdapterDeps,
): Promise<AudioGenerationResult> {
  const createResponse = await fetch(SUNO_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      ...(options.duration ? { duration: options.duration } : {}),
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Suno API error (${createResponse.status}): ${body}`);
  }

  const createJson = (await createResponse.json()) as SunoCreateResponse;
  let clip = createJson.clips[0];

  if (!clip) {
    throw new Error('Suno returned no clips');
  }

  if (clip.status !== 'complete' && clip.status !== 'error') {
    clip = await pollForCompletion(apiKey, clip.id);
  }

  if (clip.status === 'error') {
    throw new Error(`Suno generation failed: ${clip.error_message ?? 'unknown error'}`);
  }

  const audioUrl = clip.audio_url;
  if (!audioUrl) {
    throw new Error('Suno returned no audio URL');
  }

  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio from Suno: ${audioResponse.status}`);
  }
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

  const assetKey = `projects/${deps.projectId}/ai-generated/${randomUUID()}.mp3`;
  await deps.s3.send(new PutObjectCommand({
    Bucket: deps.bucket,
    Key: assetKey,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
  }));

  return {
    audioUrl: `s3://${deps.bucket}/${assetKey}`,
    durationSeconds: clip.duration ?? options.duration ?? 30,
    provider: 'suno',
    model: MODEL,
  };
}

/** Polls a Suno clip until it reaches a terminal state. */
async function pollForCompletion(
  apiKey: string,
  clipId: string,
): Promise<SunoClip> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(
      `${SUNO_API_URL}/${clipId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!response.ok) {
      throw new Error(`Suno poll error (${response.status}): ${await response.text()}`);
    }

    const clip = (await response.json()) as SunoClip;
    if (clip.status === 'complete' || clip.status === 'error') {
      return clip;
    }
  }

  throw new Error(`Suno clip ${clipId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
