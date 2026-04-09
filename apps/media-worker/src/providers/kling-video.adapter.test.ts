import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateVideo } from './kling-video.adapter.js';

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;
const mockDeps = { s3: mockS3, bucket: 'test-bucket', projectId: 'proj-1' };
const mockVideoBuffer = Buffer.from('fake-mp4');

describe('kling-video.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates task and uploads completed video to S3', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-1' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-1', task_status: 'succeed',
            task_result: { videos: [{ url: 'https://kling.com/video.mp4', duration: '5.0' }] },
          },
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const promise = generateVideo('kling-key', { prompt: 'a sunset' }, mockDeps);
    await vi.advanceTimersByTimeAsync(5_100);
    const result = await promise;

    expect(result.provider).toBe('kling');
    expect(result.model).toBe('kling-v1');
    expect(result.durationSeconds).toBe(5);
    expect(result.videoUrl).toMatch(/^s3:\/\/test-bucket\//);
  });

  it('throws on task creation API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );

    await expect(
      generateVideo('bad-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Kling API error (403)');
  });

  it('throws when task fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-2' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-2', task_status: 'failed',
            task_status_msg: 'Insufficient credits',
          },
        })),
      );

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {}); // prevent unhandled rejection warning during timer advance
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('Insufficient credits');
  });

  it('throws when no video URL in result', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-3' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-3', task_status: 'succeed',
            task_result: { videos: [] },
          },
        })),
      );

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {}); // prevent unhandled rejection warning during timer advance
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('no video URL');
  });

  it('uses duration from response when available', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-4' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-4', task_status: 'succeed',
            task_result: { videos: [{ url: 'https://kling.com/v.mp4', duration: '8.5' }] },
          },
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    await vi.advanceTimersByTimeAsync(5_100);
    const result = await promise;

    expect(result.durationSeconds).toBe(8.5);
  });

  it('falls back to options duration when response has no duration', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-5' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-5', task_status: 'succeed',
            task_result: { videos: [{ url: 'https://kling.com/v.mp4' }] },
          },
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const promise = generateVideo('kling-key', { prompt: 'test', duration: 8 }, mockDeps);
    await vi.advanceTimersByTimeAsync(5_100);
    const result = await promise;

    expect(result.durationSeconds).toBe(8);
  });

  it('throws when video download fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-6' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-6', task_status: 'succeed',
            task_result: { videos: [{ url: 'https://kling.com/v.mp4', duration: '5' }] },
          },
        })),
      )
      .mockResolvedValueOnce(new Response('Gone', { status: 410 }));

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('Failed to download video from Kling: 410');
  });

  it('throws when S3 upload fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-7' } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            task_id: 'kt-7', task_status: 'succeed',
            task_result: { videos: [{ url: 'https://kling.com/v.mp4', duration: '5' }] },
          },
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));
    mockSend.mockRejectedValueOnce(new Error('S3 PutObject failed'));

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('S3 PutObject failed');
  });

  it('throws on poll API error', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-8' } })),
      )
      .mockResolvedValueOnce(new Response('Internal Error', { status: 500 }));

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('Kling poll error (500)');
  });

  it('throws on polling timeout', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { task_id: 'kt-9' } })),
      );
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: { task_id: 'kt-9', task_status: 'processing' },
      }))),
    );

    const promise = generateVideo('kling-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1_000);

    await expect(promise).rejects.toThrow('timed out');
  });
});
