import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { Pool } from 'mysql2/promise';

import type { TranscriptionJobPayload } from '@ai-video-editor/project-schema';
import { parseStorageUri, processTranscribeJob, type TranscribeJobDeps } from './transcribe.job.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue('/tmp/transcribe-asset-123-abc'),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    write: vi.fn(),
    end: vi.fn(),
  }),
  createReadStream: vi.fn().mockReturnValue({ _isReadStream: true }),
}));

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('fixed-uuid-0000-0000-0000-000000000001'),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const MOCK_SEGMENTS = [
  { id: 0, seek: 0, start: 0.0, end: 2.5, text: '  Hello world  ', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
  { id: 1, seek: 0, start: 2.5, end: 5.0, text: '  Another line  ', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
];

const mockS3Send = vi.fn().mockResolvedValue({ Body: { pipe: vi.fn() } });
const mockS3 = { send: mockS3Send } as unknown as S3Client;

const mockDbExecute = vi.fn();
const mockPool = { execute: mockDbExecute } as unknown as Pool;

const mockTranscriptionsCreate = vi.fn().mockResolvedValue({
  task: 'transcribe',
  language: 'en',
  duration: 5.0,
  text: 'Hello world Another line',
  segments: MOCK_SEGMENTS,
});

const mockOpenAI = {
  audio: {
    transcriptions: {
      create: mockTranscriptionsCreate,
    },
  },
} as unknown as OpenAI;

const deps: TranscribeJobDeps = { s3: mockS3, pool: mockPool, openai: mockOpenAI };

function makeJob(payload: Partial<TranscriptionJobPayload> = {}): Job<TranscriptionJobPayload> {
  return {
    data: {
      assetId: 'asset-123',
      storageUri: 's3://test-bucket/projects/proj/assets/asset-123/video.mp4',
      contentType: 'video/mp4',
      language: 'en',
      ...payload,
    },
  } as Job<TranscriptionJobPayload>;
}

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('transcribe.job', () => {
  describe('parseStorageUri', () => {
    it('extracts bucket and key from a valid s3:// URI', () => {
      const result = parseStorageUri('s3://my-bucket/projects/p1/assets/a1/file.mp4');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'projects/p1/assets/a1/file.mp4' });
    });

    it('handles a key with no subdirectories', () => {
      const result = parseStorageUri('s3://bucket/file.mp4');
      expect(result).toEqual({ bucket: 'bucket', key: 'file.mp4' });
    });
  });

  // ── processTranscribeJob ──────────────────────────────────────────────────

  describe('processTranscribeJob', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default: asset found in DB
      mockDbExecute.mockResolvedValue([[{ project_id: 'proj-001' }]]);
      mockS3Send.mockResolvedValue({ Body: { pipe: vi.fn() } });
      mockTranscriptionsCreate.mockResolvedValue({
        task: 'transcribe',
        language: 'en',
        duration: 5.0,
        text: 'Hello world Another line',
        segments: MOCK_SEGMENTS,
      });
    });

    it('inserts caption track with trimmed segments on happy path', async () => {
      await processTranscribeJob(makeJob(), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      expect(insertCall).toBeDefined();
      const params = insertCall![1] as unknown[];
      const segmentsJson = JSON.parse(params[4] as string) as { start: number; end: number; text: string }[];
      expect(segmentsJson).toEqual([
        { start: 0.0, end: 2.5, text: 'Hello world' },
        { start: 2.5, end: 5.0, text: 'Another line' },
      ]);
    });

    it('passes language to Whisper when provided', async () => {
      await processTranscribeJob(makeJob({ language: 'fr' }), deps);

      expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' }),
      );
    });

    it('omits language param when not provided in payload', async () => {
      await processTranscribeJob(makeJob({ language: undefined }), deps);

      const callArg = mockTranscriptionsCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('language');
    });

    it('uses INSERT IGNORE so duplicate completions do not throw', async () => {
      await processTranscribeJob(makeJob(), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      expect(insertCall).toBeDefined();
    });

    it('stores "auto" as language when payload language is undefined', async () => {
      await processTranscribeJob(makeJob({ language: undefined }), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      const params = insertCall![1] as unknown[];
      expect(params[3]).toBe('auto'); // language column
    });

    it('throws and re-throws when asset is not found in DB', async () => {
      mockDbExecute.mockResolvedValueOnce([[]]); // empty result = asset not found

      await expect(processTranscribeJob(makeJob(), deps)).rejects.toThrow(
        'not found in database',
      );
    });

    it('re-throws when S3 download fails so BullMQ can retry', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('S3 network error'));

      await expect(processTranscribeJob(makeJob(), deps)).rejects.toThrow('S3 network error');
    });

    it('re-throws when Whisper API call fails so BullMQ can retry', async () => {
      mockTranscriptionsCreate.mockRejectedValueOnce(new Error('OpenAI quota exceeded'));

      await expect(processTranscribeJob(makeJob(), deps)).rejects.toThrow('OpenAI quota exceeded');
    });

    it('cleans up temp dir even when an error occurs', async () => {
      mockTranscriptionsCreate.mockRejectedValueOnce(new Error('API error'));

      const fsModule = await import('node:fs/promises');

      await expect(processTranscribeJob(makeJob(), deps)).rejects.toThrow();

      expect(fsModule.default.rm).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/'),
        { recursive: true, force: true },
      );
    });

    it('handles empty segments array from Whisper without throwing', async () => {
      mockTranscriptionsCreate.mockResolvedValueOnce({
        task: 'transcribe',
        language: 'en',
        duration: 0,
        text: '',
        segments: [],
      });

      await expect(processTranscribeJob(makeJob(), deps)).resolves.toBeUndefined();
    });
  });
});
