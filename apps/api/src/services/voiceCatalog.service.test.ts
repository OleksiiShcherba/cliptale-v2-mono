import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis so no real Redis connection is attempted during unit tests.
vi.mock('@/lib/redis.js', () => ({ redis: {} }));
// Mock S3 client so no real AWS connection is attempted during unit tests.
vi.mock('@/lib/s3.js', () => ({ s3Client: {} }));

import {
  listAvailableVoices,
  getVoiceSampleUrl,
  type VoiceCatalogDeps,
} from './voiceCatalog.service.js';
import type { ElevenLabsVoice } from '@/lib/elevenlabs-catalog.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VOICE_1: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam-preview.mp3',
  labels: { accent: 'american', gender: 'male' },
};

const VOICE_2: ElevenLabsVoice = {
  voiceId: 'user-clone-abc',
  name: 'My Clone',
  category: 'cloned',
  description: 'Custom voice',
  previewUrl: 'https://cdn.elevenlabs.io/clone-preview.mp3',
  labels: {},
};

const VOICES = [VOICE_1, VOICE_2];

const SAMPLE_S3_KEY = 'elevenlabs/voice-samples/pNInz6obpgDQGcFmaJgB.mp3';
const SAMPLE_PRESIGNED_URL = 'https://s3.example.com/sample-presigned';
const SAMPLE_AUDIO_BUFFER = Buffer.from('fake-mp3-bytes');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<VoiceCatalogDeps> = {}): VoiceCatalogDeps {
  return {
    redis: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      setPermanent: vi.fn().mockResolvedValue('OK'),
    },
    listVoices: vi.fn().mockResolvedValue(VOICES),
    downloadBuffer: vi.fn().mockResolvedValue(SAMPLE_AUDIO_BUFFER),
    uploadSample: vi.fn().mockResolvedValue(undefined),
    getPresignedUrl: vi.fn().mockResolvedValue(SAMPLE_PRESIGNED_URL),
    ...overrides,
  };
}

// ── listAvailableVoices ────────────────────────────────────────────────────────

describe('voiceCatalog.service / listAvailableVoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed voices from Redis cache when cache is populated', async () => {
    const deps = makeDeps({
      redis: {
        get: vi.fn().mockResolvedValue(JSON.stringify(VOICES)),
        set: vi.fn(),
        setPermanent: vi.fn(),
      },
    });

    const result = await listAvailableVoices(deps);

    expect(result).toEqual(VOICES);
    expect(deps.listVoices).not.toHaveBeenCalled();
    expect(deps.redis.set).not.toHaveBeenCalled();
  });

  it('fetches from ElevenLabs on cache miss, stores in Redis with 3600s TTL, and returns voices', async () => {
    const deps = makeDeps();

    const result = await listAvailableVoices(deps);

    expect(result).toEqual(VOICES);
    expect(deps.listVoices).toHaveBeenCalledOnce();
    expect(deps.redis.set).toHaveBeenCalledOnce();

    const [key, value, mode, ttl] = (deps.redis.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe('elevenlabs:voices:catalog');
    expect(JSON.parse(value as string)).toEqual(VOICES);
    expect(mode).toBe('EX');
    expect(ttl).toBe(3600);
  });

  it('returns an empty array when ElevenLabs responds with no voices', async () => {
    const deps = makeDeps({ listVoices: vi.fn().mockResolvedValue([]) });

    const result = await listAvailableVoices(deps);

    expect(result).toEqual([]);
    expect(deps.redis.set).toHaveBeenCalledOnce();
  });

  it('propagates errors from the ElevenLabs catalog client', async () => {
    const catalogError = new Error('ElevenLabs API unavailable');
    const deps = makeDeps({ listVoices: vi.fn().mockRejectedValue(catalogError) });

    await expect(listAvailableVoices(deps)).rejects.toThrow('ElevenLabs API unavailable');
    expect(deps.redis.set).not.toHaveBeenCalled();
  });

  it('propagates errors from Redis get', async () => {
    const redisError = new Error('Redis connection failed');
    const deps = makeDeps({
      redis: {
        get: vi.fn().mockRejectedValue(redisError),
        set: vi.fn(),
        setPermanent: vi.fn(),
      },
    });

    await expect(listAvailableVoices(deps)).rejects.toThrow('Redis connection failed');
    expect(deps.listVoices).not.toHaveBeenCalled();
  });
});

// ── getVoiceSampleUrl ─────────────────────────────────────────────────────────

describe('voiceCatalog.service / getVoiceSampleUrl', () => {
  const VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
  const PREVIEW_URL = 'https://cdn.elevenlabs.io/adam-preview.mp3';
  const REDIS_KEY = `elevenlabs:voice-sample:${VOICE_ID}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns presigned URL from S3 key cached in Redis on cache hit', async () => {
    const deps = makeDeps({
      redis: {
        get: vi.fn().mockResolvedValue(SAMPLE_S3_KEY),
        set: vi.fn(),
        setPermanent: vi.fn(),
      },
    });

    const result = await getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps);

    expect(result).toBe(SAMPLE_PRESIGNED_URL);
    expect(deps.getPresignedUrl).toHaveBeenCalledWith(SAMPLE_S3_KEY);
    expect(deps.downloadBuffer).not.toHaveBeenCalled();
    expect(deps.uploadSample).not.toHaveBeenCalled();
    expect(deps.redis.setPermanent).not.toHaveBeenCalled();
  });

  it('downloads, uploads to S3, caches S3 key permanently, and returns presigned URL on cache miss', async () => {
    const deps = makeDeps();

    const result = await getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps);

    expect(result).toBe(SAMPLE_PRESIGNED_URL);

    // Should have checked Redis for cached key
    expect(deps.redis.get).toHaveBeenCalledWith(REDIS_KEY);

    // Should have downloaded from ElevenLabs CDN
    expect(deps.downloadBuffer).toHaveBeenCalledWith(PREVIEW_URL);

    // Should have uploaded to S3 with correct key
    expect(deps.uploadSample).toHaveBeenCalledWith(SAMPLE_S3_KEY, SAMPLE_AUDIO_BUFFER);

    // Should have stored S3 key in Redis permanently (no TTL)
    expect(deps.redis.setPermanent).toHaveBeenCalledWith(REDIS_KEY, SAMPLE_S3_KEY);

    // Should have generated presigned URL from S3 key
    expect(deps.getPresignedUrl).toHaveBeenCalledWith(SAMPLE_S3_KEY);
  });

  it('uses the correct S3 key pattern: elevenlabs/voice-samples/{voiceId}.mp3', async () => {
    const deps = makeDeps();

    await getVoiceSampleUrl('some-voice-id', PREVIEW_URL, deps);

    expect(deps.uploadSample).toHaveBeenCalledWith(
      'elevenlabs/voice-samples/some-voice-id.mp3',
      expect.any(Buffer),
    );
    expect(deps.redis.setPermanent).toHaveBeenCalledWith(
      'elevenlabs:voice-sample:some-voice-id',
      'elevenlabs/voice-samples/some-voice-id.mp3',
    );
    expect(deps.getPresignedUrl).toHaveBeenCalledWith(
      'elevenlabs/voice-samples/some-voice-id.mp3',
    );
  });

  it('does not call set (with TTL) — only setPermanent — for sample caching', async () => {
    const deps = makeDeps();

    await getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps);

    expect(deps.redis.set).not.toHaveBeenCalled();
    expect(deps.redis.setPermanent).toHaveBeenCalledOnce();
  });

  it('propagates errors from downloadBuffer', async () => {
    const downloadError = new Error('Failed to download voice sample: 404 Not Found');
    const deps = makeDeps({ downloadBuffer: vi.fn().mockRejectedValue(downloadError) });

    await expect(getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps)).rejects.toThrow(
      'Failed to download voice sample: 404 Not Found',
    );
    expect(deps.uploadSample).not.toHaveBeenCalled();
    expect(deps.redis.setPermanent).not.toHaveBeenCalled();
  });

  it('propagates errors from uploadSample', async () => {
    const uploadError = new Error('S3 upload failed');
    const deps = makeDeps({ uploadSample: vi.fn().mockRejectedValue(uploadError) });

    await expect(getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps)).rejects.toThrow(
      'S3 upload failed',
    );
    expect(deps.redis.setPermanent).not.toHaveBeenCalled();
  });

  it('propagates errors from Redis get', async () => {
    const redisError = new Error('Redis unavailable');
    const deps = makeDeps({
      redis: {
        get: vi.fn().mockRejectedValue(redisError),
        set: vi.fn(),
        setPermanent: vi.fn(),
      },
    });

    await expect(getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps)).rejects.toThrow(
      'Redis unavailable',
    );
    expect(deps.downloadBuffer).not.toHaveBeenCalled();
  });

  it('propagates errors from getPresignedUrl on cache hit', async () => {
    const presignError = new Error('S3 presign failed');
    const deps = makeDeps({
      redis: {
        get: vi.fn().mockResolvedValue(SAMPLE_S3_KEY),
        set: vi.fn(),
        setPermanent: vi.fn(),
      },
      getPresignedUrl: vi.fn().mockRejectedValue(presignError),
    });

    await expect(getVoiceSampleUrl(VOICE_ID, PREVIEW_URL, deps)).rejects.toThrow(
      'S3 presign failed',
    );
  });
});
