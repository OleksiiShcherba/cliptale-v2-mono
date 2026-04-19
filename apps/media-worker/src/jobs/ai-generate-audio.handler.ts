/**
 * ElevenLabs audio handler for the `ai-generate` BullMQ queue.
 *
 * Dispatches on the four ElevenLabs audio capabilities:
 *   text_to_speech, speech_to_speech, music_generation — produce audio files
 *   that are uploaded to S3 and inserted as project assets (same pipeline as
 *   fal.ai artifacts).
 *
 *   voice_cloning — produces an ElevenLabs voice_id rather than an audio file.
 *   The cloned voice is persisted to `user_voices` (migration 016) so the
 *   user can reuse it in future TTS / speech-to-speech jobs. The voiceId is
 *   also stored in `result_url` as `elevenlabs://voice/{voiceId}`.
 *
 * This module is intentionally kept free of BullMQ types — it receives the
 * already-destructured job data so it can be tested without the full Job
 * wrapper. All side-effectful operations are passed as typed deps.
 */

import { randomUUID } from 'node:crypto';

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Queue } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import type {
  TextToSpeechParams,
  VoiceCloneParams,
  SpeechToSpeechParams,
  MusicGenerationParams,
  VoiceCloneResult,
} from '@/lib/elevenlabs-client.js';
import type { AudioCapability } from '@/jobs/ai-generate.output.js';

/** The ElevenLabs function surface injected into the audio handler. */
export type ElevenLabsClientFns = {
  textToSpeech: (params: TextToSpeechParams) => Promise<Buffer>;
  voiceClone: (params: VoiceCloneParams) => Promise<VoiceCloneResult>;
  speechToSpeech: (params: SpeechToSpeechParams) => Promise<Buffer>;
  musicGeneration: (params: MusicGenerationParams) => Promise<Buffer>;
};

/** Subset of AiGenerateJobDeps needed by the audio handler. */
export type AudioHandlerDeps = {
  s3: S3Client;
  pool: Pool;
  bucket: string;
  elevenlabsKey: string;
  elevenlabs: ElevenLabsClientFns;
  ingestQueue: Queue<MediaIngestJobPayload>;
};

/** Job data fields consumed by the audio handler. */
export type AudioJobData = {
  jobId: string;
  userId: string;
  projectId: string;
  capability: AudioCapability;
  options: Record<string, unknown>;
};

/**
 * Processes one ElevenLabs audio capability end-to-end.
 * Throws on any error — the caller is responsible for catching and marking
 * the job failed (same pattern as the fal handler).
 */
export async function processElevenLabsCapability(
  data: AudioJobData,
  deps: AudioHandlerDeps,
): Promise<void> {
  const { capability } = data;

  switch (capability) {
    case 'text_to_speech':
      await handleTextToSpeech(data, deps);
      break;
    case 'voice_cloning':
      await handleVoiceCloning(data, deps);
      break;
    case 'speech_to_speech':
      await handleSpeechToSpeech(data, deps);
      break;
    case 'music_generation':
      await handleMusicGeneration(data, deps);
      break;
    default: {
      const _exhaustive: never = capability;
      throw new Error(`Unsupported audio capability: ${_exhaustive as string}`);
    }
  }
}

// ── Capability handlers ───────────────────────────────────────────────────────

async function handleTextToSpeech(
  { jobId, userId, projectId, capability, options }: AudioJobData,
  deps: AudioHandlerDeps,
): Promise<void> {
  await setProgress(deps.pool, jobId, 30);

  const audioBytes = await deps.elevenlabs.textToSpeech({
    apiKey: deps.elevenlabsKey,
    text: options.text as string,
    voiceId: options.voice_id as string | undefined,
    stability: options.stability as number | undefined,
    similarityBoost: options.similarity_boost as number | undefined,
  });

  await saveAudioAsset({ audioBytes, capability, jobId, userId, projectId }, deps);
}

async function handleVoiceCloning(
  { jobId, userId, options }: AudioJobData,
  deps: AudioHandlerDeps,
): Promise<void> {
  await setProgress(deps.pool, jobId, 30);

  // audio_sample is a presigned URL resolved by the API's assetResolver.
  const sampleUrl = options.audio_sample as string;
  const sampleBytes = await downloadAudio(sampleUrl);
  const voiceName = options.name as string;

  const { voiceId } = await deps.elevenlabs.voiceClone({
    apiKey: deps.elevenlabsKey,
    name: voiceName,
    audioSampleBytes: sampleBytes,
    audioSampleFilename: 'sample.mp3',
    description: options.description as string | undefined,
  });

  // Persist the cloned voice to user_voices so the user can reuse it in
  // future TTS / speech-to-speech jobs (migration 016).
  const internalVoiceId = randomUUID();
  await deps.pool.execute(
    `INSERT INTO user_voices (voice_id, user_id, label, elevenlabs_voice_id)
     VALUES (?, ?, ?, ?)`,
    [internalVoiceId, userId, voiceName, voiceId],
  );

  await deps.pool.execute(
    `UPDATE ai_generation_jobs
       SET status = 'completed', progress = 100, result_url = ?
     WHERE job_id = ?`,
    [`elevenlabs://voice/${voiceId}`, jobId],
  );
}

async function handleSpeechToSpeech(
  { jobId, userId, projectId, capability, options }: AudioJobData,
  deps: AudioHandlerDeps,
): Promise<void> {
  await setProgress(deps.pool, jobId, 30);

  // source_audio is a presigned URL resolved by the API's assetResolver.
  const sourceUrl = options.source_audio as string;
  const sourceBytes = await downloadAudio(sourceUrl);

  const audioBytes = await deps.elevenlabs.speechToSpeech({
    apiKey: deps.elevenlabsKey,
    sourceAudioBytes: sourceBytes,
    sourceAudioFilename: 'source.mp3',
    voiceId: options.voice_id as string,
    stability: options.stability as number | undefined,
  });

  await saveAudioAsset({ audioBytes, capability, jobId, userId, projectId }, deps);
}

async function handleMusicGeneration(
  { jobId, userId, projectId, capability, options }: AudioJobData,
  deps: AudioHandlerDeps,
): Promise<void> {
  await setProgress(deps.pool, jobId, 30);

  const audioBytes = await deps.elevenlabs.musicGeneration({
    apiKey: deps.elevenlabsKey,
    prompt: options.prompt as string,
    durationSeconds: options.duration as number | undefined,
  });

  await saveAudioAsset({ audioBytes, capability, jobId, userId, projectId }, deps);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type SaveAudioParams = {
  audioBytes: Buffer;
  capability: AudioCapability;
  jobId: string;
  userId: string;
  projectId: string;
};

async function saveAudioAsset(
  { audioBytes, capability, jobId, userId, projectId }: SaveAudioParams,
  deps: AudioHandlerDeps,
): Promise<void> {
  const { s3, pool, bucket, ingestQueue } = deps;
  const assetId = randomUUID();
  const storageKey = `ai-generations/${projectId}/${assetId}.mp3`;
  const storageUri = `s3://${bucket}/${storageKey}`;
  const contentType = 'audio/mpeg';

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: audioBytes,
      ContentType: contentType,
    }),
  );

  await pool.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes,
        storage_uri, status, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', NULL, NULL)`,
    [assetId, projectId, userId, `ai-${capability}-${Date.now()}.mp3`,
     contentType, audioBytes.length, storageUri],
  );

  // Enqueue media-ingest so FFprobe populates waveform + duration_frames.
  await ingestQueue.add(
    'ingest',
    { fileId: assetId, assetId, storageUri, contentType },
    { jobId: assetId, removeOnComplete: true, removeOnFail: false },
  );

  await pool.execute(
    `UPDATE ai_generation_jobs
       SET status = 'completed', progress = 100, result_url = ?, result_asset_id = ?
     WHERE job_id = ?`,
    [storageUri, assetId, jobId],
  );
}

async function downloadAudio(url: string): Promise<Buffer> {
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download audio from ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function setProgress(pool: Pool, jobId: string, progress: number): Promise<void> {
  await pool.execute('UPDATE ai_generation_jobs SET progress = ? WHERE job_id = ?', [progress, jobId]);
}
