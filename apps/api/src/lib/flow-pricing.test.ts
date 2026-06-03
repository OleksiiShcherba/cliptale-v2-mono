/**
 * T9 — static flow-pricing table unit tests.
 *
 * Tests cover:
 *  - FLOW_PRICE_TABLE is exported and is a plain Record
 *  - every catalog model id has an entry
 *  - getPriceForModel returns a known price for known models
 *  - getPriceForModel returns a fallback / undefined for unknown models
 */
import { describe, expect, it } from 'vitest';
import { FLOW_PRICE_TABLE, getPriceForModel } from './flow-pricing.js';
import { AI_MODELS } from '@ai-video-editor/api-contracts';

describe('FLOW_PRICE_TABLE', () => {
  it('is a non-empty object', () => {
    expect(typeof FLOW_PRICE_TABLE).toBe('object');
    expect(Object.keys(FLOW_PRICE_TABLE).length).toBeGreaterThan(0);
  });

  it('every catalog model id has a price entry', () => {
    for (const model of AI_MODELS) {
      expect(
        Object.prototype.hasOwnProperty.call(FLOW_PRICE_TABLE, model.id),
        `Missing price entry for model: ${model.id}`,
      ).toBe(true);
    }
  });

  it('each price is a finite non-negative number', () => {
    for (const [modelId, price] of Object.entries(FLOW_PRICE_TABLE)) {
      expect(typeof price, `price for ${modelId} must be a number`).toBe('number');
      expect(isFinite(price as number), `price for ${modelId} must be finite`).toBe(true);
      expect((price as number) >= 0, `price for ${modelId} must be >= 0`).toBe(true);
    }
  });
});

describe('getPriceForModel', () => {
  it('returns a number for a known model (fal-ai/ltx-2-19b/image-to-video)', () => {
    const price = getPriceForModel('fal-ai/ltx-2-19b/image-to-video');
    expect(typeof price).toBe('number');
    expect(price).toBeGreaterThanOrEqual(0);
  });

  it('returns a number for a known model (fal-ai/kling-video/o3/standard/image-to-video)', () => {
    const price = getPriceForModel('fal-ai/kling-video/o3/standard/image-to-video');
    expect(typeof price).toBe('number');
    expect(price).toBeGreaterThanOrEqual(0);
  });

  it('returns a number for a known model (elevenlabs/text-to-speech)', () => {
    const price = getPriceForModel('elevenlabs/text-to-speech');
    expect(typeof price).toBe('number');
    expect(price).toBeGreaterThanOrEqual(0);
  });

  it('returns undefined for an unknown model id', () => {
    const price = getPriceForModel('unknown-vendor/nonexistent-model-xyz');
    expect(price).toBeUndefined();
  });
});
