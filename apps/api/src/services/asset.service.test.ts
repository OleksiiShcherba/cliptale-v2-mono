import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';

import { createUploadUrl, deleteAsset, getAsset, getProjectAssets } from './asset.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  insertPendingAsset: vi.fn().mockResolvedValue(undefined),
  getAssetById: vi.fn(),
  getAssetsByProjectId: vi.fn(),
  isAssetReferencedByClip: vi.fn().mockResolvedValue(false),
  deleteAssetById: vi.fn().mockResolvedValue(undefined),
}));

// Mock presigned URL generation — avoids real AWS credentials in unit tests.
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

const mockS3 = {} as S3Client;
const TEST_BUCKET = 'test-bucket';

const baseParams = {
  projectId: 'proj-123',
  userId: 'user-456',
  filename: 'my-video.mp4',
  contentType: 'video/mp4',
  fileSizeBytes: 1_000_000,
};

// ── createUploadUrl ──────────────────────────────────────────────────────────

describe('asset.service', () => {
  describe('createUploadUrl', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns uploadUrl, assetId, storageUri, and expiresAt for a valid request', async () => {
      const result = await createUploadUrl(baseParams, mockS3, TEST_BUCKET);

      expect(result.uploadUrl).toBe('https://s3.example.com/presigned-url');
      expect(result.assetId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.storageUri).toContain(`s3://${TEST_BUCKET}/projects/${baseParams.projectId}`);
      expect(result.expiresAt).toBeTruthy();
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('inserts a pending asset row with the correct params', async () => {
      await createUploadUrl(baseParams, mockS3, TEST_BUCKET);

      expect(assetRepository.insertPendingAsset).toHaveBeenCalledOnce();
      const insertCall = vi.mocked(assetRepository.insertPendingAsset).mock.calls[0]![0];
      expect(insertCall.projectId).toBe(baseParams.projectId);
      expect(insertCall.userId).toBe(baseParams.userId);
      expect(insertCall.filename).toBe('my-video.mp4');
      expect(insertCall.contentType).toBe('video/mp4');
      expect(insertCall.fileSizeBytes).toBe(baseParams.fileSizeBytes);
      expect(insertCall.storageUri).toContain(insertCall.assetId);
    });

    it('throws ValidationError for a disallowed content type', async () => {
      await expect(
        createUploadUrl({ ...baseParams, contentType: 'application/exe' }, mockS3, TEST_BUCKET),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for fileSizeBytes of zero', async () => {
      await expect(
        createUploadUrl({ ...baseParams, fileSizeBytes: 0 }, mockS3, TEST_BUCKET),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when fileSizeBytes exceeds 2 GiB', async () => {
      const tooBig = 2 * 1024 * 1024 * 1024 + 1;
      await expect(
        createUploadUrl({ ...baseParams, fileSizeBytes: tooBig }, mockS3, TEST_BUCKET),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('sanitizes path traversal sequences and path separators in the filename', async () => {
      await createUploadUrl(
        { ...baseParams, filename: '../../../etc/passwd' },
        mockS3,
        TEST_BUCKET,
      );

      const insertCall = vi.mocked(assetRepository.insertPendingAsset).mock.calls[0]![0];
      expect(insertCall.filename).not.toContain('/');
      expect(insertCall.filename).not.toContain('..');
    });

    it('throws ValidationError when filename is empty after sanitization', async () => {
      await expect(
        createUploadUrl({ ...baseParams, filename: '!!!' }, mockS3, TEST_BUCKET),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('includes expiresAt roughly 15 minutes in the future', async () => {
      const before = Date.now();
      const result = await createUploadUrl(baseParams, mockS3, TEST_BUCKET);
      const after = Date.now();

      const expiresMs = new Date(result.expiresAt).getTime();
      const expectedMin = before + 14 * 60 * 1000;
      const expectedMax = after + 16 * 60 * 1000;

      expect(expiresMs).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresMs).toBeLessThanOrEqual(expectedMax);
    });

    it('propagates errors from the repository', async () => {
      vi.mocked(assetRepository.insertPendingAsset).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(createUploadUrl(baseParams, mockS3, TEST_BUCKET)).rejects.toThrow(
        'DB connection lost',
      );
    });

    it('accepts all supported audio content types', async () => {
      const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg', 'audio/flac'];
      for (const contentType of audioTypes) {
        vi.clearAllMocks();
        await expect(
          createUploadUrl({ ...baseParams, contentType }, mockS3, TEST_BUCKET),
        ).resolves.toBeDefined();
      }
    });

    it('accepts all supported image content types', async () => {
      const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      for (const contentType of imageTypes) {
        vi.clearAllMocks();
        await expect(
          createUploadUrl({ ...baseParams, contentType }, mockS3, TEST_BUCKET),
        ).resolves.toBeDefined();
      }
    });
  });

  // ── getAsset ────────────────────────────────────────────────────────────────

  describe('getAsset', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns the asset when it exists', async () => {
      const mockAsset = {
        assetId: 'asset-abc',
        projectId: 'proj-123',
        userId: 'user-456',
        filename: 'video.mp4',
        contentType: 'video/mp4',
        fileSizeBytes: 500_000,
        storageUri: 's3://bucket/key',
        status: 'ready' as const,
        errorMessage: null,
        durationFrames: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        thumbnailUri: 's3://bucket/thumb.jpg',
        waveformJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(mockAsset);

      const result = await getAsset('asset-abc');

      expect(result).toEqual(mockAsset);
      expect(assetRepository.getAssetById).toHaveBeenCalledWith('asset-abc');
    });

    it('throws NotFoundError when asset does not exist', async () => {
      vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

      await expect(getAsset('nonexistent-id')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ── getProjectAssets ─────────────────────────────────────────────────────────

  describe('getProjectAssets', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns an array of assets when assets exist for the project', async () => {
      const mockAssets = [
        {
          assetId: 'asset-001',
          projectId: 'proj-abc',
          userId: 'user-1',
          filename: 'a.mp4',
          contentType: 'video/mp4',
          fileSizeBytes: 1000,
          storageUri: 's3://bucket/a.mp4',
          status: 'ready' as const,
          errorMessage: null,
          durationFrames: 120,
          width: 1920,
          height: 1080,
          fps: 30,
          thumbnailUri: null,
          waveformJson: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(assetRepository.getAssetsByProjectId).mockResolvedValueOnce(mockAssets);

      const result = await getProjectAssets('proj-abc');

      expect(result).toEqual(mockAssets);
      expect(assetRepository.getAssetsByProjectId).toHaveBeenCalledWith('proj-abc');
    });

    it('returns an empty array when the project has no assets', async () => {
      vi.mocked(assetRepository.getAssetsByProjectId).mockResolvedValueOnce([]);

      const result = await getProjectAssets('proj-empty');

      expect(result).toEqual([]);
    });

    it('propagates errors from the repository', async () => {
      vi.mocked(assetRepository.getAssetsByProjectId).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(getProjectAssets('proj-abc')).rejects.toThrow('DB connection lost');
    });
  });

  // ── deleteAsset ─────────────────────────────────────────────────────────────

  describe('deleteAsset', () => {
    const mockAsset = {
      assetId: 'asset-del-001',
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
      // Default: asset exists, belongs to the caller, and is not referenced by any clip.
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
