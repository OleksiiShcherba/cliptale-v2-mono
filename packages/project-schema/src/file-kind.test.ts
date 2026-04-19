import { describe, it, expect } from 'vitest';

import { mimeToKind } from './file-kind.js';

describe('mimeToKind', () => {
  it('returns "video" for video/mp4', () => {
    expect(mimeToKind('video/mp4')).toBe('video');
  });

  it('returns "video" for video/webm', () => {
    expect(mimeToKind('video/webm')).toBe('video');
  });

  it('returns "audio" for audio/mpeg', () => {
    expect(mimeToKind('audio/mpeg')).toBe('audio');
  });

  it('returns "audio" for audio/wav', () => {
    expect(mimeToKind('audio/wav')).toBe('audio');
  });

  it('returns "image" for image/png', () => {
    expect(mimeToKind('image/png')).toBe('image');
  });

  it('returns "image" for image/jpeg', () => {
    expect(mimeToKind('image/jpeg')).toBe('image');
  });

  it('returns "document" for text/plain', () => {
    expect(mimeToKind('text/plain')).toBe('document');
  });

  it('returns "document" for text/vtt', () => {
    expect(mimeToKind('text/vtt')).toBe('document');
  });

  it('returns "document" for application/x-subrip', () => {
    expect(mimeToKind('application/x-subrip')).toBe('document');
  });

  it('returns "other" for application/octet-stream', () => {
    expect(mimeToKind('application/octet-stream')).toBe('other');
  });

  it('returns "other" for unknown mime type', () => {
    expect(mimeToKind('application/pdf')).toBe('other');
  });

  it('returns "other" for null', () => {
    expect(mimeToKind(null)).toBe('other');
  });

  it('returns "other" for undefined', () => {
    expect(mimeToKind(undefined)).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(mimeToKind('')).toBe('other');
  });
});
