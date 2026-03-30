import { Worker } from 'bullmq';

import { config } from './config.js';

const QUEUE_MEDIA_INGEST = 'media-ingest';

const connection = { url: config.redis.url };

const worker = new Worker(
  QUEUE_MEDIA_INGEST,
  async (job) => {
    // Job handlers are registered here as the codebase grows.
    // See apps/media-worker/src/jobs/ingest.job.ts (subtask 6).
    throw new Error(`No handler registered for job type: ${job.name}`);
  },
  { connection },
);

worker.on('completed', (job) => {
  console.log(`[media-worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[media-worker] Job ${job?.id} failed:`, err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_MEDIA_INGEST);
