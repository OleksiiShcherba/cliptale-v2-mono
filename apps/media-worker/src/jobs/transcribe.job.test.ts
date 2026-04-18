import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseStorageUri, processTranscribeJob } from './transcribe.job.js';
import {
  deps,
  makeJob,
  resetMocks,
  mockDbExecute,
  mockTranscriptionsCreate,
  MOCK_WORDS_SEG0,
  MOCK_WORDS_SEG1,
  MOCK_SEGMENTS,
  MOCK_TOP_LEVEL_WORDS,
} from './transcribe.job.fixtures.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

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

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('transcribe.job', () => {
  describe('parseStorageUri', () => {
    it('extracts bucket and key from a valid s3:// URI', () => {
      const result = parseStorageUri('s3://my-bucket/files/file-1/file.mp4');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'files/file-1/file.mp4' });
    });

    it('handles a key with no subdirectories', () => {
      const result = parseStorageUri('s3://bucket/file.mp4');
      expect(result).toEqual({ bucket: 'bucket', key: 'file.mp4' });
    });
  });

  // ── processTranscribeJob — happy path ─────────────────────────────────────

  describe('processTranscribeJob', () => {
    beforeEach(() => {
      resetMocks();
    });

    it('inserts caption track with trimmed segments on happy path', async () => {
      await processTranscribeJob(makeJob(), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      expect(insertCall).toBeDefined();
      const params = insertCall![1] as unknown[];
      const segmentsJson = JSON.parse(params[4] as string) as {
        start: number;
        end: number;
        text: string;
        words: { word: string; start: number; end: number }[];
      }[];
      expect(segmentsJson).toEqual([
        { start: 0.0, end: 2.5, text: 'Hello world', words: MOCK_WORDS_SEG0 },
        { start: 2.5, end: 5.0, text: 'Another line', words: MOCK_WORDS_SEG1 },
      ]);
    });

    it('queries project_files using file_id (from assetId payload field)', async () => {
      await processTranscribeJob(makeJob(), deps);

      const selectCall = mockDbExecute.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('project_files'),
      );
      expect(selectCall).toBeDefined();
      expect(selectCall![1]).toEqual(['file-123']);
    });

    it('inserts using file_id column (not asset_id)', async () => {
      await processTranscribeJob(makeJob(), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      expect(insertCall).toBeDefined();
      // INSERT IGNORE INTO caption_tracks (caption_track_id, file_id, project_id, language, segments_json)
      expect((insertCall![0] as string)).toContain('file_id');
      expect((insertCall![0] as string)).not.toContain('asset_id');
    });

    it('extracts words[] from Whisper response when present', async () => {
      await processTranscribeJob(makeJob(), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      const params = insertCall![1] as unknown[];
      const segmentsJson = JSON.parse(params[4] as string) as {
        words: { word: string; start: number; end: number }[];
      }[];

      expect(segmentsJson[0]!.words).toEqual([
        { word: 'Hello', start: 0.0, end: 0.8 },
        { word: 'world', start: 0.9, end: 1.4 },
      ]);
      expect(segmentsJson[1]!.words).toEqual([
        { word: 'Another', start: 2.5, end: 3.0 },
        { word: 'line', start: 3.1, end: 3.5 },
      ]);
    });

    it('stores an empty words[] when transcription.words is undefined (graceful fallback)', async () => {
      mockTranscriptionsCreate.mockResolvedValueOnce({
        task: 'transcribe',
        language: 'en',
        duration: 5.0,
        text: 'Hello world Another line',
        segments: MOCK_SEGMENTS,
      });

      await processTranscribeJob(makeJob(), deps);

      const insertCall = mockDbExecute.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT IGNORE'),
      );
      const params = insertCall![1] as unknown[];
      const segmentsJson = JSON.parse(params[4] as string) as {
        words: { word: string; start: number; end: number }[];
      }[];

      expect(segmentsJson[0]!.words).toEqual([]);
      expect(segmentsJson[1]!.words).toEqual([]);
    });

    it('requests word-level timestamps from Whisper', async () => {
      await processTranscribeJob(makeJob(), deps);

      expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: 'verbose_json',
          timestamp_granularities: ['word', 'segment'],
        }),
      );
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
  });
});
