import { Worker } from 'bullmq';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import { pool } from '@/lib/db.js';
import { processIngestJob } from '@/jobs/ingest.job.js';

const QUEUE_MEDIA_INGEST = 'media-ingest';

const connection = { url: config.redis.url };

const worker = new Worker<MediaIngestJobPayload>(
  QUEUE_MEDIA_INGEST,
  (job) => processIngestJob(job, { s3: s3Client, pool }),
  { connection, concurrency: 2 },
);

worker.on('completed', (job) => {
  console.log(`[media-worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[media-worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[media-worker] Worker error:', err.message);
});

console.log('[media-worker] Listening for jobs on queue:', QUEUE_MEDIA_INGEST);

async function shutdown(signal: string): Promise<void> {
  console.log(`[media-worker] Received ${signal}. Closing worker gracefully...`);
  await worker.close();
  console.log('[media-worker] Worker closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
