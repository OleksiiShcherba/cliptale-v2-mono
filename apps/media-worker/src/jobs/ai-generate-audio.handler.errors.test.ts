import { describe, it, expect, vi, beforeEach } from 'vitest';

import { processElevenLabsCapability } from './ai-generate-audio.handler.js';
import {
  BUCKET,
  JOB_ID,
  USER_ID,
  PROJECT_ID,
  AUDIO_BYTES,
  makeMocks,
  makeDeps,
  makeData,
} from './ai-generate-audio.handler.fixtures.js';

// ── error path ────────────────────────────────────────────────────────────────

describe('processElevenLabsCapability / error propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws when textToSpeech client rejects', async () => {
    const m = makeMocks();
    m.textToSpeech.mockRejectedValueOnce(new Error('ElevenLabs quota exceeded'));

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'text_to_speech', options: { text: 'hi' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('ElevenLabs quota exceeded');
  });

  it('throws when voiceClone client rejects', async () => {
    const m = makeMocks();
    m.voiceClone.mockRejectedValueOnce(new Error('Voice sample too quiet'));
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'voice_cloning', options: { name: 'X', audio_sample: 'https://s3.example.com/s.mp3' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('Voice sample too quiet');
  });

  it('throws when speechToSpeech client rejects', async () => {
    const m = makeMocks();
    m.speechToSpeech.mockRejectedValueOnce(new Error('Source audio is corrupted'));
    globalThis.fetch = m.fetchMock as unknown as typeof fetch;

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'speech_to_speech', options: { source_audio: 'https://s3.example.com/s.mp3', voice_id: 'v' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('Source audio is corrupted');
  });

  it('throws when musicGeneration client rejects', async () => {
    const m = makeMocks();
    m.musicGeneration.mockRejectedValueOnce(new Error('Prompt too long'));

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'music_generation', options: { prompt: 'hi' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('Prompt too long');
  });

  it('throws when S3 upload fails', async () => {
    const m = makeMocks();
    m.s3Send.mockRejectedValueOnce(new Error('S3 connection timeout'));

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'text_to_speech', options: { text: 'hi' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('S3 connection timeout');
  });

  it('throws when audio download (fetch) fails', async () => {
    const m = makeMocks();
    const badFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    globalThis.fetch = badFetch as unknown as typeof fetch;

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'voice_cloning', options: { name: 'X', audio_sample: 'https://dead-link.com/s.mp3' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('Failed to download audio');
  });

  it('throws when database operations fail', async () => {
    const m = makeMocks();
    m.execute.mockRejectedValueOnce(new Error('Database connection lost'));

    await expect(
      processElevenLabsCapability(
        makeData({ capability: 'text_to_speech', options: { text: 'hi' } }),
        makeDeps(m),
      ),
    ).rejects.toThrow('Database connection lost');
  });
});
