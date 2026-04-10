/**
 * Unit tests for the fal.ai options validator.
 *
 * The validator is a pure function over the real `FAL_MODELS` catalog; no
 * mocks required.
 */
import { describe, it, expect } from 'vitest';
import { FAL_MODELS } from '@ai-video-editor/api-contracts';

import { validateFalOptions } from './falOptions.validator.js';

function findModel(id: string) {
  const model = FAL_MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`fixture lookup failed: ${id}`);
  return model;
}

describe('validateFalOptions', () => {
  it('accepts a valid minimal text-to-image request', () => {
    const model = findModel('fal-ai/nano-banana-2');
    const result = validateFalOptions(model, { prompt: 'a cat on a rug' });
    expect(result.ok).toBe(true);
  });

  it('rejects when a required field is missing', () => {
    const model = findModel('fal-ai/nano-banana-2');
    const result = validateFalOptions(model, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /'prompt'.*required/.test(e))).toBe(
        true,
      );
    }
  });

  it('rejects unknown keys', () => {
    const model = findModel('fal-ai/nano-banana-2');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      bogus_key: 'nope',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /bogus_key/.test(e))).toBe(true);
    }
  });

  it('rejects wrong type on a number field', () => {
    const model = findModel('fal-ai/nano-banana-2');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      num_images: 'not a number',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range number with min/max constraints', () => {
    // pixverse model has duration with min=1 max=15.
    const model = findModel('fal-ai/pixverse/v6/image-to-video');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      image_url: 'https://example.com/a.jpg',
      duration: 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /duration.*<= 15/.test(e))).toBe(true);
    }
  });

  it('rejects enum mismatch', () => {
    const model = findModel('fal-ai/nano-banana-2');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      resolution: '16K',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid enum value', () => {
    const model = findModel('fal-ai/nano-banana-2');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      resolution: '2K',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects non-string image_url', () => {
    const model = findModel('fal-ai/ltx-2-19b/image-to-video');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      image_url: 123,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects empty image_url_list', () => {
    const model = findModel('fal-ai/nano-banana-2/edit');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      image_urls: [],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid image_url_list', () => {
    const model = findModel('fal-ai/nano-banana-2/edit');
    const result = validateFalOptions(model, {
      prompt: 'hi',
      image_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects non-array string_list', () => {
    const model = findModel('fal-ai/kling-video/o3/standard/image-to-video');
    const result = validateFalOptions(model, {
      image_url: 'https://example.com/a.jpg',
      multi_prompt: 'not an array',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid string_list', () => {
    const model = findModel('fal-ai/kling-video/o3/standard/image-to-video');
    const result = validateFalOptions(model, {
      image_url: 'https://example.com/a.jpg',
      multi_prompt: ['one', 'two'],
    });
    expect(result.ok).toBe(true);
  });
});
