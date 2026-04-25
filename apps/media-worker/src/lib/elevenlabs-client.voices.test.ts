import { describe, it, expect, vi, beforeEach } from 'vitest';

import { listAvailableVoices } from './elevenlabs-client.js';
import { API_KEY, jsonResponse } from './elevenlabs-client.fixtures.js';

// ── listAvailableVoices ───────────────────────────────────────────────────────

describe('elevenlabs-client / listAvailableVoices', () => {
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
      voice_id: 'user-clone-abc',
      name: 'My Clone',
      category: 'cloned',
      description: 'A custom voice',
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

    const result = await listAvailableVoices(API_KEY);

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
      voiceId: 'user-clone-abc',
      name: 'My Clone',
      category: 'cloned',
      description: 'A custom voice',
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

  it('returns an empty array when voices list is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ voices: [] }));

    const result = await listAvailableVoices(API_KEY);
    expect(result).toEqual([]);
  });

  it('maps null description to null and missing labels to empty object', async () => {
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

    const [voice] = await listAvailableVoices(API_KEY);
    expect(voice!.description).toBeNull();
    expect(voice!.labels).toEqual({});
  });
});
