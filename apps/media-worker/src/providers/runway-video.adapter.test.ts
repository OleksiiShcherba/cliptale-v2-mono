import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateVideo } from './runway-video.adapter.js';

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;
const mockDeps = { s3: mockS3, bucket: 'test-bucket', projectId: 'proj-1' };
const mockVideoBuffer = Buffer.from('fake-mp4');

describe('runway-video.adapter', () => {
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
        new Response(JSON.stringify({
          id: 'task-1', status: 'SUCCEEDED',
          output: ['https://runway.com/video.mp4'], failure: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const result = await generateVideo(
      'rw-key',
      { prompt: 'a flying car', duration: 10 },
      mockDeps,
    );

    expect(result.provider).toBe('runway');
    expect(result.model).toBe('gen4_turbo');
    expect(result.durationSeconds).toBe(10);
    expect(result.videoUrl).toMatch(/^s3:\/\/test-bucket\//);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('polls when task is still pending', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-2', status: 'PENDING', output: null, failure: null,
        })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-2', status: 'SUCCEEDED',
          output: ['https://runway.com/out.mp4'], failure: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));

    const promise = generateVideo('rw-key', { prompt: 'test' }, mockDeps);
    await vi.advanceTimersByTimeAsync(5_100);
    const result = await promise;

    expect(result.provider).toBe('runway');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws on task creation API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(
      generateVideo('bad-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Runway API error (401)');
  });

  it('throws when task fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'task-3', status: 'FAILED',
        output: null, failure: 'Content policy violation',
      })),
    );

    await expect(
      generateVideo('rw-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Content policy violation');
  });

  it('throws when no output URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'task-4', status: 'SUCCEEDED', output: [], failure: null,
      })),
    );

    await expect(
      generateVideo('rw-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('no output URL');
  });

  it('throws when video download fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-5', status: 'SUCCEEDED',
          output: ['https://runway.com/video.mp4'], failure: null,
        })),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await expect(
      generateVideo('rw-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('Failed to download video from Runway: 404');
  });

  it('throws when S3 upload fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-6', status: 'SUCCEEDED',
          output: ['https://runway.com/video.mp4'], failure: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockVideoBuffer));
    mockSend.mockRejectedValueOnce(new Error('S3 PutObject failed'));

    await expect(
      generateVideo('rw-key', { prompt: 'test' }, mockDeps),
    ).rejects.toThrow('S3 PutObject failed');
  });

  it('throws on poll API error', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-7', status: 'PENDING', output: null, failure: null,
        })),
      )
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    const promise = generateVideo('rw-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('Runway poll error (500)');
  });

  it('throws on polling timeout', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-8', status: 'PENDING', output: null, failure: null,
        })),
      );
    // Return fresh RUNNING Response on every poll
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({
        id: 'task-8', status: 'RUNNING', output: null, failure: null,
      }))),
    );

    const promise = generateVideo('rw-key', { prompt: 'test' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1_000);

    await expect(promise).rejects.toThrow('timed out');
  });
});
