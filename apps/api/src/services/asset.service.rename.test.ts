import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NotFoundError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';

import { renameAsset } from './asset.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  insertPendingAsset: vi.fn().mockResolvedValue(undefined),
  getAssetById: vi.fn(),
  getAssetsByProjectId: vi.fn(),
  isAssetReferencedByClip: vi.fn().mockResolvedValue(false),
  deleteAssetById: vi.fn().mockResolvedValue(undefined),
  updateAssetDisplayName: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_USER_ID = 'user-456';
const OTHER_USER_ID = 'user-789';
const ASSET_ID = 'asset-rename-001';

const mockAsset = {
  assetId: ASSET_ID,
  projectId: 'proj-123',
  userId: OWNER_USER_ID,
  filename: 'original.mp4',
  displayName: null as string | null,
  contentType: 'video/mp4',
  fileSizeBytes: 1_000_000,
  storageUri: 's3://bucket/original.mp4',
  status: 'ready' as const,
  errorMessage: null,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  fps: 30,
  thumbnailUri: null,
  waveformJson: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── renameAsset ───────────────────────────────────────────────────────────────

describe('asset.service', () => {
  describe('renameAsset', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('calls updateAssetDisplayName with the trimmed name and returns the updated asset', async () => {
      const updatedAsset = { ...mockAsset, displayName: 'My Video' };
      vi.mocked(assetRepository.getAssetById)
        .mockResolvedValueOnce(mockAsset)
        .mockResolvedValueOnce(updatedAsset);

      const result = await renameAsset(ASSET_ID, OWNER_USER_ID, '  My Video  ');

      expect(assetRepository.updateAssetDisplayName).toHaveBeenCalledOnce();
      expect(assetRepository.updateAssetDisplayName).toHaveBeenCalledWith(ASSET_ID, 'My Video');
      expect(result.displayName).toBe('My Video');
    });

    it('stores null when displayName trims to an empty string', async () => {
      const clearedAsset = { ...mockAsset, displayName: null };
      vi.mocked(assetRepository.getAssetById)
        .mockResolvedValueOnce(mockAsset)
        .mockResolvedValueOnce(clearedAsset);

      const result = await renameAsset(ASSET_ID, OWNER_USER_ID, '   ');

      expect(assetRepository.updateAssetDisplayName).toHaveBeenCalledWith(ASSET_ID, null);
      expect(result.displayName).toBeNull();
    });

    it('fetches the asset fresh after update and returns the new state', async () => {
      const updatedAsset = { ...mockAsset, displayName: 'New Name' };
      vi.mocked(assetRepository.getAssetById)
        .mockResolvedValueOnce(mockAsset)
        .mockResolvedValueOnce(updatedAsset);

      await renameAsset(ASSET_ID, OWNER_USER_ID, 'New Name');

      // getAssetById is called twice: once for ownership, once for post-update fetch
      expect(assetRepository.getAssetById).toHaveBeenCalledTimes(2);
      expect(assetRepository.getAssetById).toHaveBeenNthCalledWith(1, ASSET_ID);
      expect(assetRepository.getAssetById).toHaveBeenNthCalledWith(2, ASSET_ID);
    });

    it('throws NotFoundError when the asset does not exist', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

      await expect(renameAsset('nonexistent', OWNER_USER_ID, 'Name')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(assetRepository.updateAssetDisplayName).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the asset belongs to a different user', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);

      await expect(renameAsset(ASSET_ID, OTHER_USER_ID, 'Name')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(assetRepository.updateAssetDisplayName).not.toHaveBeenCalled();
    });

    it('uses the same error message for missing and wrong-owner assets to avoid information leakage', async () => {
      // Asset does not exist at all
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);
      await expect(renameAsset(ASSET_ID, OWNER_USER_ID, 'Name')).rejects.toThrow(
        `Asset "${ASSET_ID}" not found`,
      );
    });

    it('uses the same error message when caller is not the owner', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);
      await expect(renameAsset(ASSET_ID, OTHER_USER_ID, 'Name')).rejects.toThrow(
        `Asset "${ASSET_ID}" not found`,
      );
    });

    it('propagates errors from updateAssetDisplayName', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);
      vi.mocked(assetRepository.updateAssetDisplayName).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(renameAsset(ASSET_ID, OWNER_USER_ID, 'Name')).rejects.toThrow(
        'DB connection lost',
      );
    });

    it('propagates errors from the post-update getAssetById call', async () => {
      vi.mocked(assetRepository.getAssetById)
        .mockResolvedValueOnce(mockAsset)
        .mockRejectedValueOnce(new Error('DB timeout'));

      await expect(renameAsset(ASSET_ID, OWNER_USER_ID, 'Name')).rejects.toThrow('DB timeout');
    });
  });
});
