/**
 * Unit tests for fileLinks.response.service — cursor encode/decode helpers.
 *
 * Does not require a live DB — all cursor operations are pure Base64/string.
 */
import { describe, it, expect } from 'vitest';
import { encodeProjectCursor, decodeProjectCursor } from './fileLinks.response.service.js';
import { ValidationError } from '@/lib/errors.js';

describe('fileLinks.response.service — cursor encoding', () => {
  describe('encodeProjectCursor', () => {
    it('returns a non-empty string', () => {
      const cursor = encodeProjectCursor(new Date('2026-04-21T10:00:00.000Z'), 'abc-123');
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
    });

    it('produces different outputs for different inputs', () => {
      const a = encodeProjectCursor(new Date('2026-04-21T10:00:00.000Z'), 'file-1');
      const b = encodeProjectCursor(new Date('2026-04-21T11:00:00.000Z'), 'file-1');
      const c = encodeProjectCursor(new Date('2026-04-21T10:00:00.000Z'), 'file-2');
      expect(a).not.toBe(b);
      expect(a).not.toBe(c);
    });

    it('is valid base64', () => {
      const cursor = encodeProjectCursor(new Date('2026-04-21T10:00:00.000Z'), 'some-uuid');
      // Base64 characters only (and padding)
      expect(cursor).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe('decodeProjectCursor', () => {
    it('round-trips a valid cursor', () => {
      const date = new Date('2026-04-21T12:34:56.789Z');
      const fileId = 'f1a2b3c4-d5e6-7890-abcd-ef1234567890';
      const encoded = encodeProjectCursor(date, fileId);
      const decoded = decodeProjectCursor(encoded);

      expect(decoded.createdAt.toISOString()).toBe(date.toISOString());
      expect(decoded.fileId).toBe(fileId);
    });

    it('throws ValidationError for a plaintext garbage string', () => {
      expect(() => decodeProjectCursor('not-a-cursor!!!!')).toThrow(ValidationError);
    });

    it('throws ValidationError when the base64 payload lacks a pipe separator', () => {
      const noPipe = Buffer.from('2026-04-21T00:00:00.000Z', 'utf8').toString('base64');
      expect(() => decodeProjectCursor(noPipe)).toThrow(ValidationError);
    });

    it('throws ValidationError when the ISO date part is not a valid date', () => {
      const badDate = Buffer.from('not-a-date|some-file-id', 'utf8').toString('base64');
      expect(() => decodeProjectCursor(badDate)).toThrow(ValidationError);
    });

    it('throws ValidationError when the pipe is at position 0 (empty date part)', () => {
      const emptyDate = Buffer.from('|some-file-id', 'utf8').toString('base64');
      expect(() => decodeProjectCursor(emptyDate)).toThrow(ValidationError);
    });

    it('throws ValidationError when the pipe is at the last position (empty fileId part)', () => {
      const emptyId = Buffer.from('2026-04-21T00:00:00.000Z|', 'utf8').toString('base64');
      expect(() => decodeProjectCursor(emptyId)).toThrow(ValidationError);
    });
  });
});
