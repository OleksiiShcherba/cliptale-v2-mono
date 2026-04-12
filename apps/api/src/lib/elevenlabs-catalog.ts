/**
 * Minimal ElevenLabs catalog HTTP client — read-only voice listing only.
 *
 * This module is intentionally separate from the media-worker's full
 * ElevenLabs client. The API app only needs voice catalog data for the
 * voice picker; audio generation stays in media-worker.
 *
 * The `ElevenLabsVoice` type is re-declared here to keep the API app
 * independent of the media-worker package (cross-app imports are forbidden).
 */

const BASE_URL = 'https://api.elevenlabs.io';

/** Typed representation of a single ElevenLabs voice from `GET /v1/voices`. */
export type ElevenLabsVoice = {
  /** ElevenLabs voice ID — pass to TTS/S2S as `voiceId`. */
  voiceId: string;
  /** Human-readable display name. */
  name: string;
  /** Voice category returned by ElevenLabs (e.g. `"premade"`, `"cloned"`). */
  category: string;
  /** Optional freeform description; `null` when the API omits the field. */
  description: string | null;
  /** URL to the ElevenLabs-hosted MP3 preview sample. */
  previewUrl: string;
  /** Key-value labels (accent, gender, age, etc.) — empty object when absent. */
  labels: Record<string, string>;
};

/** Thrown by `listVoices` on non-2xx responses or malformed payloads. */
export class ElevenLabsCatalogError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly rawBody: string,
    detail?: string,
  ) {
    const suffix = detail ? ` — ${detail}` : `: ${rawBody.slice(0, 200)}`;
    super(`ElevenLabs catalog error (HTTP ${statusCode})${suffix}`);
    this.name = 'ElevenLabsCatalogError';
  }
}

/**
 * Fetches all available ElevenLabs voices (premade + user-cloned).
 * Accepts the API key as a parameter — never reads from process.env.
 */
export async function listVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const url = `${BASE_URL}/v1/voices`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new ElevenLabsCatalogError(response.status, await response.text());
  }

  const body = (await response.json()) as { voices?: unknown[] };
  if (!Array.isArray(body.voices)) {
    throw new ElevenLabsCatalogError(200, JSON.stringify(body), 'response missing voices array');
  }

  return body.voices.map((raw) => {
    const v = raw as Record<string, unknown>;
    return {
      voiceId: String(v['voice_id'] ?? ''),
      name: String(v['name'] ?? ''),
      category: String(v['category'] ?? ''),
      description: v['description'] != null ? String(v['description']) : null,
      previewUrl: String(v['preview_url'] ?? ''),
      labels: (v['labels'] != null && typeof v['labels'] === 'object')
        ? Object.fromEntries(
            Object.entries(v['labels'] as Record<string, unknown>).map(([k, val]) => [k, String(val)]),
          )
        : {},
    };
  });
}
