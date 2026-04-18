/**
 * Unit tests for version.service — getLatestVersion
 *
 * Split from version.service.test.ts per §9.7 (300-line cap).
 * All repository calls are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NotFoundError } from '@/lib/errors.js';
import * as versionRepository from '@/repositories/version.repository.js';

import { getLatestVersion } from './version.service.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/version.repository.js', () => ({
  getLatestVersionId: vi.fn(),
  getConnection: vi.fn(),
  insertVersionTransaction: vi.fn(),
  getVersionById: vi.fn(),
  listVersions: vi.fn(),
  restoreVersionTransaction: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockVersion = {
  versionId: 42,
  projectId: 'proj-abc',
  docJson: { title: 'Latest Snapshot', durationFrames: 300 },
  docSchemaVersion: 1,
  createdByUserId: 'user-001',
  createdAt: new Date('2026-04-17T10:00:00.000Z'),
  parentVersionId: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('version.service', () => {
  describe('getLatestVersion', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns versionId, docJson, and createdAt when a latest version exists', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValueOnce(42);
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);

      const result = await getLatestVersion('proj-abc');

      expect(result.versionId).toBe(42);
      expect(result.docJson).toEqual({ title: 'Latest Snapshot', durationFrames: 300 });
      expect(result.createdAt).toEqual(new Date('2026-04-17T10:00:00.000Z'));
    });

    it('calls getVersionById with the ID returned by getLatestVersionId', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValueOnce(42);
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);

      await getLatestVersion('proj-abc');

      expect(versionRepository.getVersionById).toHaveBeenCalledWith('proj-abc', 42);
    });

    it('throws NotFoundError when getLatestVersionId returns null (no versions yet)', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValueOnce(null);

      await expect(getLatestVersion('proj-new')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError with statusCode 404 when project has no versions', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValueOnce(null);

      try {
        await getLatestVersion('proj-new');
      } catch (err) {
        expect((err as NotFoundError).statusCode).toBe(404);
      }
    });

    it('throws NotFoundError when getVersionById returns null (data inconsistency)', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValueOnce(99);
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(null);

      await expect(getLatestVersion('proj-abc')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('calls getLatestVersionId with the correct projectId', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValueOnce(null);

      await expect(getLatestVersion('proj-specific')).rejects.toBeInstanceOf(NotFoundError);

      expect(versionRepository.getLatestVersionId).toHaveBeenCalledWith('proj-specific');
    });
  });
});
