import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConflictError, NotFoundError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';

import { deleteAsset } from './asset.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  insertPendingAsset: vi.fn().mockResolvedValue(undefined),
  getAssetById: vi.fn(),
  getAssetsByProjectId: vi.fn(),
  isAssetReferencedByClip: vi.fn().mockResolvedValue(false),
  deleteAssetById: vi.fn().mockResolvedValue(undefined),
  updateAssetDisplayName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

// ── deleteAsset ──────────────────────────────────────────────────────────────

describe('asset.service', () => {
  describe('deleteAsset', () => {
    const mockAsset = {
      fileId: 'asset-del-001',
      projectId: 'proj-123',
      userId: 'user-456',
      filename: 'to-delete.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 1000,
      storageUri: 's3://bucket/to-delete.mp4',
      status: 'ready' as const,
      errorMessage: null,
      durationFrames: 90,
      width: 1920,
      height: 1080,
      fps: 30,
      thumbnailUri: null,
      waveformJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(assetRepository.getAssetById).mockResolvedValue(mockAsset);
      vi.mocked(assetRepository.isAssetReferencedByClip).mockResolvedValue(false);
      vi.mocked(assetRepository.deleteAssetById).mockResolvedValue(undefined);
    });

    it('calls deleteAssetById and resolves void on the happy path', async () => {
      await expect(deleteAsset('asset-del-001', 'user-456')).resolves.toBeUndefined();
      expect(assetRepository.deleteAssetById).toHaveBeenCalledWith('asset-del-001');
    });

    it('throws NotFoundError when getAssetById returns null', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);
      await expect(deleteAsset('nonexistent', 'user-456')).rejects.toBeInstanceOf(NotFoundError);
      expect(assetRepository.deleteAssetById).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the asset belongs to a different user', async () => {
      await expect(deleteAsset('asset-del-001', 'wrong-user-id')).rejects.toBeInstanceOf(NotFoundError);
      expect(assetRepository.deleteAssetById).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the asset is referenced by a clip', async () => {
      vi.mocked(assetRepository.isAssetReferencedByClip).mockResolvedValueOnce(true);
      await expect(deleteAsset('asset-del-001', 'user-456')).rejects.toBeInstanceOf(ConflictError);
      expect(assetRepository.deleteAssetById).not.toHaveBeenCalled();
    });

    it('does not call isAssetReferencedByClip when asset is not found', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);
      await expect(deleteAsset('nonexistent', 'user-456')).rejects.toBeInstanceOf(NotFoundError);
      expect(assetRepository.isAssetReferencedByClip).not.toHaveBeenCalled();
    });
  });
});
