import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  textToSpeech,
  voiceClone,
  speechToSpeech,
  createMusicCompositionPlan,
  musicGeneration,
  ElevenLabsError,
} from './elevenlabs-client.js';
import { API_KEY, VOICE_ID, AUDIO_BYTES, FILENAME, audioResponse, jsonResponse } from './elevenlabs-client.fixtures.js';

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

const compositionPlan = {
  positive_global_styles: ['cinematic'],
  negative_global_styles: ['vocals'],
  sections: [
    {
      section_name: 'Main',
      positive_local_styles: ['soft piano'],
      negative_local_styles: [],
      duration_ms: 30_000,
      lines: [],
    },
  ],
};

describe('elevenlabs-client / createMusicCompositionPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to /v1/music/plan and returns a composition plan', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(compositionPlan));

    const result = await createMusicCompositionPlan({
      apiKey: API_KEY,
      prompt: 'warm cinematic bed',
      musicLengthMs: 45_000,
    });

    expect(result).toEqual(compositionPlan);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toMatch('/v1/music/plan');
    expect((calledInit as RequestInit).method).toBe('POST');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse((calledInit as RequestInit).body as string);
    expect(body).toEqual({
      prompt: 'warm cinematic bed',
      music_length_ms: 45_000,
      model_id: 'music_v1',
    });
  });

  it('sends source_composition_plan when regenerating a music plan', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(compositionPlan));

    await createMusicCompositionPlan({
      apiKey: API_KEY,
      prompt: 'more urgent piano pulse',
      musicLengthMs: 30_000,
      sourceCompositionPlan: compositionPlan,
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.source_composition_plan).toEqual(compositionPlan);
    expect(body.prompt).toBe('more urgent piano pulse');
    expect(body.music_length_ms).toBe(30_000);
  });
});

describe('elevenlabs-client / musicGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to /v1/music with xi-api-key and returns audio buffer', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(audioResponse());

    const result = await musicGeneration({ apiKey: API_KEY, compositionPlan });

    expect(Buffer.isBuffer(result)).toBe(true);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toMatch('/v1/music');
    expect(String(calledUrl)).toMatch(/output_format=mp3_44100_128/);
    expect((calledInit as RequestInit).method).toBe('POST');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('audio/mpeg');
  });

  it('sends composition_plan without prompt in the compose request body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await musicGeneration({
      apiKey: API_KEY,
      compositionPlan,
      respectSectionsDurations: false,
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.composition_plan).toEqual(compositionPlan);
    expect(body.prompt).toBeUndefined();
    expect(body.model_id).toBe('music_v1');
    expect(body.respect_sections_durations).toBe(false);
  });

  it('sends prompt-only compose fields without composition_plan when prompt is used directly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(audioResponse());

    await musicGeneration({
      apiKey: API_KEY,
      prompt: 'ambient',
      musicLengthMs: 30_000,
      forceInstrumental: true,
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.prompt).toBe('ambient');
    expect(body.composition_plan).toBeUndefined();
    expect(body.music_length_ms).toBe(30_000);
    expect(body.force_instrumental).toBe(true);
  });

  it('rejects before fetch when prompt and compositionPlan are both provided', async () => {
    await expect(
      musicGeneration({ apiKey: API_KEY, prompt: 'ambient', compositionPlan }),
    ).rejects.toThrow(/exactly one/);

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
