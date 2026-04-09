import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateVideo } from './pika-video.adapter.js';

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;
const mockDeps = { s3: mockS3, bucket: 'test-bucket', projectId: 'proj-1' };
const mockVideoBuffer = Buffer.from('fake-mp4');

describe('pika-video.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates generation and uploads completed video to S3', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-1', status: 'completed',
          video_url: 'https://pika.art/video.mp4', duration: 4, error: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const result = await generateVideo(
      'pika-key',
      { prompt: 'a dancing robot' },
      mockDeps,
    );

    expect(result.provider).toBe('pika');
    expect(result.model).toBe('pika-v2');
    expect(result.durationSeconds).toBe(4);
    expect(result.videoUrl).toMatch(/^s3:\/\/test-bucket\//);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('polls when generation is still processing', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-2', status: 'processing',
          video_url: null, duration: null, error: null,
        })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-2', status: 'completed',
          video_url: 'https://pika.art/out.mp4', duration: 4, error: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const promise = generateVideo('pika-key', { prompt: 'test' }, mockDeps);
    await vi.advanceTimersByTimeAsync(5_100);
    const result = await promise;

    expect(result.provider).toBe('pika');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Rate limited', { status: 429 }),
    );

    await expect(
      generateVideo('bad-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Pika API error (429)');
  });

  it('throws when generation fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'gen-3', status: 'failed',
        video_url: null, duration: null, error: 'NSFW detected',
      })),
    );

    await expect(
      generateVideo('pika-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('NSFW detected');
  });

  it('throws when no video URL in completed result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'gen-4', status: 'completed',
        video_url: null, duration: null, error: null,
      })),
    );

    await expect(
      generateVideo('pika-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('no video URL');
  });

  it('throws when video download fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-5', status: 'completed',
          video_url: 'https://pika.art/video.mp4', duration: 4, error: null,
        })),
      )
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    await expect(
      generateVideo('pika-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Failed to download video from Pika: 403');
  });

  it('throws when S3 upload fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-6', status: 'completed',
          video_url: 'https://pika.art/video.mp4', duration: 4, error: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));
    mockSend.mockRejectedValueOnce(new Error('S3 PutObject failed'));

    await expect(
      generateVideo('pika-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('S3 PutObject failed');
  });

  it('throws on poll API error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-7', status: 'processing',
          video_url: null, duration: null, error: null,
        })),
      )
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    const promise = generateVideo('pika-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('Pika poll error (502)');
  });

  it('throws on polling timeout', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-8', status: 'processing',
          video_url: null, duration: null, error: null,
        })),
      );
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({
        id: 'gen-8', status: 'processing',
        video_url: null, duration: null, error: null,
      }))),
    );

    const promise = generateVideo('pika-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1_000);

    await expect(promise).rejects.toThrow('timed out');
  });

  it('uses fallback duration when response has no duration', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'gen-9', status: 'completed',
          video_url: 'https://pika.art/video.mp4', duration: null, error: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const result = await generateVideo(
      'pika-key',
      { prompt: 'test', duration: 6 },
      mockDeps,
    );

    expect(result.durationSeconds).toBe(6);
  });
});
