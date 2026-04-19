/**
 * Unit tests for clips.controller.ts — Zod schema validation.
 *
 * Verifies that `createClipSchema` correctly accepts all supported clip types
 * including the new 'caption' type added in C5, and rejects unknown types.
 */
import { describe, it, expect } from 'vitest';

import { createClipSchema } from './clips.controller.js';

const BASE_VALID_BODY = {
  clipId: '10000000-0000-0000-0000-000000000001',
  trackId: '20000000-0000-0000-0000-000000000001',
  startFrame: 0,
  durationFrames: 30,
};

describe('createClipSchema', () => {
  describe('type field', () => {
    it('accepts type = video', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY, type: 'video' });
      expect(result.success).toBe(true);
    });

    it('accepts type = audio', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY, type: 'audio' });
      expect(result.success).toBe(true);
    });

    it('accepts type = text-overlay', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY, type: 'text-overlay' });
      expect(result.success).toBe(true);
    });

    it('accepts type = image', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY, type: 'image' });
      expect(result.success).toBe(true);
    });

    it('accepts type = caption', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY, type: 'caption' });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown type', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY, type: 'unknown-type' });
      expect(result.success).toBe(false);
    });

    it('rejects when type is missing', () => {
      const result = createClipSchema.safeParse({ ...BASE_VALID_BODY });
      expect(result.success).toBe(false);
    });
  });

  describe('other required fields', () => {
    it('rejects when clipId is not a valid UUID', () => {
      const result = createClipSchema.safeParse({
        ...BASE_VALID_BODY,
        type: 'video',
        clipId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects when durationFrames is zero', () => {
      const result = createClipSchema.safeParse({
        ...BASE_VALID_BODY,
        type: 'video',
        durationFrames: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects when startFrame is negative', () => {
      const result = createClipSchema.safeParse({
        ...BASE_VALID_BODY,
        type: 'video',
        startFrame: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    it('accepts caption type with optional fileId null', () => {
      const result = createClipSchema.safeParse({
        ...BASE_VALID_BODY,
        type: 'caption',
        fileId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts caption type with layer and trimInFrames', () => {
      const result = createClipSchema.safeParse({
        ...BASE_VALID_BODY,
        type: 'caption',
        layer: 1,
        trimInFrames: 5,
      });
      expect(result.success).toBe(true);
    });
  });
});
