import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConflictError, NotFoundError } from '@/lib/errors.js';
import * as fileRepository from '@/repositories/file.repository.js';
import * as captionRepository from '@/repositories/caption.repository.js';
import type { FileRow } from '@/repositories/file.repository.js';
import type { CaptionTrack } from '@/repositories/caption.repository.js';

import { transcribeAsset, getCaptions } from './caption.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/file.repository.js', () => ({
  findById: vi.fn(),
}));

vi.mock('@/repositories/caption.repository.js', () => ({
  getCaptionTrackByFileId: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-transcription.js', () => ({
  enqueueTranscriptionJob: vi.fn().mockResolvedValue('file-001'),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockFile: FileRow = {
  fileId: 'file-001',
  userId: 'user-001',
  kind: 'video',
  storageUri: 's3://test-bucket/files/file-001/video.mp4',
  mimeType: 'video/mp4',
  bytes: 1_000_000,
  width: 1920,
  height: 1080,
  durationMs: 10_000,
  displayName: 'video.mp4',
  status: 'ready',
  errorMessage: null,
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

const mockCaptionTrack: CaptionTrack = {
  captionTrackId: 'track-001',
  fileId: 'file-001',
  projectId: 'proj-001',
  language: 'en',
  segments: [
    { start: 0.0, end: 2.5, text: 'Hello world' },
    { start: 2.5, end: 5.0, text: 'This is a caption' },
  ],
  createdAt: new Date('2026-04-01T00:00:00Z'),
};

// ── transcribeAsset ───────────────────────────────────────────────────────────

describe('caption.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transcribeAsset', () => {
    it('returns { jobId } on happy path when file exists and no caption track yet', async () => {
      vi.mocked(fileRepository.findById).mockResolvedValueOnce(mockFile);
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockResolvedValueOnce(null);

      const result = await transcribeAsset('file-001');

      expect(result).toEqual({ jobId: 'file-001' });
    });

    it('calls enqueueTranscriptionJob with correct payload derived from file', async () => {
      vi.mocked(fileRepository.findById).mockResolvedValueOnce(mockFile);
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockResolvedValueOnce(null);

      const { enqueueTranscriptionJob } = await import(
        '@/queues/jobs/enqueue-transcription.js'
      );

      await transcribeAsset('file-001');

      expect(enqueueTranscriptionJob).toHaveBeenCalledWith({
        assetId: 'file-001',
        storageUri: mockFile.storageUri,
        contentType: 'video/mp4',
        language: 'en',
      });
    });

    it('throws NotFoundError when the file does not exist', async () => {
      vi.mocked(fileRepository.findById).mockResolvedValueOnce(null);

      await expect(transcribeAsset('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ConflictError when a caption track already exists for the file', async () => {
      vi.mocked(fileRepository.findById).mockResolvedValueOnce(mockFile);
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockResolvedValueOnce(
        mockCaptionTrack,
      );

      await expect(transcribeAsset('file-001')).rejects.toBeInstanceOf(ConflictError);
    });

    it('propagates unexpected repository errors', async () => {
      vi.mocked(fileRepository.findById).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(transcribeAsset('file-001')).rejects.toThrow('DB connection lost');
    });

    it('falls back to application/octet-stream when file mimeType is null', async () => {
      const fileWithNullMime: FileRow = { ...mockFile, mimeType: null };
      vi.mocked(fileRepository.findById).mockResolvedValueOnce(fileWithNullMime);
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockResolvedValueOnce(null);

      const { enqueueTranscriptionJob } = await import(
        '@/queues/jobs/enqueue-transcription.js'
      );

      await transcribeAsset('file-001');

      expect(enqueueTranscriptionJob).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'application/octet-stream' }),
      );
    });
  });

  // ── getCaptions ─────────────────────────────────────────────────────────────

  describe('getCaptions', () => {
    it('returns { segments } when a caption track exists', async () => {
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockResolvedValueOnce(
        mockCaptionTrack,
      );

      const result = await getCaptions('file-001');

      expect(result).toEqual({ segments: mockCaptionTrack.segments });
    });

    it('throws NotFoundError when no caption track exists for the file', async () => {
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockResolvedValueOnce(null);

      await expect(getCaptions('file-001')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('propagates unexpected repository errors', async () => {
      vi.mocked(captionRepository.getCaptionTrackByFileId).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(getCaptions('file-001')).rejects.toThrow('DB connection lost');
    });
  });
});
