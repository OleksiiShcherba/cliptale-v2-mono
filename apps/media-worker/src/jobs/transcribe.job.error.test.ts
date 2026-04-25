import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTranscribeJob } from './transcribe.job.js';
import {
  deps,
  makeJob,
  resetMocks,
  mockDbExecute,
  mockS3Send,
  mockTranscriptionsCreate,
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

// ── Error-handling and cleanup tests ─────────────────────────────────────────

describe('transcribe.job — error handling', () => {
  describe('processTranscribeJob', () => {
    beforeEach(() => {
      resetMocks();
    });

    it('throws and re-throws when file is not found in project_files', async () => {
      mockDbExecute.mockResolvedValueOnce([[]]); // empty result = file not in any project

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
