import { vi } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { Pool } from 'mysql2/promise';

import type { TranscriptionJobPayload } from '@ai-video-editor/project-schema';
import type { TranscribeJobDeps } from './transcribe.job.js';

// ── Whisper word / segment fixtures ──────────────────────────────────────────

// Whisper returns word timings as a single top-level `words` array
// (when `timestamp_granularities: ['word']` is requested), not nested
// inside segments. The job code buckets words into segments by start time.
export const MOCK_WORDS_SEG0 = [
  { word: 'Hello', start: 0.0, end: 0.8 },
  { word: 'world', start: 0.9, end: 1.4 },
];

export const MOCK_WORDS_SEG1 = [
  { word: 'Another', start: 2.5, end: 3.0 },
  { word: 'line', start: 3.1, end: 3.5 },
];

export const MOCK_TOP_LEVEL_WORDS = [...MOCK_WORDS_SEG0, ...MOCK_WORDS_SEG1];

export const MOCK_SEGMENTS = [
  { id: 0, seek: 0, start: 0.0, end: 2.5, text: '  Hello world  ', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
  { id: 1, seek: 0, start: 2.5, end: 5.0, text: '  Another line  ', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
];

// ── Mock singletons (referenced by both test files) ──────────────────────────

export const mockS3Send = vi.fn().mockResolvedValue({ Body: { pipe: vi.fn() } });
export const mockS3 = { send: mockS3Send } as unknown as S3Client;

export const mockDbExecute = vi.fn();
export const mockPool = { execute: mockDbExecute } as unknown as Pool;

export const mockTranscriptionsCreate = vi.fn().mockResolvedValue({
  task: 'transcribe',
  language: 'en',
  duration: 5.0,
  text: 'Hello world Another line',
  segments: MOCK_SEGMENTS,
  words: MOCK_TOP_LEVEL_WORDS,
});

export const mockOpenAI = {
  audio: {
    transcriptions: {
      create: mockTranscriptionsCreate,
    },
  },
} as unknown as OpenAI;

export const deps: TranscribeJobDeps = { s3: mockS3, pool: mockPool, openai: mockOpenAI };

// ── Job factory ───────────────────────────────────────────────────────────────

export function makeJob(payload: Partial<TranscriptionJobPayload> = {}): Job<TranscriptionJobPayload> {
  return {
    data: {
      assetId: 'file-123',
      storageUri: 's3://test-bucket/files/file-123/video.mp4',
      contentType: 'video/mp4',
      language: 'en',
      ...payload,
    },
  } as Job<TranscriptionJobPayload>;
}

// ── Default beforeEach reset helper ──────────────────────────────────────────

export function resetMocks(): void {
  vi.clearAllMocks();
  mockDbExecute.mockResolvedValue([[{ project_id: 'proj-001' }]]);
  mockS3Send.mockResolvedValue({ Body: { pipe: vi.fn() } });
  mockTranscriptionsCreate.mockResolvedValue({
    task: 'transcribe',
    language: 'en',
    duration: 5.0,
    text: 'Hello world Another line',
    segments: MOCK_SEGMENTS,
    words: MOCK_TOP_LEVEL_WORDS,
  });
}
