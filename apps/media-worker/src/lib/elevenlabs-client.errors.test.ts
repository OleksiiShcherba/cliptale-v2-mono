import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  textToSpeech,
  voiceClone,
  speechToSpeech,
  musicGeneration,
  listAvailableVoices,
  ElevenLabsError,
} from './elevenlabs-client.js';
import {
  API_KEY,
  VOICE_ID,
  AUDIO_BYTES,
  FILENAME,
  errorResponse,
  jsonResponse,
} from './elevenlabs-client.fixtures.js';

// ── ElevenLabsError class ────────────────────────────────────────────────────

describe('ElevenLabsError', () => {
  it('includes operation and status in message', () => {
    const err = new ElevenLabsError(401, '{"error":"Unauthorized"}', 'text-to-speech');
    expect(err.message).toMatch(/text-to-speech/);
    expect(err.message).toMatch(/401/);
    expect(err.name).toBe('ElevenLabsError');
  });

  it('includes optional detail when provided', () => {
    const err = new ElevenLabsError(200, '{}', 'voice-cloning', 'response missing voice_id');
    expect(err.message).toMatch(/response missing voice_id/);
  });

  it('exposes statusCode, rawBody, and operation properties', () => {
    const rawBody = '{"error":"Rate limit exceeded"}';
    const err = new ElevenLabsError(429, rawBody, 'text-to-speech');
    expect(err.statusCode).toBe(429);
    expect(err.rawBody).toBe(rawBody);
    expect(err.operation).toBe('text-to-speech');
  });

  it('truncates rawBody in message to first 200 characters when very long', () => {
    const longBody = 'x'.repeat(300);
    const err = new ElevenLabsError(500, longBody, 'music-generation');
    expect(err.message).toContain('x'.repeat(200));
    expect(err.message).not.toContain('x'.repeat(201));
  });
});

// ── textToSpeech errors ──────────────────────────────────────────────────────

describe('elevenlabs-client / textToSpeech — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws ElevenLabsError with operation and status on non-2xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse(429, 'rate limit exceeded'));

    const err = await textToSpeech({ apiKey: API_KEY, text: 'hi', voiceId: VOICE_ID }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect((err as ElevenLabsError).statusCode).toBe(429);
    expect((err as ElevenLabsError).message).toMatch(/text-to-speech/);
  });
});

// ── voiceClone errors ────────────────────────────────────────────────────────

describe('elevenlabs-client / voiceClone — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws ElevenLabsError when response is missing voice_id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));

    await expect(
      voiceClone({ apiKey: API_KEY, name: 'X', audioSampleBytes: AUDIO_BYTES, audioSampleFilename: FILENAME }),
    ).rejects.toThrow(/voice-cloning.*missing voice_id/);
  });

  it('throws ElevenLabsError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse(400, 'invalid audio file'));

    await expect(
      voiceClone({ apiKey: API_KEY, name: 'X', audioSampleBytes: AUDIO_BYTES, audioSampleFilename: FILENAME }),
    ).rejects.toThrow(ElevenLabsError);
  });
});

// ── speechToSpeech errors ────────────────────────────────────────────────────

describe('elevenlabs-client / speechToSpeech — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws ElevenLabsError on non-2xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse(422, 'voice not found'));

    await expect(
      speechToSpeech({ apiKey: API_KEY, sourceAudioBytes: AUDIO_BYTES, sourceAudioFilename: FILENAME, voiceId: VOICE_ID }),
    ).rejects.toThrow(/speech-to-speech.*422/);
  });
});

// ── musicGeneration errors ───────────────────────────────────────────────────

describe('elevenlabs-client / musicGeneration — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws ElevenLabsError on non-2xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse(503, 'service unavailable'));

    await expect(
      musicGeneration({ apiKey: API_KEY, prompt: 'test' }),
    ).rejects.toThrow(ElevenLabsError);
  });
});

// ── listAvailableVoices errors ───────────────────────────────────────────────

describe('elevenlabs-client / listAvailableVoices — errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws ElevenLabsError when response body is missing the voices array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'unexpected' }));

    await expect(listAvailableVoices(API_KEY)).rejects.toThrow(/list-voices.*missing voices array/);
  });

  it('throws ElevenLabsError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

    const err = await listAvailableVoices(API_KEY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect((err as ElevenLabsError).statusCode).toBe(401);
    expect((err as ElevenLabsError).operation).toBe('list-voices');
  });
});
