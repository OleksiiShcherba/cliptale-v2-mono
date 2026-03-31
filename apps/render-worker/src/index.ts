import { Worker } from 'bullmq';

import { config } from './config.js';

const QUEUE_RENDER = 'render';

const connection = { url: config.redis.url };

const worker = new Worker(
  QUEUE_RENDER,
  async (job) => {
    // Actual handler wired in a future subtask via apps/render-worker/src/jobs/render.job.ts.
    throw new Error(`No handler registered for job type: ${job.name}`);
  },
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
