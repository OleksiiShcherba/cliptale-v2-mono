import { Queue, Worker } from 'bullmq';
import type { MediaIngestJobPayload, TranscriptionJobPayload, EnhancePromptJobPayload } from '@ai-video-editor/project-schema';
import OpenAI from 'openai';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import { pool } from '@/lib/db.js';
import { submitFalJob, getFalJobStatus } from '@/lib/fal-client.js';
import {
  textToSpeech,
  voiceClone,
  speechToSpeech,
  musicGeneration,
} from '@/lib/elevenlabs-client.js';
import { processIngestJob } from '@/jobs/ingest.job.js';
import { processTranscribeJob } from '@/jobs/transcribe.job.js';
import { processAiGenerateJob, type AiGenerateJobPayload } from '@/jobs/ai-generate.job.js';
import { processEnhancePromptJob } from '@/jobs/enhancePrompt.job.js';

const QUEUE_MEDIA_INGEST = 'media-ingest';
const QUEUE_TRANSCRIPTION = 'transcription';
const QUEUE_AI_GENERATE = 'ai-generate';
const QUEUE_AI_ENHANCE = 'ai-enhance';

const connection = { url: config.redis.url };

const openaiClient = new OpenAI({ apiKey: config.openai.apiKey });

// Worker-side producer for media-ingest — used by the ai-generate handler to
// hand off newly written assets to FFprobe so they get duration/fps/thumbnail.
const mediaIngestQueue = new Queue<MediaIngestJobPayload>(QUEUE_MEDIA_INGEST, { connection });
mediaIngestQueue.on('error', (err) => {
  console.error('[media-worker] mediaIngestQueue error:', err.message);
});

// ── Ingest worker (concurrency 2) ─────────────────────────────────────────────

const ingestWorker = new Worker<MediaIngestJobPayload>(
  QUEUE_MEDIA_INGEST,
  (job) => processIngestJob(job, { s3: s3Client, pool }),
  { connection, concurrency: 2 },
);

ingestWorker.on('completed', (job) => {
  console.log(`[media-worker] ingest job ${job.id} completed`);
});

ingestWorker.on('failed', (job, err) => {
  console.error(`[media-worker] ingest job ${job?.id} failed:`, err.message);
});

ingestWorker.on('error', (err) => {
  console.error('[media-worker] ingest worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_MEDIA_INGEST);

// ── Transcription worker (concurrency 1 — Whisper calls are slow/expensive) ──

const transcriptionWorker = new Worker<TranscriptionJobPayload>(
  QUEUE_TRANSCRIPTION,
  (job) => processTranscribeJob(job, { s3: s3Client, pool, openai: openaiClient }),
  { connection, concurrency: 1 },
);

transcriptionWorker.on('completed', (job) => {
  console.log(`[media-worker] transcription job ${job.id} completed`);
});

transcriptionWorker.on('failed', (job, err) => {
  console.error(`[media-worker] transcription job ${job?.id} failed:`, err.message);
});

transcriptionWorker.on('error', (err) => {
  console.error('[media-worker] transcription worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_TRANSCRIPTION);

// ── AI generate worker (concurrency 2) ──────────────────────────────────────

const aiGenerateWorker = new Worker<AiGenerateJobPayload>(
  QUEUE_AI_GENERATE,
  (job) => processAiGenerateJob(job, {
    s3: s3Client,
    pool,
    bucket: config.s3.bucket,
    falKey: config.fal.key,
    fal: { submitFalJob, getFalJobStatus },
    elevenlabsKey: config.elevenlabs.apiKey,
    elevenlabs: { textToSpeech, voiceClone, speechToSpeech, musicGeneration },
    ingestQueue: mediaIngestQueue,
  }),
  { connection, concurrency: 2 },
);

aiGenerateWorker.on('completed', (job) => {
  console.log(`[media-worker] ai-generate job ${job.id} completed`);
});

aiGenerateWorker.on('failed', (job, err) => {
  console.error(`[media-worker] ai-generate job ${job?.id} failed:`, err.message);
});

aiGenerateWorker.on('error', (err) => {
  console.error('[media-worker] ai-generate worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_AI_GENERATE);

// ── AI enhance worker (concurrency 2) ────────────────────────────────────────

const aiEnhanceWorker = new Worker<EnhancePromptJobPayload>(
  QUEUE_AI_ENHANCE,
  (job) => processEnhancePromptJob(job, { openai: openaiClient, pool }),
  { connection, concurrency: 2 },
);

aiEnhanceWorker.on('completed', (job) => {
  console.log(`[media-worker] ai-enhance job ${job.id} completed`);
});

aiEnhanceWorker.on('failed', (job, err) => {
  console.error(`[media-worker] ai-enhance job ${job?.id} failed:`, err.message);
});

aiEnhanceWorker.on('error', (err) => {
  console.error('[media-worker] ai-enhance worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_AI_ENHANCE);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[media-worker] Received ${signal}. Closing workers gracefully...`);
  await Promise.all([
    ingestWorker.close(),
    transcriptionWorker.close(),
    aiGenerateWorker.close(),
    aiEnhanceWorker.close(),
    mediaIngestQueue.close(),
  ]);
  console.log('[media-worker] Workers closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
