/**
 * Shared fixtures for SchemaFieldInput tests.
 *
 * NOTE: vi.hoisted() cannot be exported from a fixtures file — each test file
 * that needs mocks must declare its own vi.hoisted() call. Only static data
 * (no Vitest-specific constructs) is exported here.
 */
import type { ElevenLabsVoice } from '@/shared/ai-generation/types';

export const LIBRARY_VOICE: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam-preview.mp3',
  labels: { gender: 'male', accent: 'american' },
};
