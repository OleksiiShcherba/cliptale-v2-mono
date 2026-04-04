import { Worker } from 'bullmq';
import type { RenderVideoJobPayload } from '@ai-video-editor/project-schema';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import { pool } from '@/lib/db.js';
import { processRenderJob } from '@/jobs/render.job.js';

const QUEUE_RENDER = 'render';

const connection = { url: config.redis.url };

// Concurrency 1: Remotion SSR is CPU/memory intensive; run one render at a time.
const worker = new Worker<RenderVideoJobPayload>(
  QUEUE_RENDER,
  (job) => processRenderJob(job, { s3: s3Client, pool }),
  { connection, concurrency: 1 },
);

worker.on('completed', (job) => {
  console.log(`[render-worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[render-worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[render-worker] Worker error:', err.message);
});

console.log('[render-worker] Listening for jobs on queue:', QUEUE_RENDER);

async function shutdown(signal: string): Promise<void> {
  console.log(`[render-worker] Received ${signal}. Closing worker gracefully...`);
  await worker.close();
  console.log('[render-worker] Worker closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
