import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';

import { processAiGenerateJob, type AiGenerateJobPayload } from './ai-generate.job.js';

const mockExecute = vi.fn().mockResolvedValue([]);
const mockPool = { execute: mockExecute } as unknown as Pool;
const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;
const mockDeps = { s3: mockS3, pool: mockPool, bucket: 'test-bucket' };

function makeJob(overrides: Partial<AiGenerateJobPayload> = {}): Job<AiGenerateJobPayload> {
  return {
    data: {
      jobId: 'job-1',
      userId: 'user-1',
      projectId: 'proj-1',
      type: 'image',
      provider: 'openai',
      apiKey: 'test-key',
      prompt: 'a cat',
      options: null,
      ...overrides,
    },
  } as Job<AiGenerateJobPayload>;
}

// Mock all adapter modules — return full metadata
vi.mock('@/providers/openai-image.adapter.js', () => ({
  generateImage: vi.fn().mockResolvedValue({
    imageUrl: 's3://bucket/image.png', width: 1024, height: 1024, provider: 'openai', model: 'dall-e-3',
  }),
}));
vi.mock('@/providers/stability-image.adapter.js', () => ({
  generateImage: vi.fn().mockResolvedValue({
    imageUrl: 's3://bucket/image.png', width: 1024, height: 1024, provider: 'stability_ai', model: 'sd-xl',
  }),
}));
vi.mock('@/providers/replicate-image.adapter.js', () => ({
  generateImage: vi.fn().mockResolvedValue({
    imageUrl: 's3://bucket/image.png', width: 1024, height: 1024, provider: 'replicate', model: 'flux',
  }),
}));
vi.mock('@/providers/runway-video.adapter.js', () => ({
  generateVideo: vi.fn().mockResolvedValue({
    videoUrl: 's3://bucket/video.mp4', width: 1920, height: 1080, durationSeconds: 5, provider: 'runway', model: 'gen-3',
  }),
}));
vi.mock('@/providers/kling-video.adapter.js', () => ({
  generateVideo: vi.fn().mockResolvedValue({
    videoUrl: 's3://bucket/video.mp4', width: 1920, height: 1080, durationSeconds: 5, provider: 'kling', model: 'kling-v1',
  }),
}));
vi.mock('@/providers/pika-video.adapter.js', () => ({
  generateVideo: vi.fn().mockResolvedValue({
    videoUrl: 's3://bucket/video.mp4', width: 1920, height: 1080, durationSeconds: 5, provider: 'pika', model: 'pika-v1',
  }),
}));
vi.mock('@/providers/elevenlabs-audio.adapter.js', () => ({
  generateAudio: vi.fn().mockResolvedValue({
    audioUrl: 's3://bucket/audio.mp3', durationSeconds: 10, provider: 'elevenlabs', model: 'v2',
  }),
}));
vi.mock('@/providers/suno-audio.adapter.js', () => ({
  generateAudio: vi.fn().mockResolvedValue({
    audioUrl: 's3://bucket/audio.mp3', durationSeconds: 10, provider: 'suno', model: 'v3',
  }),
}));

describe('ai-generate.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([]);
  });

  it('routes image/openai to openai adapter, creates asset, and marks completed', async () => {
    await processAiGenerateJob(makeJob({ type: 'image', provider: 'openai' }), mockDeps);

    // 1st call: set status to processing
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?'),
      ['processing', null, 'job-1'],
    );
    // 2nd call: insert asset into project_assets_current
    const insertCall = mockExecute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(insertCall).toBeTruthy();
    const insertParams = insertCall![1] as unknown[];
    // [assetId, projectId, userId, filename, contentType, storageUri, width, height]
    expect(insertParams[1]).toBe('proj-1');
    expect(insertParams[2]).toBe('user-1');
    expect(insertParams[3]).toMatch(/^ai-openai-/);
    expect(insertParams[4]).toBe('image/png');
    expect(insertParams[5]).toBe('s3://bucket/image.png');
    expect(insertParams[6]).toBe(1024);
    expect(insertParams[7]).toBe(1024);

    // 3rd call: set completed with result URL and asset ID
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      ['s3://bucket/image.png', expect.any(String), 'job-1'],
    );
  });

  it('creates asset with video metadata for video generation', async () => {
    await processAiGenerateJob(makeJob({ type: 'video', provider: 'runway' }), mockDeps);

    const insertCall = mockExecute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(insertCall).toBeTruthy();
    const params = insertCall![1] as unknown[];
    expect(params[3]).toMatch(/^ai-runway-/);
    expect(params[4]).toBe('video/mp4');
    expect(params[5]).toBe('s3://bucket/video.mp4');
    expect(params[6]).toBe(1920);
    expect(params[7]).toBe(1080);
  });

  it('creates asset with null dimensions for audio generation', async () => {
    await processAiGenerateJob(makeJob({ type: 'audio', provider: 'elevenlabs' }), mockDeps);

    const insertCall = mockExecute.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
    );
    expect(insertCall).toBeTruthy();
    const params = insertCall![1] as unknown[];
    expect(params[3]).toMatch(/^ai-elevenlabs-/);
    expect(params[4]).toBe('audio/mpeg');
    expect(params[5]).toBe('s3://bucket/audio.mp3');
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });

  it('routes image/stability_ai to stability adapter', async () => {
    await processAiGenerateJob(makeJob({ type: 'image', provider: 'stability_ai' }), mockDeps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      ['s3://bucket/image.png', expect.any(String), 'job-1'],
    );
  });

  it('routes image/replicate to replicate adapter', async () => {
    await processAiGenerateJob(makeJob({ type: 'image', provider: 'replicate' }), mockDeps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      ['s3://bucket/image.png', expect.any(String), 'job-1'],
    );
  });

  it('routes video/kling to kling adapter', async () => {
    await processAiGenerateJob(makeJob({ type: 'video', provider: 'kling' }), mockDeps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      ['s3://bucket/video.mp4', expect.any(String), 'job-1'],
    );
  });

  it('routes video/pika to pika adapter', async () => {
    await processAiGenerateJob(makeJob({ type: 'video', provider: 'pika' }), mockDeps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      ['s3://bucket/video.mp4', expect.any(String), 'job-1'],
    );
  });

  it('routes audio/suno to suno adapter', async () => {
    await processAiGenerateJob(makeJob({ type: 'audio', provider: 'suno' }), mockDeps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      ['s3://bucket/audio.mp3', expect.any(String), 'job-1'],
    );
  });

  it('throws and marks failed for unsupported type', async () => {
    const job = makeJob({ type: 'text' as 'image' });

    await expect(processAiGenerateJob(job, mockDeps)).rejects.toThrow('Unsupported generation type: text');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?'),
      ['failed', 'Unsupported generation type: text', 'job-1'],
    );
  });

  it('throws and marks failed for unknown provider', async () => {
    const job = makeJob({ type: 'image', provider: 'unknown' });

    await expect(processAiGenerateJob(job, mockDeps)).rejects.toThrow('Unknown image provider: unknown');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?'),
      ['failed', 'Unknown image provider: unknown', 'job-1'],
    );
  });

  it('throws and marks failed when adapter throws', async () => {
    const { generateImage } = await import('@/providers/openai-image.adapter.js');
    vi.mocked(generateImage).mockRejectedValueOnce(new Error('OpenAI rate limited'));

    const job = makeJob({ type: 'image', provider: 'openai' });

    await expect(processAiGenerateJob(job, mockDeps)).rejects.toThrow('OpenAI rate limited');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?'),
      ['failed', 'OpenAI rate limited', 'job-1'],
    );
  });

  it('does not create an asset when adapter fails', async () => {
    const { generateImage } = await import('@/providers/openai-image.adapter.js');
    vi.mocked(generateImage).mockRejectedValueOnce(new Error('API error'));

    const job = makeJob({ type: 'image', provider: 'openai' });

    await expect(processAiGenerateJob(job, mockDeps)).rejects.toThrow('API error');

    // Should NOT have an INSERT INTO project_assets_current call
    const insertCalls = mockExecute.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO project_assets_current'),
    );
    expect(insertCalls).toHaveLength(0);
  });
});
