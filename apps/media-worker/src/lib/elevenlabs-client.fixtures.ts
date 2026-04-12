/** Shared test fixtures for elevenlabs-client test suite. */

export const API_KEY = 'el-test-key';
export const VOICE_ID = 'voice-abc-123';
export const AUDIO_BYTES = Buffer.from([0x49, 0x44, 0x33]); // fake mp3 header
export const FILENAME = 'sample.mp3';

export function audioResponse(bytes: Uint8Array = AUDIO_BYTES, init: ResponseInit = {}): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
    ...init,
  });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

export function errorResponse(status: number, body = 'upstream error'): Response {
  return new Response(body, { status });
}
