import { describe, it, expect } from 'vitest';

import { trackSchema } from './track.schema.js';

const baseTrack = {
  id: '00000000-0000-0000-0000-000000000010',
  type: 'video' as const,
  name: 'Video Track 1',
};

describe('trackSchema', () => {
  describe('happy path', () => {
    it('should parse a valid video track', () => {
      expect(trackSchema.safeParse(baseTrack).success).toBe(true);
    });

    it('should parse all valid track types', () => {
      const types = ['video', 'audio', 'caption', 'overlay'] as const;
      for (const type of types) {
        expect(trackSchema.safeParse({ ...baseTrack, type }).success).toBe(true);
      }
    });
  });

  describe('defaults', () => {
    it('should default muted to false', () => {
      const result = trackSchema.safeParse(baseTrack);
      expect(result.success && result.data.muted).toBe(false);
    });

    it('should default locked to false', () => {
      const result = trackSchema.safeParse(baseTrack);
      expect(result.success && result.data.locked).toBe(false);
    });

    it('should preserve muted=true when explicitly set', () => {
      const result = trackSchema.safeParse({ ...baseTrack, muted: true });
      expect(result.success && result.data.muted).toBe(true);
    });

    it('should preserve locked=true when explicitly set', () => {
      const result = trackSchema.safeParse({ ...baseTrack, locked: true });
      expect(result.success && result.data.locked).toBe(true);
    });
  });

  describe('validation — required fields', () => {
    it('should reject a track missing id', () => {
      const { id: _id, ...withoutId } = baseTrack;
      expect(trackSchema.safeParse(withoutId).success).toBe(false);
    });

    it('should reject a track with a non-UUID id', () => {
      expect(trackSchema.safeParse({ ...baseTrack, id: 'not-a-uuid' }).success).toBe(false);
    });

    it('should reject a track missing name', () => {
      const { name: _name, ...withoutName } = baseTrack;
      expect(trackSchema.safeParse(withoutName).success).toBe(false);
    });

    it('should reject a track missing type', () => {
      const { type: _type, ...withoutType } = baseTrack;
      expect(trackSchema.safeParse(withoutType).success).toBe(false);
    });
  });

  describe('validation — type enum', () => {
    it('should reject an unknown track type', () => {
      expect(trackSchema.safeParse({ ...baseTrack, type: 'subtitle' }).success).toBe(false);
    });

    it('should reject a numeric type value', () => {
      expect(trackSchema.safeParse({ ...baseTrack, type: 1 }).success).toBe(false);
    });
  });
});
