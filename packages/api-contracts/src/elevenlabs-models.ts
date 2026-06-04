/**
 * ElevenLabs audio model catalog for the unified AI generation layer.
 *
 * Exposes the four audio capabilities supported via ElevenLabs: text-to-speech,
 * voice cloning, speech-to-speech, and music generation. Each entry follows the
 * same `FalInputSchema` shape as fal.ai models so the FE schema-driven form
 * renderer works without modification.
 *
 * The catalog is a leaf module: plain TypeScript, zero runtime dependencies.
 * Audio field types `audio_url` and `audio_upload` were added to `FalFieldType`
 * in `fal-models.ts` to support these entries without introducing a separate
 * field schema hierarchy.
 *
 * Exports:
 *  - `ELEVENLABS_MODELS`          — catalog const (`readonly ElevenLabsModel[]`, length 4)
 *  - `ElevenLabsModel`            — single catalog entry type
 *  - `AudioCapability`            — union of the 4 ElevenLabs capability values
 *  - `AUDIO_CAPABILITY_TO_GROUP`  — maps every audio capability → 'audio' group
 */

import type { AiGroup, FalFieldSchema, FalInputSchema } from './fal-models.js';

/** Capabilities handled by the ElevenLabs provider. */
export type AudioCapability =
  | 'text_to_speech'
  | 'voice_cloning'
  | 'speech_to_speech'
  | 'music_generation';

/** Maps every ElevenLabs capability to the 'audio' group. */
export const AUDIO_CAPABILITY_TO_GROUP: Readonly<Record<AudioCapability, AiGroup>> = {
  text_to_speech: 'audio',
  voice_cloning: 'audio',
  speech_to_speech: 'audio',
  music_generation: 'audio',
};

/** Single ElevenLabs catalog entry — mirrors `FalModel` with provider: 'elevenlabs'. */
export type ElevenLabsModel = {
  id: string;
  provider: 'elevenlabs';
  capability: AudioCapability;
  group: 'audio';
  label: string;
  description: string;
  inputSchema: FalInputSchema;
};

// ── Internal field helpers ────────────────────────────────────────────────────

const textField = (name: string, label: string, description: string): FalFieldSchema => ({
  name,
  type: 'text',
  label,
  required: true,
  description,
  modality: 'text',
});

const stringField = (
  name: string,
  label: string,
  description: string,
  required: boolean,
): FalFieldSchema => ({
  name,
  type: 'string',
  label,
  required,
  description,
});

const numberField = (
  name: string,
  label: string,
  description: string,
  defaultValue: number,
  min: number,
  max: number,
): FalFieldSchema => ({
  name,
  type: 'number',
  label,
  required: false,
  description,
  default: defaultValue,
  min,
  max,
});

const booleanField = (
  name: string,
  label: string,
  description: string,
  defaultValue?: boolean,
): FalFieldSchema => ({
  name,
  type: 'boolean',
  label,
  required: false,
  description,
  default: defaultValue,
});

const enumField = (
  name: string,
  label: string,
  description: string,
  values: readonly string[],
  defaultValue: string,
): FalFieldSchema => ({
  name,
  type: 'enum',
  label,
  required: false,
  description,
  enum: values,
  default: defaultValue,
});

const voicePickerField = (
  name: string,
  label: string,
  description: string,
  required: boolean,
): FalFieldSchema => ({
  name,
  type: 'voice_picker',
  label,
  required,
  description,
});

const compositionPlanField = (
  name: string,
  label: string,
  description: string,
): FalFieldSchema => ({
  name,
  type: 'composition_plan',
  label,
  required: false,
  description,
});

// ── Catalog ───────────────────────────────────────────────────────────────────

export const ELEVENLABS_MODELS: readonly ElevenLabsModel[] = [
  // 1. Text to Speech
  {
    id: 'elevenlabs/text-to-speech',
    provider: 'elevenlabs',
    capability: 'text_to_speech',
    group: 'audio',
    label: 'Text to Speech',
    description: 'Convert text to natural-sounding speech using ElevenLabs voices.',
    inputSchema: {
      fields: [
        textField('text', 'Text', 'The text to convert to speech.'),
        voicePickerField(
          'voice_id',
          'Voice',
          'Select an ElevenLabs voice. Leave unset to use the default voice.',
          false,
        ),
        numberField('stability', 'Stability', 'Voice stability (0–1).', 0.5, 0, 1),
        numberField(
          'similarity_boost',
          'Similarity Boost',
          'Similarity boost to the original voice (0–1).',
          0.75,
          0,
          1,
        ),
      ],
    },
  },

  // 2. Voice Cloning
  {
    id: 'elevenlabs/voice-cloning',
    provider: 'elevenlabs',
    capability: 'voice_cloning',
    group: 'audio',
    label: 'Voice Cloning',
    description:
      'Clone a voice from an audio sample. The result is saved to your Voice Library and can be used in Text to Speech.',
    inputSchema: {
      fields: [
        stringField(
          'name',
          'Voice Name',
          'A name for the cloned voice — shown in your Voice Library.',
          true,
        ),
        {
          name: 'audio_sample',
          type: 'audio_upload',
          label: 'Audio Sample',
          required: true,
          description:
            'Upload a clear audio clip of the voice you want to clone (MP3 or WAV, ≥ 30 s).',
          modality: 'audio',
        },
        stringField(
          'description',
          'Description',
          'Optional notes about this voice (accent, tone, use case).',
          false,
        ),
      ],
    },
  },

  // 3. Speech to Speech
  {
    id: 'elevenlabs/speech-to-speech',
    provider: 'elevenlabs',
    capability: 'speech_to_speech',
    group: 'audio',
    label: 'Speech to Speech',
    description:
      'Transform the voice in an existing audio clip into a different ElevenLabs voice while preserving timing and emotion.',
    inputSchema: {
      fields: [
        {
          name: 'source_audio',
          type: 'audio_upload',
          label: 'Source Audio',
          required: true,
          description: 'Upload the audio clip whose voice you want to change (MP3 or WAV).',
          modality: 'audio',
        },
        voicePickerField(
          'voice_id',
          'Target Voice',
          'Select the ElevenLabs voice for the output audio.',
          true,
        ),
        numberField('stability', 'Stability', 'Voice stability for the output (0–1).', 0.5, 0, 1),
      ],
    },
  },

  // 4. Music Generation
  {
    id: 'elevenlabs/music-generation',
    provider: 'elevenlabs',
    capability: 'music_generation',
    group: 'audio',
    label: 'Music Generation',
    description:
      'Generate background music from an ElevenLabs Music composition plan.',
    inputSchema: {
      fields: [
        // prompt XOR composition_plan: exactly one must be provided (mirrors fal's
        // 'prompt_mode'). The shared exclusiveGroup is what makes prompt wireable on
        // the flow canvas AND lets the generate gate reject a zero-input music block.
        {
          ...textField(
            'prompt',
            'Prompt',
            'Describe the music to plan when no composition plan is supplied.',
          ),
          required: false,
          exclusiveGroup: 'prompt_mode',
        },
        {
          ...compositionPlanField(
            'composition_plan',
            'Composition Plan',
            'Structured ElevenLabs Music composition plan for planned storyboard music.',
          ),
          exclusiveGroup: 'prompt_mode',
        },
        numberField(
          'music_length_ms',
          'Music Length (ms)',
          'Length for prompt-based plan creation, from 3,000 to 600,000 ms.',
          30_000,
          3_000,
          600_000,
        ),
        // Legacy prompt-based duration field retained so existing callers keep validating.
        numberField(
          'duration',
          'Duration (seconds)',
          'Legacy length field; converted to music_length_ms for plan creation.',
          30,
          3,
          600,
        ),
        booleanField(
          'respect_sections_durations',
          'Respect Section Durations',
          'Whether ElevenLabs should strictly follow composition plan section durations.',
          true,
        ),
        enumField(
          'model_id',
          'Model',
          'ElevenLabs Music model id.',
          ['music_v1'],
          'music_v1',
        ),
        booleanField(
          'force_instrumental',
          'Force Instrumental',
          'For prompt-based plan creation, strip lyrics and avoid vocals by default.',
          true,
        ),
        booleanField(
          'regenerate_composition_plan',
          'Regenerate Plan',
          'When true, create a fresh composition plan from prompt before composing.',
          false,
        ),
        compositionPlanField(
          'source_composition_plan',
          'Source Composition Plan',
          'Optional source plan for prompt-based plan regeneration.',
        ),
      ],
    },
  },
];
