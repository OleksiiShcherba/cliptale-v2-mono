import { Worker } from 'bullmq';

import { config } from './config.js';

const QUEUE_RENDER = 'render';

const connection = { url: config.redis.url };

const worker = new Worker(
  QUEUE_RENDER,
  async (job) => {
    // Job handlers are registered here as the codebase grows.
    // See apps/render-worker/src/jobs/render.job.ts (future subtask).
    throw new Error(`No handler registered for job type: ${job.name}`);
  },
  { connection },
);

worker.on('completed', (job) => {
  console.log(`[render-worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[render-worker] Job ${job?.id} failed:`, err.message);
});

console.log('[render-worker] Listening for jobs on queue:', QUEUE_RENDER);
