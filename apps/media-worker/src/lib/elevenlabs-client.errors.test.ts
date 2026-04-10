import { describe, it, expect } from 'vitest';

import { ElevenLabsError } from './elevenlabs-client.js';

// ── ElevenLabsError ──────────────────────────────────────────────────────────

describe('ElevenLabsError', () => {
  it('includes operation and status in message', () => {
    const err = new ElevenLabsError(401, '{"error":"Unauthorized"}', 'text-to-speech');
    expect(err.message).toMatch(/text-to-speech/);
    expect(err.message).toMatch(/401/);
    expect(err.name).toBe('ElevenLabsError');
  });

  it('includes optional detail when provided', () => {
    const err = new ElevenLabsError(200, '{}', 'voice-cloning', 'response missing voice_id');
    expect(err.message).toMatch(/response missing voice_id/);
  });

  it('exposes statusCode, rawBody, and operation properties', () => {
    const rawBody = '{"error":"Rate limit exceeded"}';
    const err = new ElevenLabsError(429, rawBody, 'text-to-speech');
    expect(err.statusCode).toBe(429);
    expect(err.rawBody).toBe(rawBody);
    expect(err.operation).toBe('text-to-speech');
  });

  it('truncates rawBody in message to first 200 characters when very long', () => {
    const longBody = 'x'.repeat(300);
    const err = new ElevenLabsError(500, longBody, 'music-generation');
    expect(err.message).toContain('x'.repeat(200));
    expect(err.message).not.toContain('x'.repeat(201));
  });
});
