import { describe, it, expect, vi, beforeEach } from 'vitest';

import { listVoices, ElevenLabsCatalogError } from './elevenlabs-catalog.js';

// ── Constants ────────────────────────────────────────────────────────────────

const API_KEY = 'el-api-test-key';

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function errorResponse(status: number, body = 'upstream error'): Response {
  return new Response(body, { status });
}

// ── listVoices — happy paths ─────────────────────────────────────────────────

describe('elevenlabs-catalog / listVoices', () => {
  const VOICES_FIXTURE = [
    {
      voice_id: 'pNInz6obpgDQGcFmaJgB',
      name: 'Adam',
      category: 'premade',
      description: null,
      preview_url: 'https://cdn.elevenlabs.io/adam-preview.mp3',
      labels: { accent: 'american', gender: 'male' },
    },
    {
      voice_id: 'user-clone-xyz',
      name: 'My Voice',
      category: 'cloned',
      description: 'Custom clone',
      preview_url: 'https://cdn.elevenlabs.io/clone-preview.mp3',
      labels: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('GETs /v1/voices with xi-api-key header and returns mapped ElevenLabsVoice array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ voices: VOICES_FIXTURE }));

    const result = await listVoices(API_KEY);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      voiceId: 'pNInz6obpgDQGcFmaJgB',
      name: 'Adam',
      category: 'premade',
      description: null,
      previewUrl: 'https://cdn.elevenlabs.io/adam-preview.mp3',
      labels: { accent: 'american', gender: 'male' },
    });
    expect(result[1]).toEqual({
      voiceId: 'user-clone-xyz',
      name: 'My Voice',
      category: 'cloned',
      description: 'Custom clone',
      previewUrl: 'https://cdn.elevenlabs.io/clone-preview.mp3',
      labels: {},
    });

    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(calledUrl)).toMatch('/v1/voices');
    expect((calledInit as RequestInit).method).toBe('GET');
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(API_KEY);
    expect(headers['Accept']).toBe('application/json');
  });

  it('returns an empty array when the voices list is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ voices: [] }));

    const result = await listVoices(API_KEY);
    expect(result).toEqual([]);
  });

  it('maps null description to null and absent labels to empty object', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        voices: [
          {
            voice_id: 'v1',
            name: 'Voice One',
            category: 'premade',
            description: null,
            preview_url: 'https://cdn.example.com/preview.mp3',
          },
        ],
      }),
    );

    const [voice] = await listVoices(API_KEY);
    expect(voice!.description).toBeNull();
    expect(voice!.labels).toEqual({});
  });

  it('throws ElevenLabsCatalogError when response is missing the voices array', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'unexpected' }));

    const err = await listVoices(API_KEY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ElevenLabsCatalogError);
    expect((err as ElevenLabsCatalogError).message).toMatch(/missing voices array/);
  });

  it('throws ElevenLabsCatalogError with status code on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

    const err = await listVoices(API_KEY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ElevenLabsCatalogError);
    expect((err as ElevenLabsCatalogError).statusCode).toBe(401);
    expect((err as ElevenLabsCatalogError).message).toMatch(/401/);
  });
});
