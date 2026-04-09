import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateImage } from './openai-image.adapter.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;

const mockDeps = {
  s3: mockS3,
  bucket: 'test-bucket',
  projectId: 'proj-123',
};

const fakeImageBase64 = Buffer.from('fake-png-data').toString('base64');

const mockDalleResponse = {
  data: [{ b64_json: fakeImageBase64 }],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('openai-image.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls DALL-E API with response_format b64_json and uploads to S3', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDalleResponse)));

    const result = await generateImage(
      'sk-test',
      { prompt: 'a sunset', size: '1024x1024' },
      mockDeps,
    );

    // Verify DALL-E API call
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      }),
    );

    // Verify response_format is b64_json
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.response_format).toBe('b64_json');

    // Verify S3 upload
    expect(mockSend).toHaveBeenCalledOnce();

    // Verify result
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('dall-e-3');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.imageUrl).toMatch(/^s3:\/\/test-bucket\/projects\/proj-123\/ai-generated\//);
  });

  it('throws on API error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Rate limit exceeded', { status: 429 }),
    );

    await expect(
      generateImage('sk-test', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('OpenAI DALL-E API error (429)');
  });

  it('throws when no image data in response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] })),
    );

    await expect(
      generateImage('sk-test', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('no image data');
  });

  it('uses default size when not specified', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDalleResponse)));

    const result = await generateImage(
      'sk-test',
      { prompt: 'test' },
      mockDeps,
    );

    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  it('passes style parameter when provided', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDalleResponse)));

    await generateImage(
      'sk-test',
      { prompt: 'test', style: 'vivid' },
      mockDeps,
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.style).toBe('vivid');
  });

  it('throws when S3 upload fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDalleResponse)));

    const failingS3 = {
      send: vi.fn().mockRejectedValueOnce(new Error('S3 access denied')),
    } as unknown as S3Client;

    const depsWithFailingS3 = { ...mockDeps, s3: failingS3 };

    await expect(
      generateImage('sk-test', { prompt: 'test' }, depsWithFailingS3),
    ).rejects.toThrow('S3 access denied');
  });

  it('only makes a single fetch call (no separate image download)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDalleResponse)));

    await generateImage('sk-test', { prompt: 'test' }, mockDeps);

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
