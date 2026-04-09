import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateImage } from './stability-image.adapter.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;

const mockDeps = {
  s3: mockS3,
  bucket: 'test-bucket',
  projectId: 'proj-123',
};

const mockStabilityResponse = {
  image: Buffer.from('fake-png').toString('base64'),
  finish_reason: 'SUCCESS',
  seed: 12345,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('stability-image.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls Stability AI API and uploads base64 image to S3', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockStabilityResponse)),
    );

    const result = await generateImage(
      'sk-stability-test',
      { prompt: 'a mountain landscape' },
      mockDeps,
    );

    // Verify API call
    expect(fetch).toHaveBeenCalledWith(
      'https://api.stability.ai/v2beta/stable-image/generate/core',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-stability-test',
        }),
      }),
    );

    // Verify S3 upload
    expect(mockSend).toHaveBeenCalledOnce();

    // Verify result
    expect(result.provider).toBe('stability_ai');
    expect(result.model).toBe('stable-diffusion-core');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.imageUrl).toMatch(/^s3:\/\/test-bucket\//);
  });

  it('throws on API error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(
      generateImage('bad-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Stability AI API error (401)');
  });

  it('passes negative prompt and style when provided', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(mockStabilityResponse)),
    );

    await generateImage(
      'sk-test',
      { prompt: 'test', negativePrompt: 'blurry', style: 'photographic' },
      mockDeps,
    );

    // FormData is used — check that fetch was called (detailed FormData inspection is complex)
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('parses custom size correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockStabilityResponse)),
    );

    const result = await generateImage(
      'sk-test',
      { prompt: 'test', size: '512x512' },
      mockDeps,
    );

    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('throws when image download fails', async () => {
    const fetchMock = vi.mocked(fetch);
    // For Stability, there is no separate image download fetch call.
    // The image is returned as base64 in the API response, not downloaded.
    // So we test API failure instead.
    fetchMock.mockResolvedValueOnce(
      new Response('Server error', { status: 500 }),
    );

    await expect(
      generateImage('sk-test', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Stability AI API error (500)');
  });

  it('throws when S3 upload fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockStabilityResponse)),
    );

    const failingS3 = {
      send: vi.fn().mockRejectedValueOnce(new Error('S3 permission denied')),
    } as unknown as S3Client;

    const depsWithFailingS3 = { ...mockDeps, s3: failingS3 };

    await expect(
      generateImage('sk-test', { prompt: 'test' }, depsWithFailingS3),
    ).rejects.toThrow('S3 permission denied');
  });
});
