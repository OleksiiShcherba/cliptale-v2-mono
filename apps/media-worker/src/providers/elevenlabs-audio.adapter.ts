/** ElevenLabs audio generation adapter (synchronous — returns audio directly). */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import type { AudioGenerationOptions, AudioGenerationResult, AdapterDeps } from './types.js';

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_SFX_URL = 'https://api.elevenlabs.io/v1/sound-generation';
const MODEL = 'eleven_multilingual_v2';

/** Default voice ID used when none is specified. */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/** Generates audio using ElevenLabs (TTS or SFX), downloads, and uploads to S3. */
export async function generateAudio(
  apiKey: string,
  options: AudioGenerationOptions,
  deps: AdapterDeps,
): Promise<AudioGenerationResult> {
  const isSfx = options.type === 'sfx';

  const url = isSfx
    ? ELEVENLABS_SFX_URL
    : `${ELEVENLABS_TTS_URL}/${options.voiceId ?? DEFAULT_VOICE_ID}`;

  const body = isSfx
    ? { text: options.prompt, ...(options.duration ? { duration_seconds: options.duration } : {}) }
    : { text: options.prompt, model_id: MODEL };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errorBody}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const assetKey = `projects/${deps.projectId}/ai-generated/${randomUUID()}.mp3`;
  await deps.s3.send(new PutObjectCommand({
    Bucket: deps.bucket,
    Key: assetKey,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
  }));

  return {
    audioUrl: `s3://${deps.bucket}/${assetKey}`,
    durationSeconds: options.duration ?? 5,
    provider: 'elevenlabs',
    model: MODEL,
  };
}
