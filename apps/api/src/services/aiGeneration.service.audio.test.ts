/**
 * Unit tests for submitGeneration — ElevenLabs audio model paths.
 *
 * Verifies that all four ElevenLabs capabilities are accepted by the service,
 * that the provider discriminator lands in the enqueue payload, that audio
 * field types (audio_upload, text) validate correctly, and that fal-specific
 * guards (kling-o3 XOR) are not applied to ElevenLabs models.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { ValidationError } from '@/lib/errors.js';

import {
  createJobMock,
  enqueueMock,
  FIXED_JOB_ID,
  resetMocks,
  TEST_PROJECT,
  TEST_USER,
} from './aiGeneration.service.fixtures.js';

// Import after fixtures so the service binds to the mocked modules.
const { submitGeneration } = await import('./aiGeneration.service.js');

beforeEach(() => {
  resetMocks();
});

// ── text_to_speech ────────────────────────────────────────────────────────────

describe('aiGeneration.service / ElevenLabs text_to_speech', () => {
  const MODEL = 'elevenlabs/text-to-speech';

  it('happy path: enqueues with provider=elevenlabs and capability=text_to_speech', async () => {
    const result = await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: MODEL,
      options: { text: 'Hello world' },
    });

    expect(result).toEqual({ jobId: FIXED_JOB_ID, status: 'queued' });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: MODEL,
        capability: 'text_to_speech',
        provider: 'elevenlabs',
      }),
    );
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: MODEL,
        capability: 'text_to_speech',
      }),
    );
  });

  it('accepts optional voice_id, stability, and similarity_boost', async () => {
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: MODEL,
      options: { text: 'Hi', voice_id: 'v-abc', stability: 0.6, similarity_boost: 0.8 },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          text: 'Hi',
          voice_id: 'v-abc',
          stability: 0.6,
          similarity_boost: 0.8,
        }),
      }),
    );
  });

  it('throws ValidationError when required text field is missing', async () => {
    await expect(
      submitGeneration(TEST_USER, TEST_PROJECT, {
        modelId: MODEL,
        options: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('throws ValidationError for unknown field', async () => {
    await expect(
      submitGeneration(TEST_USER, TEST_PROJECT, {
        modelId: MODEL,
        options: { text: 'Hi', unknown_field: true },
      }),
    ).rejects.toThrow(/Unknown field 'unknown_field'/);
  });
});

// ── voice_cloning ─────────────────────────────────────────────────────────────

describe('aiGeneration.service / ElevenLabs voice_cloning', () => {
  const MODEL = 'elevenlabs/voice-cloning';

  it('happy path: audio_upload value passes through as-is (presigned URL)', async () => {
    const uploadUrl = 'https://s3.example.com/presigned-audio.mp3';
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: MODEL,
      options: { name: 'My Clone', audio_sample: uploadUrl },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'voice_cloning',
        provider: 'elevenlabs',
        options: expect.objectContaining({
          name: 'My Clone',
          audio_sample: uploadUrl,
        }),
      }),
    );
  });

  it('throws ValidationError when required name field is missing', async () => {
    await expect(
      submitGeneration(TEST_USER, TEST_PROJECT, {
        modelId: MODEL,
        options: { audio_sample: 'https://example.com/audio.mp3' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── music_generation ──────────────────────────────────────────────────────────

describe('aiGeneration.service / ElevenLabs music_generation', () => {
  const MODEL = 'elevenlabs/music-generation';

  it('happy path: enqueues with correct capability and provider', async () => {
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: MODEL,
      options: { prompt: 'calm jazz' },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'music_generation',
        provider: 'elevenlabs',
        prompt: 'calm jazz',
      }),
    );
  });

  it('accepts optional duration field', async () => {
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: MODEL,
      options: { prompt: 'epic drums', duration: 60 },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ duration: 60 }),
      }),
    );
  });
});

// ── speech_to_speech ──────────────────────────────────────────────────────────

describe('aiGeneration.service / ElevenLabs speech_to_speech', () => {
  const MODEL = 'elevenlabs/speech-to-speech';

  it('happy path: enqueues with correct capability and provider', async () => {
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: MODEL,
      options: {
        source_audio: 'https://s3.example.com/presigned-source.mp3',
        voice_id: 'target-voice',
      },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'speech_to_speech',
        provider: 'elevenlabs',
      }),
    );
  });

  it('throws ValidationError when required voice_id is missing', async () => {
    await expect(
      submitGeneration(TEST_USER, TEST_PROJECT, {
        modelId: MODEL,
        options: { source_audio: 'https://example.com/audio.mp3' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── Provider discriminator ────────────────────────────────────────────────────

describe('aiGeneration.service / provider discriminator in enqueue payload', () => {
  it('fal.ai models enqueue with provider=fal', async () => {
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'test',
      options: {},
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'fal' }),
    );
  });

  it('ElevenLabs models enqueue with provider=elevenlabs', async () => {
    await submitGeneration(TEST_USER, TEST_PROJECT, {
      modelId: 'elevenlabs/text-to-speech',
      options: { text: 'hi' },
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'elevenlabs' }),
    );
  });
});
