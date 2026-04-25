/**
 * Unit tests for deleteAsset and restoreAsset in asset.service.ts.
 *
 * EPIC B: deleteAsset now calls fileRepository.softDelete instead of hard-delete.
 * Clips referencing a soft-deleted file are NOT blocked (removed ConflictError path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GoneError, NotFoundError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';
import * as fileRepository from '@/repositories/file.repository.js';

import { deleteAsset, restoreAsset } from './asset.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  insertPendingAsset: vi.fn().mockResolvedValue(undefined),
  getAssetById: vi.fn(),
  getAssetsByProjectId: vi.fn(),
  isAssetReferencedByClip: vi.fn().mockResolvedValue(false),
  deleteAssetById: vi.fn().mockResolvedValue(undefined),
  updateAssetDisplayName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/repositories/file.repository.js', () => ({
  softDelete: vi.fn().mockResolvedValue(true),
  restore: vi.fn().mockResolvedValue(true),
  findByIdIncludingDeleted: vi.fn(),
  findByIdForUser: vi.fn(),
  findById: vi.fn(),
  createPending: vi.fn(),
  finalize: vi.fn(),
  updateProbeMetadata: vi.fn(),
  setFileError: vi.fn(),
  findReadyForUser: vi.fn(),
  getReadyTotalsForUser: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

vi.mock('@/queues/jobs/enqueue-ingest.js', () => ({
  enqueueIngestJob: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockAsset = {
  fileId: 'asset-del-001',
  projectId: 'proj-123',
  userId: 'user-456',
  filename: 'to-delete.mp4',
  displayName: 'to-delete.mp4',
  contentType: 'video/mp4',
  fileSizeBytes: 1000,
  storageUri: 's3://bucket/to-delete.mp4',
  status: 'ready' as const,
  errorMessage: null,
  durationFrames: 90,
  width: 1920,
  height: 1080,
  fps: null,
  thumbnailUri: null,
  waveformJson: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockFileRow = {
  fileId: 'asset-del-001',
  userId: 'user-456',
  kind: 'video' as const,
  storageUri: 's3://bucket/to-delete.mp4',
  mimeType: 'video/mp4',
  bytes: 1000,
  width: 1920,
  height: 1080,
  durationMs: null,
  displayName: 'to-delete.mp4',
  status: 'ready' as const,
  errorMessage: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

// ── deleteAsset ───────────────────────────────────────────────────────────────

describe('asset.service', () => {
  describe('deleteAsset', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(assetRepository.getAssetById).mockResolvedValue(mockAsset);
      vi.mocked(fileRepository.softDelete).mockResolvedValue(true);
    });

    it('calls fileRepository.softDelete on the happy path', async () => {
      await expect(deleteAsset('asset-del-001', 'user-456')).resolves.toBeUndefined();
      expect(fileRepository.softDelete).toHaveBeenCalledWith('asset-del-001');
    });

    it('does NOT call hard-delete (deleteAssetById) — soft-delete only', async () => {
      await deleteAsset('asset-del-001', 'user-456');
      expect(assetRepository.deleteAssetById).not.toHaveBeenCalled();
    });

    it('succeeds even when the asset is referenced by a clip (no ConflictError)', async () => {
      vi.mocked(assetRepository.isAssetReferencedByClip).mockResolvedValue(true);
      await expect(deleteAsset('asset-del-001', 'user-456')).resolves.toBeUndefined();
    });

    it('throws NotFoundError when getAssetById returns null', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);
      await expect(deleteAsset('nonexistent', 'user-456')).rejects.toBeInstanceOf(NotFoundError);
      expect(fileRepository.softDelete).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the asset belongs to a different user', async () => {
      await expect(deleteAsset('asset-del-001', 'wrong-user')).rejects.toBeInstanceOf(NotFoundError);
      expect(fileRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  // ── restoreAsset ────────────────────────────────────────────────────────────

  describe('restoreAsset', () => {
    const softDeletedFileRow = {
      ...mockFileRow,
      deletedAt: new Date('2026-04-15T00:00:00.000Z'), // recent — within TTL
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValue(softDeletedFileRow);
      vi.mocked(fileRepository.restore).mockResolvedValue(true);
      vi.mocked(assetRepository.getAssetById).mockResolvedValue(mockAsset);
    });

    it('restores the file and returns the Asset on the happy path', async () => {
      const result = await restoreAsset('asset-del-001', 'user-456');
      expect(fileRepository.restore).toHaveBeenCalledWith('asset-del-001');
      expect(result).toMatchObject({ fileId: 'asset-del-001' });
    });

    it('throws GoneError when the row does not exist (hard-purged)', async () => {
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce(null);
      await expect(restoreAsset('asset-del-001', 'user-456')).rejects.toBeInstanceOf(GoneError);
      expect(fileRepository.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the file belongs to another user', async () => {
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce({
        ...softDeletedFileRow,
        userId: 'other-user',
      });
      await expect(restoreAsset('asset-del-001', 'user-456')).rejects.toBeInstanceOf(NotFoundError);
      expect(fileRepository.restore).not.toHaveBeenCalled();
    });

    it('throws GoneError when deleted_at is older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce({
        ...softDeletedFileRow,
        deletedAt: oldDate,
      });
      await expect(restoreAsset('asset-del-001', 'user-456')).rejects.toBeInstanceOf(GoneError);
      expect(fileRepository.restore).not.toHaveBeenCalled();
    });

    it('returns the asset without calling restore when already active (idempotent)', async () => {
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce({
        ...mockFileRow,
        deletedAt: null,
      });
      const result = await restoreAsset('asset-del-001', 'user-456');
      expect(fileRepository.restore).not.toHaveBeenCalled();
      expect(result).toMatchObject({ fileId: 'asset-del-001' });
    });
  });
});
