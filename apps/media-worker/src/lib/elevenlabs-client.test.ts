import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  textToSpeech,
  voiceClone,
  speechToSpeech,
  musicGeneration,
  ElevenLabsError,
} from './elevenlabs-client.js';
import { API_KEY, VOICE_ID, AUDIO_BYTES, FILENAME, audioResponse, jsonResponse } from './elevenlabs-client.fixtures.js';

// ── textToSpeech ─────────────────────────────────────────────────────────────

describe('elevenlabs-client / textToSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to /v1/text-to-speech/{voiceId} with xi-api-key header and returns audio buffer', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(audioResponse());

    const result = await textToSpeech({ apiKey: API_KEY, text: 'Hello world', voiceId: VOICE_ID });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toMatch(
      new RegExp(`/v1/text-to-speech/${VOICE_ID}`),
    );
    expect(String(calledUrl)).toMatch(/output_format=mp3_44100_128/);
    expect((calledInit as RequestInit).method).toBe('POST');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('audio/mpeg');
  });

  it('sends text, model_id, and voice_settings in the request body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await textToSpeech({
      apiKey: API_KEY,
      text: 'Test text',
      voiceId: VOICE_ID,
      stability: 0.6,
      similarityBoost: 0.8,
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.text).toBe('Test text');
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(body.voice_settings).toEqual({ stability: 0.6, similarity_boost: 0.8 });
  });

  it('uses the default Adam voice when voiceId is omitted', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await textToSpeech({ apiKey: API_KEY, text: 'hi' });

    const [calledUrl] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(calledUrl)).toMatch(/\/v1\/text-to-speech\/\w+/);
  });
});

// ── voiceClone ───────────────────────────────────────────────────────────────

describe('elevenlabs-client / voiceClone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to /v1/voices/add with xi-api-key and returns { voiceId }', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ voice_id: 'cloned-voice-xyz' }));

    const result = await voiceClone({
      apiKey: API_KEY,
      name: 'My Clone',
      audioSampleBytes: AUDIO_BYTES,
      audioSampleFilename: FILENAME,
    });

    expect(result).toEqual({ voiceId: 'cloned-voice-xyz' });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toMatch('/v1/voices/add');
    expect((calledInit as RequestInit).method).toBe('POST');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('sends a FormData body with name and files fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ voice_id: 'v-1' }));

    await voiceClone({
      apiKey: API_KEY,
      name: 'Clone Name',
      audioSampleBytes: AUDIO_BYTES,
      audioSampleFilename: FILENAME,
      description: 'A test voice',
    });

    const body = vi.mocked(fetch).mock.calls[0]![1]!.body;
    expect(body).toBeInstanceOf(FormData);
    const fd = body as FormData;
    expect(fd.get('name')).toBe('Clone Name');
    expect(fd.get('description')).toBe('A test voice');
    const filesBlob = fd.get('files');
    expect(filesBlob).toBeInstanceOf(Blob);
    expect((filesBlob as Blob).type).toBe('audio/mpeg');
  });
});

// ── speechToSpeech ───────────────────────────────────────────────────────────

describe('elevenlabs-client / speechToSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to /v1/speech-to-speech/{voiceId} with xi-api-key and returns audio buffer', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(audioResponse());

    const result = await speechToSpeech({
      apiKey: API_KEY,
      sourceAudioBytes: AUDIO_BYTES,
      sourceAudioFilename: FILENAME,
      voiceId: VOICE_ID,
    });

    expect(Buffer.isBuffer(result)).toBe(true);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toMatch(`/v1/speech-to-speech/${VOICE_ID}`);
    expect(String(calledUrl)).toMatch(/output_format=mp3_44100_128/);
    expect((calledInit as RequestInit).method).toBe('POST');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
  });

  it('includes audio blob, model_id, and voice_settings in the FormData body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await speechToSpeech({
      apiKey: API_KEY,
      sourceAudioBytes: AUDIO_BYTES,
      sourceAudioFilename: FILENAME,
      voiceId: VOICE_ID,
      stability: 0.7,
    });

    const body = vi.mocked(fetch).mock.calls[0]![1]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const audioBlob = body.get('audio');
    expect(audioBlob).toBeInstanceOf(Blob);
    expect((audioBlob as Blob).type).toBe('audio/mpeg');
    expect(body.get('model_id')).toBe('eleven_multilingual_v2');

    const voiceSettings = JSON.parse(body.get('voice_settings') as string);
    expect(voiceSettings.stability).toBe(0.7);
    expect(voiceSettings.similarity_boost).toBe(0.75);
  });
});

// ── musicGeneration ──────────────────────────────────────────────────────────

describe('elevenlabs-client / musicGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to /v1/sound-generation with xi-api-key and returns audio buffer', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(audioResponse());

    const result = await musicGeneration({ apiKey: API_KEY, prompt: 'calm jazz' });

    expect(Buffer.isBuffer(result)).toBe(true);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toMatch('/v1/sound-generation');
    expect((calledInit as RequestInit).method).toBe('POST');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends text in the request body and includes duration_seconds when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await musicGeneration({ apiKey: API_KEY, prompt: 'epic orchestral', durationSeconds: 60 });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.text).toBe('epic orchestral');
    expect(body.duration_seconds).toBe(60);
  });

  it('omits duration_seconds from the body when not provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await musicGeneration({ apiKey: API_KEY, prompt: 'ambient' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.text).toBe('ambient');
    expect(Object.prototype.hasOwnProperty.call(body, 'duration_seconds')).toBe(false);
  });
});
