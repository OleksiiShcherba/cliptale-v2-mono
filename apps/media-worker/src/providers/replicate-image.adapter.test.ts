import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateImage } from './replicate-image.adapter.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;

const mockDeps = {
  s3: mockS3,
  bucket: 'test-bucket',
  projectId: 'proj-123',
};

const mockImageBuffer = Buffer.from('fake-png-data');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('replicate-image.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates prediction and uploads completed result to S3', async () => {
    const fetchMock = vi.mocked(fetch);
    // Create prediction — returns succeeded immediately (Prefer: wait)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-1',
            status: 'succeeded',
            output: ['https://replicate.delivery/output.png'],
            error: null,
          }),
        ),
      )
      // Download image
      .mockResolvedValueOnce(new Response(mockImageBuffer));

    const result = await generateImage(
      'r8-test',
      { prompt: 'a cat astronaut' },
      mockDeps,
    );

    expect(result.provider).toBe('replicate');
    expect(result.model).toBe('black-forest-labs/flux-schnell');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.imageUrl).toMatch(/^s3:\/\/test-bucket\//);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('polls for completion when prediction is still processing', async () => {
    const fetchMock = vi.mocked(fetch);
    // Create prediction — returns processing
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-2',
            status: 'processing',
            output: null,
            error: null,
          }),
        ),
      )
      // First poll — still processing
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-2',
            status: 'processing',
            output: null,
            error: null,
          }),
        ),
      )
      // Second poll — succeeded
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-2',
            status: 'succeeded',
            output: ['https://replicate.delivery/result.png'],
            error: null,
          }),
        ),
      )
      // Download image
      .mockResolvedValueOnce(new Response(mockImageBuffer));

    const promise = generateImage('r8-test', { prompt: 'test' }, mockDeps);

    // Advance past the two poll intervals (3s each)
    await vi.advanceTimersByTimeAsync(3_100);
    await vi.advanceTimersByTimeAsync(3_100);

    const result = await promise;

    expect(result.provider).toBe('replicate');
    // 1 create + 2 polls + 1 download = 4 fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws on create prediction API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Invalid token', { status: 401 }),
    );

    await expect(
      generateImage('bad-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Replicate API error (401)');
  });

  it('throws when prediction fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'pred-3',
          status: 'failed',
          output: null,
          error: 'NSFW content detected',
        }),
      ),
    );

    await expect(
      generateImage('r8-test', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('NSFW content detected');
  });

  it('throws when prediction returns no output URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'pred-4',
          status: 'succeeded',
          output: [],
          error: null,
        }),
      ),
    );

    await expect(
      generateImage('r8-test', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('no output URL');
  });

  it('passes negative prompt and custom size', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-5',
            status: 'succeeded',
            output: ['https://replicate.delivery/out.png'],
            error: null,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(mockImageBuffer));

    const result = await generateImage(
      'r8-test',
      { prompt: 'test', size: '512x768', negativePrompt: 'blurry' },
      mockDeps,
    );

    expect(result.width).toBe(512);
    expect(result.height).toBe(768);

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.input.negative_prompt).toBe('blurry');
    expect(body.input.width).toBe(512);
    expect(body.input.height).toBe(768);
  });

  it('throws when image download fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-6',
            status: 'succeeded',
            output: ['https://replicate.delivery/bad.png'],
            error: null,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await expect(
      generateImage('r8-test', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Failed to download image from Replicate');
  });

  it('throws when S3 upload fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred-7',
            status: 'succeeded',
            output: ['https://replicate.delivery/out.png'],
            error: null,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(mockImageBuffer));

    const failingS3 = {
      send: vi.fn().mockRejectedValueOnce(new Error('S3 bucket full')),
    } as unknown as S3Client;

    const depsWithFailingS3 = { ...mockDeps, s3: failingS3 };

    await expect(
      generateImage('r8-test', { prompt: 'test' }, depsWithFailingS3),
    ).rejects.toThrow('S3 bucket full');
  });

});
