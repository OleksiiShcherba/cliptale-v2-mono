import { describe, it, expect } from 'vitest';

import { FAL_MODELS, type FalFieldType } from './fal-models.js';

describe('fal-models catalog', () => {
  it('has exactly 9 models', () => {
    expect(FAL_MODELS).toHaveLength(9);
  });

  it('every model has provider: "fal"', () => {
    for (const model of FAL_MODELS) {
      expect(model.provider, model.id).toBe('fal');
    }
  });

  it('every model has a group of "images" or "videos"', () => {
    for (const model of FAL_MODELS) {
      expect(['images', 'videos'], model.id).toContain(model.group);
    }
  });

  it('every model has a non-empty input schema', () => {
    for (const model of FAL_MODELS) {
      expect(model.inputSchema.fields.length).toBeGreaterThan(0);
    }
  });

  it('every required field has a label', () => {
    for (const model of FAL_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.required) {
          expect(field.label, `${model.id}.${field.name}`).toBeTruthy();
        }
      }
    }
  });

  it('every enum field lists allowed values', () => {
    for (const model of FAL_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.type === 'enum') {
          expect(field.enum, `${model.id}.${field.name}`).toBeDefined();
          expect(field.enum!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every model ID is unique', () => {
    const ids = FAL_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every model has at least one required field (the prompt or image_url)', () => {
    for (const model of FAL_MODELS) {
      const hasRequired = model.inputSchema.fields.some((f) => f.required);
      expect(hasRequired, model.id).toBe(true);
    }
  });

  it('no model has capability "audio" or any audio variant', () => {
    for (const model of FAL_MODELS) {
      expect([
        'text_to_image',
        'image_edit',
        'text_to_video',
        'image_to_video',
      ]).toContain(model.capability);
    }
  });

  it('kling/o3 includes both prompt and multi_prompt (XOR enforced by BE, not schema)', () => {
    const kling = FAL_MODELS.find(
      (m) => m.id === 'fal-ai/kling-video/o3/standard/image-to-video'
    );
    expect(kling).toBeDefined();
    const fieldNames = kling!.inputSchema.fields.map((f) => f.name);
    expect(fieldNames).toContain('prompt');
    expect(fieldNames).toContain('multi_prompt');
  });

  it('ltx-2-19b does NOT include video_size (dropped per Gap 2)', () => {
    const ltx = FAL_MODELS.find(
      (m) => m.id === 'fal-ai/ltx-2-19b/image-to-video'
    );
    expect(ltx).toBeDefined();
    const fieldNames = ltx!.inputSchema.fields.map((f) => f.name);
    expect(fieldNames).not.toContain('video_size');
  });

  it('no fal model uses the voice_picker field type (voice_picker is ElevenLabs-only)', () => {
    for (const model of FAL_MODELS) {
      for (const field of model.inputSchema.fields) {
        expect(field.type, `${model.id}.${field.name}`).not.toBe('voice_picker');
      }
    }
  });
});

describe('FalFieldType union', () => {
  it('includes voice_picker as a valid type', () => {
    // This test verifies the type union assignment compiles and is exhaustive.
    // If 'voice_picker' were removed from FalFieldType, this line would cause a
    // TypeScript compile error (type 'voice_picker' is not assignable to FalFieldType).
    const voicePickerType: FalFieldType = 'voice_picker';
    expect(voicePickerType).toBe('voice_picker');
  });

  it('includes all expected field types', () => {
    const expectedTypes: FalFieldType[] = [
      'string',
      'text',
      'number',
      'boolean',
      'enum',
      'image_url',
      'image_url_list',
      'string_list',
      'audio_url',
      'audio_upload',
      'voice_picker',
    ];
    // Verify each expected type is assignable (compile-time check covered by TypeScript;
    // this runtime loop documents the full set for readers).
    for (const t of expectedTypes) {
      expect(typeof t).toBe('string');
    }
    expect(expectedTypes).toHaveLength(11);
  });
});
