import { Queue, type ConnectionOptions } from 'bullmq';

import { config } from '@/config.js';

export const QUEUE_MEDIA_INGEST = 'media-ingest';
export const QUEUE_RENDER = 'render';
export const QUEUE_TRANSCRIPTION = 'transcription';
export const QUEUE_AI_GENERATE = 'ai-generate';

/** Shared ioredis connection options derived from config — exported for use in enqueue helpers. */
export const connection: ConnectionOptions = { url: config.redis.url };

export const mediaIngestQueue = new Queue(QUEUE_MEDIA_INGEST, { connection });
export const renderQueue = new Queue(QUEUE_RENDER, { connection });
export const transcriptionQueue = new Queue(QUEUE_TRANSCRIPTION, { connection });
export const aiGenerateQueue = new Queue(QUEUE_AI_GENERATE, { connection });

// Prevent unhandled promise rejections when Redis is temporarily unavailable.
for (const queue of [mediaIngestQueue, renderQueue, transcriptionQueue, aiGenerateQueue]) {
  queue.on('error', (err) => {
    console.error(`[bullmq] Queue "${queue.name}" error:`, err.message);
  });
}
