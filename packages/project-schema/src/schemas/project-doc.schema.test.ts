import { describe, it, expect } from 'vitest';

import { projectDocSchema } from './project-doc.schema.js';

const baseDoc = {
  schemaVersion: 1 as const,
  id: '00000000-0000-0000-0000-000000000001',
  title: 'My Project',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [],
  clips: [],
  createdAt: '2026-03-29T00:00:00.000Z',
  updatedAt: '2026-03-29T00:00:00.000Z',
};

describe('projectDocSchema', () => {
  describe('parse', () => {
    it('should parse a valid project document', () => {
      const result = projectDocSchema.safeParse(baseDoc);
      expect(result.success).toBe(true);
    });

    it('should apply default fps of 30 when omitted', () => {
      const { fps: _fps, ...withoutFps } = baseDoc;
      const result = projectDocSchema.safeParse(withoutFps);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.fps).toBe(30);
    });

    it('should apply default width=1920 and height=1080 when omitted', () => {
      const { width: _w, height: _h, ...minimal } = baseDoc;
      const result = projectDocSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(1920);
        expect(result.data.height).toBe(1080);
      }
    });

    it('should reject a document with wrong schemaVersion', () => {
      const result = projectDocSchema.safeParse({ ...baseDoc, schemaVersion: 2 });
      expect(result.success).toBe(false);
    });

    it('should reject a document missing required id', () => {
      const { id: _id, ...withoutId } = baseDoc;
      const result = projectDocSchema.safeParse(withoutId);
      expect(result.success).toBe(false);
    });

    it('should reject a document with negative durationFrames', () => {
      const result = projectDocSchema.safeParse({ ...baseDoc, durationFrames: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject a document with invalid createdAt datetime', () => {
      const result = projectDocSchema.safeParse({ ...baseDoc, createdAt: 'not-a-date' });
      expect(result.success).toBe(false);
    });
  });
});
