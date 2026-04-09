import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateAudio } from './suno-audio.adapter.js';

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;
const mockDeps = { s3: mockS3, bucket: 'test-bucket', projectId: 'proj-1' };
const mockAudioBuffer = Buffer.from('fake-mp3');

describe('suno-audio.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates clip and uploads completed audio to S3', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          clips: [{
            id: 'clip-1', status: 'complete',
            audio_url: 'https://suno.ai/audio.mp3', duration: 30, error_message: null,
          }],
        })),
      )
      .mockResolvedValueOnce(new Response(mockAudioBuffer));

    const result = await generateAudio(
      'suno-key',
      { prompt: 'upbeat pop song', type: 'music' },
      mockDeps,
    );

    expect(result.provider).toBe('suno');
    expect(result.model).toBe('suno-v4');
    expect(result.durationSeconds).toBe(30);
    expect(result.audioUrl).toMatch(/^s3:\/\/test-bucket\//);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('polls when clip is still streaming', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          clips: [{
            id: 'clip-2', status: 'streaming',
            audio_url: null, duration: null, error_message: null,
          }],
        })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'clip-2', status: 'complete',
          audio_url: 'https://suno.ai/out.mp3', duration: 25, error_message: null,
        })),
      )
      .mockResolvedValueOnce(new Response(mockAudioBuffer));

    const promise = generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps);
    await vi.advanceTimersByTimeAsync(5_100);
    const result = await promise;

    expect(result.provider).toBe('suno');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Rate limited', { status: 429 }),
    );

    await expect(
      generateAudio('bad-key', { prompt: 'test', type: 'music' }, mockDeps),
    ).rejects.toThrow('Suno API error (429)');
  });

  it('throws when no clips returned', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ clips: [] })),
    );

    await expect(
      generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps),
    ).rejects.toThrow('no clips');
  });

  it('throws when clip fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        clips: [{
          id: 'clip-3', status: 'error',
          audio_url: null, duration: null, error_message: 'Content violation',
        }],
      })),
    );

    await expect(
      generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps),
    ).rejects.toThrow('Content violation');
  });

  it('throws when no audio URL in completed clip', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        clips: [{
          id: 'clip-4', status: 'complete',
          audio_url: null, duration: null, error_message: null,
        }],
      })),
    );

    await expect(
      generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps),
    ).rejects.toThrow('no audio URL');
  });

  it('throws when audio download fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          clips: [{
            id: 'clip-5', status: 'complete',
            audio_url: 'https://suno.ai/audio.mp3', duration: 30, error_message: null,
          }],
        })),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await expect(
      generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps),
    ).rejects.toThrow('Failed to download audio from Suno: 404');
  });

  it('throws when S3 upload fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          clips: [{
            id: 'clip-6', status: 'complete',
            audio_url: 'https://suno.ai/audio.mp3', duration: 30, error_message: null,
          }],
        })),
      )
      .mockResolvedValueOnce(new Response(mockAudioBuffer));
    mockSend.mockRejectedValueOnce(new Error('S3 PutObject failed'));

    await expect(
      generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps),
    ).rejects.toThrow('S3 PutObject failed');
  });

  it('throws on poll API error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          clips: [{
            id: 'clip-7', status: 'queued',
            audio_url: null, duration: null, error_message: null,
          }],
        })),
      )
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    const promise = generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(promise).rejects.toThrow('Suno poll error (500)');
  });

  it('throws on polling timeout', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          clips: [{
            id: 'clip-8', status: 'queued',
            audio_url: null, duration: null, error_message: null,
          }],
        })),
      );
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({
        id: 'clip-8', status: 'streaming',
        audio_url: null, duration: null, error_message: null,
      }))),
    );

    const promise = generateAudio('suno-key', { prompt: 'test', type: 'music' }, mockDeps);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1_000);

    await expect(promise).rejects.toThrow('timed out');
  });
});
