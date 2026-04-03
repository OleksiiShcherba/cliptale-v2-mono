import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConflictError, NotFoundError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';
import * as captionRepository from '@/repositories/caption.repository.js';
import type { Asset } from '@/repositories/asset.repository.js';
import type { CaptionTrack } from '@/repositories/caption.repository.js';

import { transcribeAsset, getCaptions } from './caption.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  getAssetById: vi.fn(),
}));

vi.mock('@/repositories/caption.repository.js', () => ({
  getCaptionTrackByAssetId: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-transcription.js', () => ({
  enqueueTranscriptionJob: vi.fn().mockResolvedValue('asset-001'),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockAsset: Asset = {
  assetId: 'asset-001',
  projectId: 'proj-001',
  userId: 'user-001',
  filename: 'video.mp4',
  contentType: 'video/mp4',
  fileSizeBytes: 1_000_000,
  storageUri: 's3://test-bucket/projects/proj-001/assets/asset-001/video.mp4',
  status: 'ready',
  errorMessage: null,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  fps: 30,
  thumbnailUri: null,
  waveformJson: null,
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

const mockCaptionTrack: CaptionTrack = {
  captionTrackId: 'track-001',
  assetId: 'asset-001',
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
    it('returns { jobId } on happy path when asset exists and no caption track yet', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);
      vi.mocked(captionRepository.getCaptionTrackByAssetId).mockResolvedValueOnce(null);

      const result = await transcribeAsset('asset-001');

      expect(result).toEqual({ jobId: 'asset-001' });
    });

    it('calls enqueueTranscriptionJob with correct payload derived from asset', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);
      vi.mocked(captionRepository.getCaptionTrackByAssetId).mockResolvedValueOnce(null);

      const { enqueueTranscriptionJob } = await import(
        '@/queues/jobs/enqueue-transcription.js'
      );

      await transcribeAsset('asset-001');

      expect(enqueueTranscriptionJob).toHaveBeenCalledWith({
        assetId: 'asset-001',
        storageUri: mockAsset.storageUri,
        contentType: 'video/mp4',
        language: 'en',
      });
    });

    it('throws NotFoundError when the asset does not exist', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

      await expect(transcribeAsset('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ConflictError when a caption track already exists for the asset', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);
      vi.mocked(captionRepository.getCaptionTrackByAssetId).mockResolvedValueOnce(
        mockCaptionTrack,
      );

      await expect(transcribeAsset('asset-001')).rejects.toBeInstanceOf(ConflictError);
    });

    it('propagates unexpected repository errors', async () => {
      vi.mocked(assetRepository.getAssetById).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(transcribeAsset('asset-001')).rejects.toThrow('DB connection lost');
    });
  });

  // ── getCaptions ─────────────────────────────────────────────────────────────

  describe('getCaptions', () => {
    it('returns { segments } when a caption track exists', async () => {
      vi.mocked(captionRepository.getCaptionTrackByAssetId).mockResolvedValueOnce(
        mockCaptionTrack,
      );

      const result = await getCaptions('asset-001');

      expect(result).toEqual({ segments: mockCaptionTrack.segments });
    });

    it('throws NotFoundError when no caption track exists for the asset', async () => {
      vi.mocked(captionRepository.getCaptionTrackByAssetId).mockResolvedValueOnce(null);

      await expect(getCaptions('asset-001')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('propagates unexpected repository errors', async () => {
      vi.mocked(captionRepository.getCaptionTrackByAssetId).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(getCaptions('asset-001')).rejects.toThrow('DB connection lost');
    });
  });
});
