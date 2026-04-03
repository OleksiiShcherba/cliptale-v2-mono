import { Worker } from 'bullmq';
import type { MediaIngestJobPayload, TranscriptionJobPayload } from '@ai-video-editor/project-schema';
import OpenAI from 'openai';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import { pool } from '@/lib/db.js';
import { processIngestJob } from '@/jobs/ingest.job.js';
import { processTranscribeJob } from '@/jobs/transcribe.job.js';

const QUEUE_MEDIA_INGEST = 'media-ingest';
const QUEUE_TRANSCRIPTION = 'transcription';

const connection = { url: config.redis.url };

const openaiClient = new OpenAI({ apiKey: config.openai.apiKey });

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

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[media-worker] Received ${signal}. Closing workers gracefully...`);
  await Promise.all([ingestWorker.close(), transcriptionWorker.close()]);
  console.log('[media-worker] Workers closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
