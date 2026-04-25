/**
 * Unit tests for version.service.ts
 *
 * All repository calls are mocked. These tests validate the business logic:
 * schema version enforcement, optimistic lock behaviour, and transaction handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OptimisticLockError, UnprocessableEntityError, NotFoundError } from '@/lib/errors.js';
import * as versionRepository from '@/repositories/version.repository.js';
import type { PoolConnection } from 'mysql2/promise';

import { saveVersion, getVersionDoc, listVersions, restoreVersion } from './version.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockConn = {
  beginTransaction: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue(undefined),
  rollback: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
} as unknown as PoolConnection;

vi.mock('@/repositories/version.repository.js', () => ({
  getLatestVersionId: vi.fn(),
  getConnection: vi.fn(),
  insertVersionTransaction: vi.fn(),
  getVersionById: vi.fn(),
  listVersions: vi.fn(),
  restoreVersionTransaction: vi.fn(),
}));

const baseParams = {
  projectId: 'proj-abc',
  docJson: { title: 'My Project' },
  docSchemaVersion: 1,
  parentVersionId: null,
  patches: [],
  inversePatches: [],
  createdByUserId: 'user-001',
};

const insertResult = { versionId: 42, createdAt: new Date('2026-04-03T10:00:00.000Z') };

// ── saveVersion ───────────────────────────────────────────────────────────────

describe('version.service', () => {
  describe('saveVersion', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(versionRepository.getConnection).mockResolvedValue(mockConn);
      vi.mocked(versionRepository.insertVersionTransaction).mockResolvedValue(insertResult);
    });

    it('inserts a version and returns versionId + createdAt on happy path (first save)', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(null);

      const result = await saveVersion(baseParams);

      expect(result.versionId).toBe(42);
      expect(result.createdAt).toEqual(new Date('2026-04-03T10:00:00.000Z'));
      expect(mockConn.beginTransaction).toHaveBeenCalledOnce();
      expect(mockConn.commit).toHaveBeenCalledOnce();
      expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('inserts a version when parentVersionId matches latest_version_id', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(10);

      const result = await saveVersion({ ...baseParams, parentVersionId: 10 });

      expect(result.versionId).toBe(42);
      expect(mockConn.commit).toHaveBeenCalledOnce();
    });

    it('throws UnprocessableEntityError (422) when doc_schema_version is unsupported', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(null);

      await expect(
        saveVersion({ ...baseParams, docSchemaVersion: 99 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it('throws OptimisticLockError when parentVersionId does not match latest_version_id', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(5);

      await expect(
        saveVersion({ ...baseParams, parentVersionId: 3 }),
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('throws OptimisticLockError (409) with correct statusCode', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(5);

      try {
        await saveVersion({ ...baseParams, parentVersionId: 3 });
      } catch (err) {
        expect((err as OptimisticLockError).statusCode).toBe(409);
      }
    });

    it('throws OptimisticLockError when parentVersionId is null but project already has a version', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(1);

      await expect(
        saveVersion({ ...baseParams, parentVersionId: null }),
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('rolls back the transaction and re-throws when insertVersionTransaction throws', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(null);
      vi.mocked(versionRepository.insertVersionTransaction).mockRejectedValueOnce(
        new Error('DB write failed'),
      );

      await expect(saveVersion(baseParams)).rejects.toThrow('DB write failed');
      expect(mockConn.rollback).toHaveBeenCalledOnce();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });

    it('always releases the connection even when an error is thrown', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(null);
      vi.mocked(versionRepository.insertVersionTransaction).mockRejectedValueOnce(
        new Error('unexpected'),
      );

      await expect(saveVersion(baseParams)).rejects.toThrow();
      expect(mockConn.release).toHaveBeenCalledOnce();
    });

    it('passes all params to insertVersionTransaction', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(null);

      await saveVersion({
        ...baseParams,
        patches: [{ op: 'add', path: '/title', value: 'New' }],
        inversePatches: [{ op: 'replace', path: '/title', value: 'My Project' }],
      });

      expect(versionRepository.insertVersionTransaction).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({
          projectId: 'proj-abc',
          docSchemaVersion: 1,
          createdByUserId: 'user-001',
          patches: [{ op: 'add', path: '/title', value: 'New' }],
          inversePatches: [{ op: 'replace', path: '/title', value: 'My Project' }],
        }),
      );
    });

    it('accepts null createdByUserId (anonymous save)', async () => {
      vi.mocked(versionRepository.getLatestVersionId).mockResolvedValue(null);

      const result = await saveVersion({ ...baseParams, createdByUserId: null });

      expect(result.versionId).toBe(42);
    });
  });

  // ── getVersionDoc ─────────────────────────────────────────────────────────

  describe('getVersionDoc', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns the docJson when the version exists', async () => {
      const mockVersion = {
        versionId: 5,
        projectId: 'proj-abc',
        docJson: { title: 'Snapshot' },
        docSchemaVersion: 1,
        createdByUserId: 'user-001',
        createdAt: new Date(),
        parentVersionId: null,
      };
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);

      const doc = await getVersionDoc('proj-abc', 5);

      expect(doc).toEqual({ title: 'Snapshot' });
    });

    it('throws NotFoundError when version does not exist', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(null);

      await expect(getVersionDoc('proj-abc', 999)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ── listVersions ──────────────────────────────────────────────────────────

  describe('listVersions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns an array of version summaries from the repository', async () => {
      const mockSummaries = [
        {
          versionId: 10,
          projectId: 'proj-abc',
          docSchemaVersion: 1,
          createdByUserId: 'user-001',
          createdAt: new Date('2026-04-03T10:00:00.000Z'),
          parentVersionId: 9,
          durationFrames: 300,
        },
        {
          versionId: 9,
          projectId: 'proj-abc',
          docSchemaVersion: 1,
          createdByUserId: null,
          createdAt: new Date('2026-04-03T09:00:00.000Z'),
          parentVersionId: null,
          durationFrames: 150,
        },
      ];
      vi.mocked(versionRepository.listVersions).mockResolvedValueOnce(mockSummaries);

      const result = await listVersions('proj-abc');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ versionId: 10, durationFrames: 300 });
      expect(result[1]).toMatchObject({ versionId: 9, durationFrames: 150 });
    });

    it('returns an empty array when the project has no versions', async () => {
      vi.mocked(versionRepository.listVersions).mockResolvedValueOnce([]);

      const result = await listVersions('proj-no-versions');

      expect(result).toEqual([]);
    });

    it('delegates to versionRepository.listVersions with the project id', async () => {
      vi.mocked(versionRepository.listVersions).mockResolvedValueOnce([]);

      await listVersions('proj-xyz');

      expect(versionRepository.listVersions).toHaveBeenCalledWith('proj-xyz');
    });
  });

  // ── restoreVersion ────────────────────────────────────────────────────────

  describe('restoreVersion', () => {
    const mockVersion = {
      versionId: 7,
      projectId: 'proj-abc',
      docJson: { title: 'Restored Snapshot', durationFrames: 300 },
      docSchemaVersion: 1,
      createdByUserId: 'user-001',
      createdAt: new Date('2026-04-03T08:00:00.000Z'),
      parentVersionId: 6,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(versionRepository.getConnection).mockResolvedValue(mockConn);
      vi.mocked(versionRepository.restoreVersionTransaction).mockResolvedValue(undefined);
    });

    it('returns the docJson of the target version on success', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);

      const result = await restoreVersion({
        projectId: 'proj-abc',
        versionId: 7,
        restoredByUserId: 'user-001',
      });

      expect(result).toEqual({ title: 'Restored Snapshot', durationFrames: 300 });
    });

    it('calls beginTransaction, restoreVersionTransaction, and commit in order', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);

      await restoreVersion({ projectId: 'proj-abc', versionId: 7, restoredByUserId: 'user-001' });

      expect(mockConn.beginTransaction).toHaveBeenCalledOnce();
      expect(versionRepository.restoreVersionTransaction).toHaveBeenCalledWith(
        mockConn,
        { projectId: 'proj-abc', versionId: 7, restoredByUserId: 'user-001' },
      );
      expect(mockConn.commit).toHaveBeenCalledOnce();
      expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the version does not belong to the project', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(null);

      await expect(
        restoreVersion({ projectId: 'proj-abc', versionId: 999, restoredByUserId: null }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rolls back and re-throws when restoreVersionTransaction throws', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);
      vi.mocked(versionRepository.restoreVersionTransaction).mockRejectedValueOnce(
        new Error('DB failure'),
      );

      await expect(
        restoreVersion({ projectId: 'proj-abc', versionId: 7, restoredByUserId: null }),
      ).rejects.toThrow('DB failure');

      expect(mockConn.rollback).toHaveBeenCalledOnce();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });

    it('always releases the connection even on error', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);
      vi.mocked(versionRepository.restoreVersionTransaction).mockRejectedValueOnce(
        new Error('unexpected'),
      );

      await expect(
        restoreVersion({ projectId: 'proj-abc', versionId: 7, restoredByUserId: null }),
      ).rejects.toThrow();

      expect(mockConn.release).toHaveBeenCalledOnce();
    });

    it('accepts null restoredByUserId (anonymous restore)', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(mockVersion);

      const result = await restoreVersion({
        projectId: 'proj-abc',
        versionId: 7,
        restoredByUserId: null,
      });

      expect(result).toEqual(mockVersion.docJson);
    });
  });

});
