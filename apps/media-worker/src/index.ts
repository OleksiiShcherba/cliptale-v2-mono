import { Queue, Worker } from 'bullmq';
import type {
  MediaIngestJobPayload,
  TranscriptionJobPayload,
  EnhancePromptJobPayload,
  StoryboardOpenAIImageJobPayload,
} from '@ai-video-editor/project-schema';
import OpenAI from 'openai';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import { pool } from '@/lib/db.js';
import { submitFalJob, getFalJobStatus } from '@/lib/fal-client.js';
import {
  textToSpeech,
  voiceClone,
  speechToSpeech,
  createMusicCompositionPlan,
  musicGeneration,
} from '@/lib/elevenlabs-client.js';
import { processIngestJob } from '@/jobs/ingest.job.js';
import { processTranscribeJob } from '@/jobs/transcribe.job.js';
import { processAiGenerateJob, type AiGenerateJobPayload } from '@/jobs/ai-generate.job.js';
import { processEnhancePromptJob } from '@/jobs/enhancePrompt.job.js';
import { processStoryboardOpenAIImageJob } from '@/jobs/storyboardOpenAIImage.job.js';
import { routeStoryboardPlanQueueJob } from '@/jobs/storyboardPlanQueue.processor.js';
import { enqueueCastExtraction } from '@/jobs/enqueueCastExtraction.js';
import { reaperJobProcessor } from '@/jobs/storyboardPipelineReaper.job.js';
import {
  aiGenerationJobRepo,
  filesRepo,
  storyboardIllustrationRepo,
  buildStoryboardOpenAIImageJobDeps,
} from '@/jobs/workerRepositories.js';

const QUEUE_MEDIA_INGEST = 'media-ingest';
const QUEUE_TRANSCRIPTION = 'transcription';
const QUEUE_AI_GENERATE = 'ai-generate';
const QUEUE_AI_ENHANCE = 'ai-enhance';
const QUEUE_STORYBOARD_PLAN = 'storyboard-plan';
const QUEUE_STORYBOARD_OPENAI_IMAGE = 'storyboard-openai-image';
const QUEUE_STORYBOARD_PIPELINE_REAPER = 'storyboard-pipeline-reaper';
const STORYBOARD_PIPELINE_REAPER_JOB_NAME = 'storyboard-pipeline-reaper-sweep';

const connection = { url: config.redis.url };

const openaiClient = new OpenAI({ apiKey: config.openai.apiKey });

// Worker-side producer for media-ingest — used by the ai-generate handler to
// hand off newly written assets to FFprobe so they get duration/fps/thumbnail.
const mediaIngestQueue = new Queue<MediaIngestJobPayload>(QUEUE_MEDIA_INGEST, { connection });
mediaIngestQueue.on('error', (err) => {
  console.error('[media-worker] mediaIngestQueue error:', err.message);
});

// Worker-side producer for ai-generate — used by the reference rolling-window hook
// (ADR-0003) to enqueue the NEXT pending reference block after one completes.
// Without this, maybeAdvanceReferenceWindow silently no-ops and reference blocks
// stay stuck in window_status='running' forever.
const aiGenerateQueue = new Queue<AiGenerateJobPayload>(QUEUE_AI_GENERATE, { connection });
aiGenerateQueue.on('error', (err) => {
  console.error('[media-worker] aiGenerateQueue error:', err.message);
});

// ── Ingest worker (concurrency 2) ─────────────────────────────────────────────

const ingestWorker = new Worker<MediaIngestJobPayload>(
  QUEUE_MEDIA_INGEST,
  (job) => processIngestJob(job, { s3: s3Client, pool, bucket: config.s3.bucket }),
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
    elevenlabs: { textToSpeech, voiceClone, speechToSpeech, createMusicCompositionPlan, musicGeneration },
    ingestQueue: mediaIngestQueue,
    aiGenerateQueue,
    filesRepo,
    aiGenerationJobRepo,
    storyboardIllustrationRepo,
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

// ── Storyboard planning worker (concurrency 1 — multimodal OpenAI planning) ─
// Carries two job types (ADR-0002): storyboard-plan AND cast-extract — routed by
// job.name so the cast-extract handler actually runs in production (R1).

// Producer for the same queue: lets a completed scene-plan job self-enqueue cast
// extraction (B1 review fix, AC-02 — SAD §6 Flow 1 chains scene → reference-data).
const storyboardPlanQueue = new Queue(QUEUE_STORYBOARD_PLAN, { connection });
storyboardPlanQueue.on('error', (err) => {
  console.error('[media-worker] storyboardPlanQueue error:', err.message);
});

const storyboardPlanWorker = new Worker(
  QUEUE_STORYBOARD_PLAN,
  (job) =>
    routeStoryboardPlanQueueJob(job, {
      openai: openaiClient,
      pool,
      enqueueCastExtraction: (params) =>
        enqueueCastExtraction(params, { pool, queue: storyboardPlanQueue }).then(() => undefined),
    }),
  { connection, concurrency: 1 },
);

storyboardPlanWorker.on('completed', (job) => {
  console.log(`[media-worker] storyboard-plan job ${job.id} completed`);
});

storyboardPlanWorker.on('failed', (job, err) => {
  console.error(`[media-worker] storyboard-plan job ${job?.id} failed:`, err.message);
});

storyboardPlanWorker.on('error', (err) => {
  console.error('[media-worker] storyboard-plan worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_STORYBOARD_PLAN);

// ── Storyboard OpenAI Images worker (concurrency 1 — image generation/edit) ─

const storyboardOpenAIImageWorker = new Worker<StoryboardOpenAIImageJobPayload>(
  QUEUE_STORYBOARD_OPENAI_IMAGE,
  (job) => processStoryboardOpenAIImageJob(job, buildStoryboardOpenAIImageJobDeps({
    openai: openaiClient,
    s3: s3Client,
    bucket: config.s3.bucket,
  })),
  { connection, concurrency: 1 },
);

storyboardOpenAIImageWorker.on('completed', (job) => {
  console.log(`[media-worker] storyboard-openai-image job ${job.id} completed`);
});

storyboardOpenAIImageWorker.on('failed', (job, err) => {
  console.error(`[media-worker] storyboard-openai-image job ${job?.id} failed:`, err.message);
});

storyboardOpenAIImageWorker.on('error', (err) => {
  console.error('[media-worker] storyboard-openai-image worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_STORYBOARD_OPENAI_IMAGE);

// ── Storyboard pipeline reaper (repeatable — releases stuck phases, ADR-0005) ─
// A repeatable BullMQ job sweeps for over-bound running phases every
// APP_STORYBOARD_PIPELINE_REAPER_INTERVAL_MS (default 60s) and releases each under a
// version CAS. This complements the lazy-on-read release (api) so closed tabs (no read
// to trigger the lazy path) are still unblocked at the heartbeat bound (T11/T14, AC-12).

const storyboardPipelineReaperQueue = new Queue(QUEUE_STORYBOARD_PIPELINE_REAPER, { connection });
storyboardPipelineReaperQueue.on('error', (err) => {
  console.error('[media-worker] storyboardPipelineReaperQueue error:', err.message);
});

// Register the repeatable schedule. A stable jobId keeps BullMQ from stacking duplicate
// repeatables across restarts.
void storyboardPipelineReaperQueue.add(
  STORYBOARD_PIPELINE_REAPER_JOB_NAME,
  {},
  {
    repeat: { every: config.storyboardPipeline.reaperIntervalMs },
    removeOnComplete: true,
    removeOnFail: true,
    jobId: STORYBOARD_PIPELINE_REAPER_JOB_NAME,
  },
);

const storyboardPipelineReaperWorker = new Worker(
  QUEUE_STORYBOARD_PIPELINE_REAPER,
  () => reaperJobProcessor(),
  { connection, concurrency: 1 },
);

storyboardPipelineReaperWorker.on('failed', (job, err) => {
  console.error(`[media-worker] storyboard-pipeline-reaper job ${job?.id} failed:`, err.message);
});

storyboardPipelineReaperWorker.on('error', (err) => {
  console.error('[media-worker] storyboard-pipeline-reaper worker error:', err.message);
});

console.log(
  '[media-worker] Storyboard pipeline reaper registered (every',
  config.storyboardPipeline.reaperIntervalMs,
  'ms) on queue:',
  QUEUE_STORYBOARD_PIPELINE_REAPER,
);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[media-worker] Received ${signal}. Closing workers gracefully...`);
  await Promise.all([
    ingestWorker.close(),
    transcriptionWorker.close(),
    aiGenerateWorker.close(),
    aiEnhanceWorker.close(),
    storyboardPlanWorker.close(),
    storyboardOpenAIImageWorker.close(),
    storyboardPipelineReaperWorker.close(),
    mediaIngestQueue.close(),
    aiGenerateQueue.close(),
    storyboardPipelineReaperQueue.close(),
  ]);
  console.log('[media-worker] Workers closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
