import { describe, it, expect } from 'vitest';

import {
  ELEVENLABS_MODELS,
  AUDIO_CAPABILITY_TO_GROUP,
  type AudioCapability,
} from './elevenlabs-models.js';
import { AI_MODELS } from './index.js';

describe('elevenlabs-models catalog', () => {
  it('has exactly 4 models', () => {
    expect(ELEVENLABS_MODELS).toHaveLength(4);
  });

  it('every model has provider: "elevenlabs"', () => {
    for (const model of ELEVENLABS_MODELS) {
      expect(model.provider, model.id).toBe('elevenlabs');
    }
  });

  it('every model has group: "audio"', () => {
    for (const model of ELEVENLABS_MODELS) {
      expect(model.group, model.id).toBe('audio');
    }
  });

  it('covers all four audio capabilities exactly once', () => {
    const capabilities = ELEVENLABS_MODELS.map((m) => m.capability).sort();
    expect(capabilities).toEqual([
      'music_generation',
      'speech_to_speech',
      'text_to_speech',
      'voice_cloning',
    ]);
  });

  it('every model has a non-empty input schema', () => {
    for (const model of ELEVENLABS_MODELS) {
      expect(model.inputSchema.fields.length, model.id).toBeGreaterThan(0);
    }
  });

  it('every required field has a label', () => {
    for (const model of ELEVENLABS_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.required) {
          expect(field.label, `${model.id}.${field.name}`).toBeTruthy();
        }
      }
    }
  });

  it('every model ID is unique and prefixed with "elevenlabs/"', () => {
    const ids = ELEVENLABS_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith('elevenlabs/')).toBe(true);
    }
  });

  it('text_to_speech has a "text" required field', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'text_to_speech');
    expect(model).toBeDefined();
    const textField = model!.inputSchema.fields.find((f) => f.name === 'text');
    expect(textField).toBeDefined();
    expect(textField!.required).toBe(true);
  });

  it('voice_cloning has an "audio_upload" required field', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'voice_cloning');
    expect(model).toBeDefined();
    const uploadField = model!.inputSchema.fields.find((f) => f.type === 'audio_upload');
    expect(uploadField).toBeDefined();
    expect(uploadField!.required).toBe(true);
  });

  it('speech_to_speech has an "audio_upload" required field and a voice_id field', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'speech_to_speech');
    expect(model).toBeDefined();
    const fields = model!.inputSchema.fields;
    expect(fields.some((f) => f.type === 'audio_upload' && f.required)).toBe(true);
    expect(fields.some((f) => f.name === 'voice_id' && f.required)).toBe(true);
  });

  it('music_generation has a "prompt" required field and optional "duration"', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'music_generation');
    expect(model).toBeDefined();
    const fields = model!.inputSchema.fields;
    expect(fields.some((f) => f.name === 'prompt' && f.required)).toBe(true);
    const duration = fields.find((f) => f.name === 'duration');
    expect(duration).toBeDefined();
    expect(duration!.required).toBe(false);
  });
});

describe('AUDIO_CAPABILITY_TO_GROUP', () => {
  const audioCapabilities: AudioCapability[] = [
    'text_to_speech',
    'voice_cloning',
    'speech_to_speech',
    'music_generation',
  ];

  it('maps every audio capability to "audio"', () => {
    for (const cap of audioCapabilities) {
      expect(AUDIO_CAPABILITY_TO_GROUP[cap]).toBe('audio');
    }
  });
});

describe('AI_MODELS unified catalog', () => {
  it('contains all fal + elevenlabs models (13 total)', () => {
    expect(AI_MODELS).toHaveLength(13);
  });

  it('all model IDs are unique across providers', () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('can discriminate models by provider', () => {
    const falModels = AI_MODELS.filter((m) => m.provider === 'fal');
    const elevenLabsModels = AI_MODELS.filter((m) => m.provider === 'elevenlabs');
    expect(falModels).toHaveLength(9);
    expect(elevenLabsModels).toHaveLength(4);
  });
});
