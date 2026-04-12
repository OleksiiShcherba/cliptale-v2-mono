import Redis from 'ioredis';

import { config } from '@/config.js';

/**
 * Singleton ioredis client configured from `config.redis.url`.
 * Import this — never instantiate Redis elsewhere in the API app.
 */
export const redis = new Redis(config.redis.url, {
  // Suppress unhandled rejections when Redis is temporarily unavailable.
  lazyConnect: false,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  console.error('[redis] Connection error:', err.message);
});
