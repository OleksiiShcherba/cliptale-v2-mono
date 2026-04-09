import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { generateAudio } from './elevenlabs-audio.adapter.js';

const mockSend = vi.fn().mockResolvedValue({});
const mockS3 = { send: mockSend } as unknown as S3Client;
const mockDeps = { s3: mockS3, bucket: 'test-bucket', projectId: 'proj-1' };
const mockAudioBuffer = Buffer.from('fake-mp3');

describe('elevenlabs-audio.adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('generates TTS audio and uploads to S3', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(mockAudioBuffer));

    const result = await generateAudio(
      'el-key',
      { prompt: 'Hello world', type: 'voice' },
      mockDeps,
    );

    expect(result.provider).toBe('elevenlabs');
    expect(result.model).toBe('eleven_multilingual_v2');
    expect(result.audioUrl).toMatch(/^s3:\/\/test-bucket\//);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('uses custom voice ID for TTS', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(mockAudioBuffer));

    await generateAudio(
      'el-key',
      { prompt: 'Hello', type: 'voice', voiceId: 'custom-voice-123' },
      mockDeps,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('custom-voice-123'),
      expect.any(Object),
    );
  });

  it('uses SFX endpoint for sfx type', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(mockAudioBuffer));

    await generateAudio(
      'el-key',
      { prompt: 'explosion sound', type: 'sfx', duration: 3 },
      mockDeps,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sound-generation'),
      expect.any(Object),
    );
  });

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(
      generateAudio('bad-key', { prompt: 'test', type: 'voice' }, mockDeps),
    ).rejects.toThrow('ElevenLabs API error (401)');
  });

  it('throws when S3 upload fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(mockAudioBuffer));
    mockSend.mockRejectedValueOnce(new Error('S3 PutObject failed'));

    await expect(
      generateAudio('el-key', { prompt: 'test', type: 'voice' }, mockDeps),
    ).rejects.toThrow('S3 PutObject failed');
  });
});
