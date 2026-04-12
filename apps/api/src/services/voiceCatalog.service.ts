/**
 * Voice catalog service — ElevenLabs voice listing with Redis caching,
 * and voice sample proxying with S3 + Redis caching.
 *
 * `listAvailableVoices` implements a read-through cache:
 *   1. Check Redis key `elevenlabs:voices:catalog`
 *   2. On hit — parse and return
 *   3. On miss — call ElevenLabs API, store in Redis (3600s TTL), return
 *
 * `getVoiceSampleUrl` implements a two-tier cache:
 *   1. Check Redis key `elevenlabs:voice-sample:{voiceId}` for the S3 key
 *   2. On hit — generate fresh presigned GET URL from stored S3 key, return
 *   3. On miss — download MP3 bytes from previewUrl, upload to S3,
 *      store S3 key in Redis (permanent — no TTL), generate presigned URL, return
 *
 * Redis and the ElevenLabs catalog client are injected via `deps` to keep
 * all external I/O mockable in unit tests.
 */

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ElevenLabsVoice } from '@/lib/elevenlabs-catalog.js';
import { listVoices } from '@/lib/elevenlabs-catalog.js';
import { redis } from '@/lib/redis.js';
import { s3Client } from '@/lib/s3.js';
import { config } from '@/config.js';

// ── Cache keys ───────────────────────────────────────────────────────────────

const CATALOG_KEY = 'elevenlabs:voices:catalog';
const CATALOG_TTL_SECONDS = 3600;

const SAMPLE_REDIS_KEY_PREFIX = 'elevenlabs:voice-sample:';
const SAMPLE_S3_KEY_PREFIX = 'elevenlabs/voice-samples/';
const SAMPLE_URL_EXPIRY_SECONDS = 3600;

// ── Dependency injection types ────────────────────────────────────────────────

/** Subset of ioredis API needed by the voice catalog service. */
export type RedisDeps = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  /** Stores a key permanently (no TTL). */
  setPermanent(key: string, value: string): Promise<unknown>;
};

/** External I/O dependencies for the voice catalog service. */
export type VoiceCatalogDeps = {
  redis: RedisDeps;
  listVoices: (apiKey: string) => Promise<ElevenLabsVoice[]>;
  /** Downloads raw bytes from a URL (used for ElevenLabs CDN sample audio). */
  downloadBuffer: (url: string) => Promise<Buffer>;
  /** Uploads a buffer to S3 at the given key with audio/mpeg content type. */
  uploadSample: (key: string, body: Buffer) => Promise<void>;
  /** Returns a presigned S3 GET URL valid for SAMPLE_URL_EXPIRY_SECONDS. */
  getPresignedUrl: (key: string) => Promise<string>;
};

// ── Default production dependencies ──────────────────────────────────────────

async function defaultDownloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download voice sample: ${response.status} ${response.statusText}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function defaultUploadSample(key: string, body: Buffer): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: 'audio/mpeg',
    }),
  );
}

async function defaultGetPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
    { expiresIn: SAMPLE_URL_EXPIRY_SECONDS },
  );
}

/** Production-wired deps — used when the caller does not inject overrides. */
const defaultDeps: VoiceCatalogDeps = {
  redis: {
    get: (key) => redis.get(key),
    set: (key, value, mode, ttl) => redis.set(key, value, mode, ttl),
    setPermanent: (key, value) => redis.set(key, value),
  },
  listVoices,
  downloadBuffer: defaultDownloadBuffer,
  uploadSample: defaultUploadSample,
  getPresignedUrl: defaultGetPresignedUrl,
};

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Returns all available ElevenLabs voices.
 * Serves from Redis cache when available (1hr TTL); fetches on cache miss.
 */
export async function listAvailableVoices(
  deps: VoiceCatalogDeps = defaultDeps,
): Promise<ElevenLabsVoice[]> {
  const cached = await deps.redis.get(CATALOG_KEY);
  if (cached !== null) {
    return JSON.parse(cached) as ElevenLabsVoice[];
  }

  const voices = await deps.listVoices(config.elevenlabs.apiKey);
  await deps.redis.set(CATALOG_KEY, JSON.stringify(voices), 'EX', CATALOG_TTL_SECONDS);
  return voices;
}

/**
 * Returns a presigned S3 URL for a voice audio sample.
 *
 * Cache strategy:
 *   - Redis hit  → return fresh presigned URL from stored S3 key (instant)
 *   - Redis miss → download MP3 from `previewUrl`, upload to S3, cache S3 key
 *                  in Redis (permanent), return presigned URL
 *
 * @param voiceId   - ElevenLabs voice_id used for the cache key and S3 path.
 * @param previewUrl - ElevenLabs CDN URL for the sample MP3 (used on cache miss only).
 */
export async function getVoiceSampleUrl(
  voiceId: string,
  previewUrl: string,
  deps: VoiceCatalogDeps = defaultDeps,
): Promise<string> {
  const redisKey = `${SAMPLE_REDIS_KEY_PREFIX}${voiceId}`;

  const cachedS3Key = await deps.redis.get(redisKey);
  if (cachedS3Key !== null) {
    return deps.getPresignedUrl(cachedS3Key);
  }

  const s3Key = `${SAMPLE_S3_KEY_PREFIX}${voiceId}.mp3`;
  const audioBytes = await deps.downloadBuffer(previewUrl);
  await deps.uploadSample(s3Key, audioBytes);
  await deps.redis.setPermanent(redisKey, s3Key);

  return deps.getPresignedUrl(s3Key);
}
