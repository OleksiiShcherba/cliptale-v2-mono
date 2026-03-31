import { Queue, type ConnectionOptions } from 'bullmq';

import { config } from '@/config.js';

export const QUEUE_MEDIA_INGEST = 'media-ingest';
export const QUEUE_RENDER = 'render';
export const QUEUE_TRANSCRIPTION = 'transcription';

/** Shared ioredis connection options derived from config — exported for use in enqueue helpers. */
export const connection: ConnectionOptions = { url: config.redis.url };

export const mediaIngestQueue = new Queue(QUEUE_MEDIA_INGEST, { connection });
export const renderQueue = new Queue(QUEUE_RENDER, { connection });
export const transcriptionQueue = new Queue(QUEUE_TRANSCRIPTION, { connection });

// Prevent unhandled promise rejections when Redis is temporarily unavailable.
for (const queue of [mediaIngestQueue, renderQueue, transcriptionQueue]) {
  queue.on('error', (err) => {
    console.error(`[bullmq] Queue "${queue.name}" error:`, err.message);
  });
}
