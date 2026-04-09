import { describe, it, expect } from 'vitest';

import type { AiProvider, AiGenerationType } from './types';
import { PROVIDER_CATALOG } from './types';

describe('ai-providers/types', () => {
  describe('PROVIDER_CATALOG', () => {
    it('contains all 8 providers', () => {
      expect(PROVIDER_CATALOG).toHaveLength(8);
    });

    it('includes every valid provider identifier', () => {
      const providers = PROVIDER_CATALOG.map((p) => p.provider);
      const expected: AiProvider[] = [
        'openai',
        'runway',
        'stability_ai',
        'elevenlabs',
        'kling',
        'pika',
        'suno',
        'replicate',
      ];
      expect(providers).toEqual(expect.arrayContaining(expected));
    });

    it('has no duplicate providers', () => {
      const providers = PROVIDER_CATALOG.map((p) => p.provider);
      expect(new Set(providers).size).toBe(providers.length);
    });

    it('every entry has a non-empty name and description', () => {
      for (const entry of PROVIDER_CATALOG) {
        expect(entry.name.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });

    it('every entry has at least one supported type', () => {
      for (const entry of PROVIDER_CATALOG) {
        expect(entry.supportedTypes.length).toBeGreaterThan(0);
      }
    });

    it('only uses valid generation types', () => {
      const validTypes: AiGenerationType[] = ['image', 'video', 'audio', 'text'];
      for (const entry of PROVIDER_CATALOG) {
        for (const t of entry.supportedTypes) {
          expect(validTypes).toContain(t);
        }
      }
    });

    it('maps image type to openai, stability_ai, and replicate', () => {
      const imageProviders = PROVIDER_CATALOG
        .filter((p) => p.supportedTypes.includes('image'))
        .map((p) => p.provider);
      expect(imageProviders).toEqual(
        expect.arrayContaining(['openai', 'stability_ai', 'replicate']),
      );
    });

    it('maps video type to runway, kling, and pika', () => {
      const videoProviders = PROVIDER_CATALOG
        .filter((p) => p.supportedTypes.includes('video'))
        .map((p) => p.provider);
      expect(videoProviders).toEqual(
        expect.arrayContaining(['runway', 'kling', 'pika']),
      );
    });

    it('maps audio type to elevenlabs and suno', () => {
      const audioProviders = PROVIDER_CATALOG
        .filter((p) => p.supportedTypes.includes('audio'))
        .map((p) => p.provider);
      expect(audioProviders).toEqual(
        expect.arrayContaining(['elevenlabs', 'suno']),
      );
    });

    it('maps text type to openai', () => {
      const textProviders = PROVIDER_CATALOG
        .filter((p) => p.supportedTypes.includes('text'))
        .map((p) => p.provider);
      expect(textProviders).toEqual(expect.arrayContaining(['openai']));
    });
  });
});
