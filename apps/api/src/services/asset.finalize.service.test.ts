import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { ValidationError, NotFoundError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';
import * as enqueueIngest from '@/queues/jobs/enqueue-ingest.js';
import { finalizeAsset } from './asset.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  getAssetById: vi.fn(),
  updateAssetStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/queues/jobs/enqueue-ingest.js', () => ({
  enqueueIngestJob: vi.fn().mockResolvedValue(undefined),
}));

const mockS3Send = vi.fn();
const mockS3 = { send: mockS3Send } as unknown as S3Client;

const pendingAsset = {
  assetId: 'asset-fin-001',
  projectId: 'proj-123',
  userId: 'user-456',
  filename: 'clip.mp4',
  contentType: 'video/mp4',
  fileSizeBytes: 1_000_000,
  storageUri: 's3://test-bucket/projects/proj-123/assets/asset-fin-001/clip.mp4',
  status: 'pending' as const,
  errorMessage: null,
  durationFrames: null,
  width: null,
  height: null,
  fps: null,
  thumbnailUri: null,
  waveformJson: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── finalizeAsset ─────────────────────────────────────────────────────────────

describe('asset.service', () => {
  describe('finalizeAsset', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default: HEAD succeeds (object exists in storage).
      mockS3Send.mockResolvedValue({});
    });

    it('transitions status to processing and enqueues ingest job for a pending asset', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(pendingAsset);

      const result = await finalizeAsset(pendingAsset.assetId, mockS3);

      expect(result.status).toBe('processing');
      expect(assetRepository.updateAssetStatus).toHaveBeenCalledWith(
        pendingAsset.assetId,
        'processing',
      );
      expect(enqueueIngest.enqueueIngestJob).toHaveBeenCalledWith({
        assetId: pendingAsset.assetId,
        storageUri: pendingAsset.storageUri,
        contentType: pendingAsset.contentType,
      });
    });

    it('returns asset unchanged when status is already processing (idempotency)', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce({
        ...pendingAsset,
        status: 'processing',
      });

      const result = await finalizeAsset(pendingAsset.assetId, mockS3);

      expect(result.status).toBe('processing');
      expect(assetRepository.updateAssetStatus).not.toHaveBeenCalled();
      expect(enqueueIngest.enqueueIngestJob).not.toHaveBeenCalled();
    });

    it('returns asset unchanged when status is already ready (idempotency)', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce({
        ...pendingAsset,
        status: 'ready',
      });

      const result = await finalizeAsset(pendingAsset.assetId, mockS3);

      expect(result.status).toBe('ready');
      expect(assetRepository.updateAssetStatus).not.toHaveBeenCalled();
      expect(enqueueIngest.enqueueIngestJob).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the asset row does not exist', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

      await expect(finalizeAsset('missing-id', mockS3)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError when the object is not yet in storage (S3 NotFound)', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(pendingAsset);
      const notFoundErr = Object.assign(new Error('Not Found'), { name: 'NotFound' });
      mockS3Send.mockRejectedValueOnce(notFoundErr);

      await expect(finalizeAsset(pendingAsset.assetId, mockS3)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(assetRepository.updateAssetStatus).not.toHaveBeenCalled();
    });

    it('re-throws unexpected S3 errors without wrapping', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(pendingAsset);
      const networkErr = new Error('ECONNREFUSED');
      mockS3Send.mockRejectedValueOnce(networkErr);

      await expect(finalizeAsset(pendingAsset.assetId, mockS3)).rejects.toBe(networkErr);
    });

    it('re-finalizes an asset that previously errored (error status is not guarded)', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce({
        ...pendingAsset,
        status: 'error',
        errorMessage: 'ffprobe failed',
      });

      const result = await finalizeAsset(pendingAsset.assetId, mockS3);

      expect(result.status).toBe('processing');
      expect(assetRepository.updateAssetStatus).toHaveBeenCalledWith(
        pendingAsset.assetId,
        'processing',
      );
    });
  });
});
