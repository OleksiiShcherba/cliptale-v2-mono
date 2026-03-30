import { Queue, Worker, type ConnectionOptions } from 'bullmq';

import { config } from '../config.js';

const connection: ConnectionOptions = { url: config.redis.url };

export const QUEUE_MEDIA_INGEST = 'media-ingest';
export const QUEUE_RENDER = 'render';
export const QUEUE_TRANSCRIPTION = 'transcription';

export const mediaIngestQueue = new Queue(QUEUE_MEDIA_INGEST, { connection });
export const renderQueue = new Queue(QUEUE_RENDER, { connection });
export const transcriptionQueue = new Queue(QUEUE_TRANSCRIPTION, { connection });

export { Worker, connection };
