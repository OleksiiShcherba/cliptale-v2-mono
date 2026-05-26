/**
 * ElevenLabs HTTP client — thin wrapper around the global `fetch`.
 *
 * Exposes four typed functions, one per audio capability: textToSpeech,
 * voiceClone, speechToSpeech, musicGeneration. All functions:
 *   - accept the API key as a parameter (never read from process.env)
 *   - return a Buffer (audio bytes) or typed metadata (voiceClone)
 *   - throw a descriptive ElevenLabsError on non-2xx responses
 *   - have no import-time side effects (safe to unit test with stubbed fetch)
 *
 * ── API surface used ───────────────────────────────────────────────────────
 *
 *   Text-to-Speech:
 *     POST /v1/text-to-speech/{voiceId}?output_format=mp3_44100_128
 *     { text, model_id, voice_settings: { stability, similarity_boost } }
 *     → audio/mpeg binary
 *
 *   Voice Cloning (Instant Voice Clone):
 *     POST /v1/voices/add  (multipart/form-data: name, files[], description)
 *     → { voice_id }
 *
 *   Speech-to-Speech:
 *     POST /v1/speech-to-speech/{voiceId}?output_format=mp3_44100_128
 *     multipart/form-data: audio (binary), model_id, voice_settings (JSON str)
 *     → audio/mpeg binary
 *
 *   Music:
 *     POST /v1/music/plan
 *     { prompt, music_length_ms?, model_id? }
 *     → composition plan JSON
 *
 *     POST /v1/music?output_format=mp3_44100_128
 *     { prompt | composition_plan, model_id, force_instrumental?, respect_sections_durations? }
 *     → audio/mpeg binary
 */

const BASE_URL = 'https://api.elevenlabs.io';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_MUSIC_MODEL_ID = 'music_v1';
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // ElevenLabs "Adam" voice
const OUTPUT_FORMAT = 'mp3_44100_128';

// ── Types ──────────────────────────────────────────────────────────────────

/** Parameters for the `textToSpeech` function. */
export type TextToSpeechParams = {
  apiKey: string;
  text: string;
  /** Defaults to the ElevenLabs "Adam" voice when omitted. */
  voiceId?: string;
  /** Voice stability (0–1); defaults to 0.5. */
  stability?: number;
  /** Voice similarity boost (0–1); defaults to 0.75. */
  similarityBoost?: number;
};

/** Parameters for the `voiceClone` function (Instant Voice Clone). */
export type VoiceCloneParams = {
  apiKey: string;
  /** Display name for the cloned voice in ElevenLabs. */
  name: string;
  audioSampleBytes: Buffer;
  audioSampleFilename: string;
  description?: string;
};

/** Return value from `voiceClone` — the newly created ElevenLabs voice ID. */
export type VoiceCloneResult = {
  voiceId: string;
};

/** Parameters for the `speechToSpeech` function. */
export type SpeechToSpeechParams = {
  apiKey: string;
  sourceAudioBytes: Buffer;
  sourceAudioFilename: string;
  /** Target ElevenLabs voice ID to convert the source audio into. */
  voiceId: string;
  /** Voice stability (0–1); defaults to 0.5. */
  stability?: number;
};

export type ElevenLabsCompositionPlanSection = {
  section_name: string;
  positive_local_styles: string[];
  negative_local_styles: string[];
  duration_ms: number;
  lines: string[];
};

export type ElevenLabsCompositionPlan = {
  positive_global_styles: string[];
  negative_global_styles: string[];
  sections: ElevenLabsCompositionPlanSection[];
};

/** Parameters for `createMusicCompositionPlan`. */
export type CreateMusicCompositionPlanParams = {
  apiKey: string;
  prompt: string;
  /** Target duration in milliseconds; omit to let ElevenLabs choose. */
  musicLengthMs?: number;
  /** ElevenLabs Music model id; defaults to `music_v1`. */
  modelId?: string;
  /** Optional source plan for plan regeneration/refinement. */
  sourceCompositionPlan?: ElevenLabsCompositionPlan;
};

/** Parameters for the `musicGeneration` function. */
export type MusicGenerationParams = {
  apiKey: string;
  /** Text prompt describing the desired music. Mutually exclusive with `compositionPlan`. */
  prompt?: string;
  /** Structured ElevenLabs composition plan. Mutually exclusive with `prompt`. */
  compositionPlan?: ElevenLabsCompositionPlan;
  /** Target duration in milliseconds. Used by ElevenLabs only with prompt-based compose. */
  musicLengthMs?: number;
  /** Controls section timing strictness. Used by ElevenLabs only with composition plans. */
  respectSectionsDurations?: boolean;
  /** ElevenLabs Music model id; defaults to `music_v1`. */
  modelId?: string;
  /** Used by ElevenLabs only with prompt-based compose. */
  forceInstrumental?: boolean;
};

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

// ── Functions ──────────────────────────────────────────────────────────────

/**
 * Converts text to speech using an ElevenLabs voice. Returns raw MP3 bytes.
 * Falls back to the "Adam" voice when `voiceId` is not provided.
 */
export async function textToSpeech(params: TextToSpeechParams): Promise<Buffer> {
  const { apiKey, text, voiceId, stability = 0.5, similarityBoost = 0.75 } = params;
  const vid = voiceId ?? DEFAULT_VOICE_ID;
  const url = `${BASE_URL}/v1/text-to-speech/${vid}?output_format=${OUTPUT_FORMAT}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: DEFAULT_MODEL_ID,
      voice_settings: { stability, similarity_boost: similarityBoost },
    }),
  });

  if (!response.ok) {
    throw new ElevenLabsError(response.status, await response.text(), 'text-to-speech');
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Clones a voice from an audio sample (Instant Voice Clone).
 * Returns the ElevenLabs `voice_id` to store for future TTS requests.
 */
export async function voiceClone(params: VoiceCloneParams): Promise<VoiceCloneResult> {
  const { apiKey, name, audioSampleBytes, audioSampleFilename, description } = params;
  const url = `${BASE_URL}/v1/voices/add`;

  const form = new FormData();
  form.append('name', name);
  form.append(
    'files',
    new Blob([audioSampleBytes], { type: 'audio/mpeg' }),
    audioSampleFilename,
  );
  if (description) {
    form.append('description', description);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!response.ok) {
    throw new ElevenLabsError(response.status, await response.text(), 'voice-cloning');
  }

  const body = (await response.json()) as { voice_id?: unknown };
  if (typeof body.voice_id !== 'string' || body.voice_id.length === 0) {
    throw new ElevenLabsError(200, JSON.stringify(body), 'voice-cloning', 'response missing voice_id');
  }

  return { voiceId: body.voice_id };
}

/**
 * Transforms the voice in a source audio clip into a different ElevenLabs
 * voice while preserving timing and emotion. Returns raw MP3 bytes.
 */
export async function speechToSpeech(params: SpeechToSpeechParams): Promise<Buffer> {
  const { apiKey, sourceAudioBytes, sourceAudioFilename, voiceId, stability = 0.5 } = params;
  const url = `${BASE_URL}/v1/speech-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`;

  const form = new FormData();
  form.append(
    'audio',
    new Blob([sourceAudioBytes], { type: 'audio/mpeg' }),
    sourceAudioFilename,
  );
  form.append('model_id', DEFAULT_MODEL_ID);
  form.append('voice_settings', JSON.stringify({ stability, similarity_boost: 0.75 }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!response.ok) {
    throw new ElevenLabsError(response.status, await response.text(), 'speech-to-speech');
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Creates a structured ElevenLabs Music composition plan from a prompt. */
export async function createMusicCompositionPlan(
  params: CreateMusicCompositionPlanParams,
): Promise<ElevenLabsCompositionPlan> {
  const {
    apiKey,
    prompt,
    musicLengthMs,
    modelId = DEFAULT_MUSIC_MODEL_ID,
    sourceCompositionPlan,
  } = params;
  const url = `${BASE_URL}/v1/music/plan`;

  const body: Record<string, unknown> = { prompt, model_id: modelId };
  if (musicLengthMs !== undefined) {
    body.music_length_ms = musicLengthMs;
  }
  if (sourceCompositionPlan !== undefined) {
    body.source_composition_plan = sourceCompositionPlan;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ElevenLabsError(response.status, await response.text(), 'music-plan');
  }

  const bodyJson = await response.json();
  assertCompositionPlan(bodyJson, 'music-plan');
  return bodyJson;
}

/**
 * Generates music from either a prompt or a composition plan.
 * Returns raw MP3 bytes.
 */
export async function musicGeneration(params: MusicGenerationParams): Promise<Buffer> {
  const {
    apiKey,
    prompt,
    compositionPlan,
    musicLengthMs,
    respectSectionsDurations,
    modelId = DEFAULT_MUSIC_MODEL_ID,
    forceInstrumental,
  } = params;
  const hasPrompt = typeof prompt === 'string' && prompt.length > 0;
  const hasCompositionPlan = compositionPlan !== undefined;

  if (hasPrompt === hasCompositionPlan) {
    throw new ElevenLabsError(
      400,
      '',
      'music-generation',
      "provide exactly one of 'prompt' or 'compositionPlan'",
    );
  }

  const url = `${BASE_URL}/v1/music?output_format=${OUTPUT_FORMAT}`;
  const body: Record<string, unknown> = { model_id: modelId };

  if (hasPrompt) {
    body.prompt = prompt;
    if (musicLengthMs !== undefined) {
      body.music_length_ms = musicLengthMs;
    }
    if (forceInstrumental !== undefined) {
      body.force_instrumental = forceInstrumental;
    }
  } else {
    assertCompositionPlan(compositionPlan, 'music-generation');
    body.composition_plan = compositionPlan;
    if (respectSectionsDurations !== undefined) {
      body.respect_sections_durations = respectSectionsDurations;
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ElevenLabsError(response.status, await response.text(), 'music-generation');
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Returns all available ElevenLabs voices (premade library + user-cloned).
 * Maps the raw API response to the typed `ElevenLabsVoice` shape.
 */
export async function listAvailableVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const url = `${BASE_URL}/v1/voices`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new ElevenLabsError(response.status, await response.text(), 'list-voices');
  }

  const body = (await response.json()) as { voices?: unknown[] };
  if (!Array.isArray(body.voices)) {
    throw new ElevenLabsError(200, JSON.stringify(body), 'list-voices', 'response missing voices array');
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

// ── Error type ─────────────────────────────────────────────────────────────

/** Thrown by all ElevenLabs client functions on non-2xx responses. */
export class ElevenLabsError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly rawBody: string,
    public readonly operation: string,
    detail?: string,
  ) {
    const suffix = detail ? ` — ${detail}` : `: ${rawBody.slice(0, 200)}`;
    super(`ElevenLabs ${operation} error (HTTP ${statusCode})${suffix}`);
    this.name = 'ElevenLabsError';
  }
}

function assertCompositionPlan(
  value: unknown,
  operation: string,
): asserts value is ElevenLabsCompositionPlan {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ElevenLabsError(400, JSON.stringify(value), operation, 'invalid composition_plan');
  }
  const plan = value as Record<string, unknown>;
  if (
    !Array.isArray(plan['positive_global_styles']) ||
    !Array.isArray(plan['negative_global_styles']) ||
    !Array.isArray(plan['sections'])
  ) {
    throw new ElevenLabsError(400, JSON.stringify(value), operation, 'invalid composition_plan');
  }
}
