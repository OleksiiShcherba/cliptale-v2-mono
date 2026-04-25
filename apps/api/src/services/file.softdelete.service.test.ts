/**
 * Unit tests for softDeleteFile and restoreFile in file.service.ts.
 *
 * These test the new EPIC B soft-delete/restore surface with in-memory repo mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GoneError, NotFoundError } from '@/lib/errors.js';
import * as fileRepository from '@/repositories/file.repository.js';

import { softDeleteFile, restoreFile } from './file.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

const baseFileRow = {
  fileId: 'file-sd-001',
  userId: 'user-sd-001',
  kind: 'video' as const,
  storageUri: 's3://bucket/file.mp4',
  mimeType: 'video/mp4',
  bytes: 5000,
  width: 1920,
  height: 1080,
  durationMs: 3000,
  displayName: 'file.mp4',
  status: 'ready' as const,
  errorMessage: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
  deletedAt: null,
};

// ── softDeleteFile ────────────────────────────────────────────────────────────

describe('file.service', () => {
  describe('softDeleteFile', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(fileRepository.findByIdForUser).mockResolvedValue(baseFileRow);
      vi.mocked(fileRepository.softDelete).mockResolvedValue(true);
    });

    it('calls fileRepository.softDelete on the happy path', async () => {
      await expect(softDeleteFile('file-sd-001', 'user-sd-001')).resolves.toBeUndefined();
      expect(fileRepository.softDelete).toHaveBeenCalledWith('file-sd-001');
    });

    it('throws NotFoundError when the file does not exist or belongs to another user', async () => {
      vi.mocked(fileRepository.findByIdForUser).mockResolvedValueOnce(null);
      await expect(softDeleteFile('file-sd-001', 'user-sd-001')).rejects.toBeInstanceOf(NotFoundError);
      expect(fileRepository.softDelete).not.toHaveBeenCalled();
    });

    it('accepts files referenced by clips without error (EPIC B acceptance criteria)', async () => {
      // softDeleteFile has no clip reference check — just confirm it resolves.
      await expect(softDeleteFile('file-sd-001', 'user-sd-001')).resolves.toBeUndefined();
    });
  });

  // ── restoreFile ─────────────────────────────────────────────────────────────

  describe('restoreFile', () => {
    const softDeletedRow = {
      ...baseFileRow,
      deletedAt: new Date('2026-04-10T00:00:00.000Z'), // recent — within TTL
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValue(softDeletedRow);
      vi.mocked(fileRepository.restore).mockResolvedValue(true);
    });

    it('restores the file and returns the FileRow with deletedAt null on happy path', async () => {
      const result = await restoreFile('file-sd-001', 'user-sd-001');
      expect(fileRepository.restore).toHaveBeenCalledWith('file-sd-001');
      expect(result.deletedAt).toBeNull();
      expect(result.fileId).toBe('file-sd-001');
    });

    it('throws GoneError when the row does not exist (hard-purged)', async () => {
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce(null);
      await expect(restoreFile('file-sd-001', 'user-sd-001')).rejects.toBeInstanceOf(GoneError);
      expect(fileRepository.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the file belongs to another user', async () => {
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce({
        ...softDeletedRow,
        userId: 'other-user',
      });
      await expect(restoreFile('file-sd-001', 'user-sd-001')).rejects.toBeInstanceOf(NotFoundError);
      expect(fileRepository.restore).not.toHaveBeenCalled();
    });

    it('throws GoneError when deleted_at is older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce({
        ...softDeletedRow,
        deletedAt: oldDate,
      });
      await expect(restoreFile('file-sd-001', 'user-sd-001')).rejects.toBeInstanceOf(GoneError);
      expect(fileRepository.restore).not.toHaveBeenCalled();
    });

    it('returns the file without calling restore when already active (idempotent)', async () => {
      vi.mocked(fileRepository.findByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseFileRow,
        deletedAt: null,
      });
      const result = await restoreFile('file-sd-001', 'user-sd-001');
      expect(fileRepository.restore).not.toHaveBeenCalled();
      expect(result.deletedAt).toBeNull();
    });

    it('returns a FileRow with all expected fields', async () => {
      const result = await restoreFile('file-sd-001', 'user-sd-001');
      expect(result).toMatchObject({
        fileId: 'file-sd-001',
        userId: 'user-sd-001',
        kind: 'video',
        status: 'ready',
      });
    });
  });
});
