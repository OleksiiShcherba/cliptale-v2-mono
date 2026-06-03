/**
 * T5 — Catalog modality + exclusiveGroup + backfill
 *
 * Tests that:
 * 1. FalFieldSchema gains optional `modality` and `exclusiveGroup` fields.
 * 2. Every catalog field whose type implies a media kind carries the correct modality.
 * 3. kling/o3 `prompt` and `multi_prompt` share the same exclusiveGroup tag (XOR).
 * 4. No field that should have a modality is left without one (exhaustive backfill).
 *
 * AC-02: typed connection handles derive from per-field modality in the catalog.
 * AC-06: alternative-exclusivity groups (exactly-one-of) are expressed in the catalog.
 * AC-07: model-change reconciliation can identify handles by modality from the catalog.
 */
import { describe, it, expect } from 'vitest';

import { FAL_MODELS, type FalFieldSchema } from './fal-models.js';
import { ELEVENLABS_MODELS } from './elevenlabs-models.js';
import { AI_MODELS } from './index.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function fieldByName(fields: readonly FalFieldSchema[], name: string): FalFieldSchema | undefined {
  return fields.find((f) => f.name === name);
}

function modelById(id: string) {
  return AI_MODELS.find((m) => m.id === id);
}

// ── AC-02 / T5 — modality on fal models ──────────────────────────────────────

describe('FalFieldSchema modality — fal model representative fields', () => {
  it('ltx-2-19b: prompt field has modality "text"', () => {
    const model = modelById('fal-ai/ltx-2-19b/image-to-video');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'prompt');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('text');
  });

  it('ltx-2-19b: image_url field has modality "image"', () => {
    const model = modelById('fal-ai/ltx-2-19b/image-to-video');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'image_url');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('image');
  });

  it('ltx-2-19b: end_image_url field has modality "image"', () => {
    const model = modelById('fal-ai/ltx-2-19b/image-to-video');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'end_image_url');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('image');
  });

  it('nano-banana-2/edit: image_urls (image_url_list) field has modality "image"', () => {
    const model = modelById('fal-ai/nano-banana-2/edit');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'image_urls');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('image');
  });

  it('gpt-image-1.5/edit: mask_image_url field has modality "image"', () => {
    const model = modelById('fal-ai/gpt-image-1.5/edit');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'mask_image_url');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('image');
  });

  it('nano-banana-2 (text-to-image): prompt has modality "text", non-media fields have no modality', () => {
    const model = modelById('fal-ai/nano-banana-2');
    expect(model).toBeDefined();
    const promptField = fieldByName(model!.inputSchema.fields, 'prompt');
    expect(promptField!.modality).toBe('text');
    // num_images is not a media-typed field — it must have no modality
    const numImagesField = fieldByName(model!.inputSchema.fields, 'num_images');
    expect(numImagesField!.modality).toBeUndefined();
  });
});

// ── AC-06 / T5 — exclusiveGroup on kling/o3 ──────────────────────────────────

describe('FalFieldSchema exclusiveGroup — kling/o3 XOR', () => {
  it('kling/o3 prompt field carries an exclusiveGroup tag', () => {
    const model = modelById('fal-ai/kling-video/o3/standard/image-to-video');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'prompt');
    expect(field).toBeDefined();
    expect(field!.exclusiveGroup).toBeDefined();
    expect(typeof field!.exclusiveGroup).toBe('string');
  });

  it('kling/o3 multi_prompt field carries the SAME exclusiveGroup tag as prompt', () => {
    const model = modelById('fal-ai/kling-video/o3/standard/image-to-video');
    expect(model).toBeDefined();
    const prompt = fieldByName(model!.inputSchema.fields, 'prompt');
    const multi = fieldByName(model!.inputSchema.fields, 'multi_prompt');
    expect(prompt).toBeDefined();
    expect(multi).toBeDefined();
    expect(prompt!.exclusiveGroup).toBe(multi!.exclusiveGroup);
  });

  it('kling/o3 image_url field does NOT carry an exclusiveGroup (it is not part of the XOR)', () => {
    const model = modelById('fal-ai/kling-video/o3/standard/image-to-video');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'image_url');
    expect(field!.exclusiveGroup).toBeUndefined();
  });

  it('fields outside kling/o3 do not spuriously carry exclusiveGroup', () => {
    const model = modelById('fal-ai/ltx-2-19b/image-to-video');
    expect(model).toBeDefined();
    for (const field of model!.inputSchema.fields) {
      expect(field.exclusiveGroup, `ltx-2-19b.${field.name}`).toBeUndefined();
    }
  });
});

// ── AC-02 / T5 — modality on ElevenLabs models ───────────────────────────────

describe('FalFieldSchema modality — elevenlabs model representative fields', () => {
  it('text_to_speech: text field has modality "text"', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'text_to_speech');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'text');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('text');
  });

  it('voice_cloning: audio_sample (audio_upload) field has modality "audio"', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'voice_cloning');
    expect(model).toBeDefined();
    const field = model!.inputSchema.fields.find((f) => f.type === 'audio_upload');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('audio');
  });

  it('speech_to_speech: source_audio (audio_upload) field has modality "audio"', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'speech_to_speech');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'source_audio');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('audio');
  });

  it('music_generation: prompt (text) field has modality "text"', () => {
    const model = ELEVENLABS_MODELS.find((m) => m.capability === 'music_generation');
    expect(model).toBeDefined();
    const field = fieldByName(model!.inputSchema.fields, 'prompt');
    expect(field).toBeDefined();
    expect(field!.modality).toBe('text');
  });
});

// ── T5 — exhaustive backfill: no media-typed field missing a modality ─────────

describe('Exhaustive modality backfill — no media-typed field left without modality', () => {
  const MEDIA_FIELD_TYPES = new Set([
    'text',
    'image_url',
    'image_url_list',
    'audio_url',
    'audio_upload',
  ]);

  it('every fal model media-typed field carries a modality', () => {
    for (const model of FAL_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (MEDIA_FIELD_TYPES.has(field.type)) {
          expect(field.modality, `${model.id}.${field.name} (type=${field.type}) missing modality`).toBeDefined();
        }
      }
    }
  });

  it('every elevenlabs model media-typed field carries a modality', () => {
    for (const model of ELEVENLABS_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (MEDIA_FIELD_TYPES.has(field.type)) {
          expect(field.modality, `${model.id}.${field.name} (type=${field.type}) missing modality`).toBeDefined();
        }
      }
    }
  });

  it('non-media-typed fields (number, boolean, enum, string, etc.) do NOT carry a modality', () => {
    const NON_MEDIA_TYPES = new Set([
      'number', 'boolean', 'enum', 'string', 'string_list',
      'voice_picker', 'composition_plan',
    ]);
    for (const model of AI_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (NON_MEDIA_TYPES.has(field.type)) {
          expect(field.modality, `${model.id}.${field.name} should NOT have modality`).toBeUndefined();
        }
      }
    }
  });
});

// ── AC-07 / T5 — modality is correct per field type ──────────────────────────

describe('Modality values are correct per field type', () => {
  it('all image_url fields across catalog have modality "image"', () => {
    for (const model of AI_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.type === 'image_url') {
          expect(field.modality, `${model.id}.${field.name}`).toBe('image');
        }
      }
    }
  });

  it('all image_url_list fields across catalog have modality "image"', () => {
    for (const model of AI_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.type === 'image_url_list') {
          expect(field.modality, `${model.id}.${field.name}`).toBe('image');
        }
      }
    }
  });

  it('all audio_url fields across catalog have modality "audio"', () => {
    for (const model of AI_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.type === 'audio_url') {
          expect(field.modality, `${model.id}.${field.name}`).toBe('audio');
        }
      }
    }
  });

  it('all audio_upload fields across catalog have modality "audio"', () => {
    for (const model of AI_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.type === 'audio_upload') {
          expect(field.modality, `${model.id}.${field.name}`).toBe('audio');
        }
      }
    }
  });

  it('all text fields across catalog have modality "text"', () => {
    for (const model of AI_MODELS) {
      for (const field of model.inputSchema.fields) {
        if (field.type === 'text') {
          expect(field.modality, `${model.id}.${field.name}`).toBe('text');
        }
      }
    }
  });
});
