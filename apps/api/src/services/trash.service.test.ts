/**
 * Unit tests for trash.service.ts.
 *
 * All repository calls are mocked — no real database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError } from '@/lib/errors.js';

// ── Repository mocks ──────────────────────────────────────────────────────────

vi.mock('@/repositories/file.repository.trash.js', () => ({
  listSoftDeletedByUser: vi.fn(),
}));

vi.mock('@/repositories/project.repository.js', () => ({
  listSoftDeletedByUser: vi.fn(),
}));

vi.mock('@/repositories/generationDraft.repository.trash.js', () => ({
  listSoftDeletedByUser: vi.fn(),
}));

import * as fileRepo from '@/repositories/file.repository.trash.js';
import * as projectRepo from '@/repositories/project.repository.js';
import * as draftRepo from '@/repositories/generationDraft.repository.trash.js';
import { listTrash } from './trash.service.js';

const NOW = new Date('2026-04-20T12:00:00Z');
const OLDER = new Date('2026-04-19T12:00:00Z');
const OLDEST = new Date('2026-04-18T12:00:00Z');

// ── listTrash — type validation ───────────────────────────────────────────────

describe('trash.service — listTrash', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError when type is invalid', async () => {
    await expect(listTrash('user-1', 'invalid', 10)).rejects.toBeInstanceOf(ValidationError);
  });

  // ── type=file ───────────────────────────────────────────────────────────────

  describe('type=file', () => {
    it('returns mapped file items', async () => {
      vi.mocked(fileRepo.listSoftDeletedByUser).mockResolvedValueOnce([
        { fileId: 'file-1', displayName: 'video.mp4', deletedAt: NOW },
      ]);

      const result = await listTrash('user-1', 'file', 10);

      expect(result.items).toEqual([
        { id: 'file-1', type: 'file', name: 'video.mp4', deletedAt: NOW },
      ]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('uses fileId as name when displayName is null', async () => {
      vi.mocked(fileRepo.listSoftDeletedByUser).mockResolvedValueOnce([
        { fileId: 'file-uuid', displayName: null, deletedAt: NOW },
      ]);

      const result = await listTrash('user-1', 'file', 10);

      expect(result.items[0]!.name).toBe('file-uuid');
    });

    it('sets nextCursor when there are more items than limit', async () => {
      // limit=2, fetch limit = 3; return 3 rows to simulate next page
      vi.mocked(fileRepo.listSoftDeletedByUser).mockResolvedValueOnce([
        { fileId: 'f1', displayName: 'a.mp4', deletedAt: NOW },
        { fileId: 'f2', displayName: 'b.mp4', deletedAt: OLDER },
        { fileId: 'f3', displayName: 'c.mp4', deletedAt: OLDEST }, // extra
      ]);

      const result = await listTrash('user-1', 'file', 2);

      expect(result.items).toHaveLength(2);
      // nextCursor encodes last returned item: deletedAt:id
      expect(result.nextCursor).toBe(`${OLDER.toISOString()}:f2`);
    });

    it('does not set nextCursor when items fit in limit', async () => {
      vi.mocked(fileRepo.listSoftDeletedByUser).mockResolvedValueOnce([
        { fileId: 'f1', displayName: 'a.mp4', deletedAt: NOW },
      ]);

      const result = await listTrash('user-1', 'file', 10);

      expect(result.nextCursor).toBeUndefined();
    });

    it('passes capped limit to the repository (max 50)', async () => {
      vi.mocked(fileRepo.listSoftDeletedByUser).mockResolvedValueOnce([]);

      await listTrash('user-1', 'file', 999);

      // fetch limit = capped 50 + 1 = 51
      expect(fileRepo.listSoftDeletedByUser).toHaveBeenCalledWith('user-1', 51, undefined);
    });

    it('forwards cursor to the repository', async () => {
      const cursor = `${OLDER.toISOString()}:f2`;
      vi.mocked(fileRepo.listSoftDeletedByUser).mockResolvedValueOnce([]);

      await listTrash('user-1', 'file', 10, cursor);

      expect(fileRepo.listSoftDeletedByUser).toHaveBeenCalledWith('user-1', 11, cursor);
    });

    it('returns second page when cursor is provided (pagination e2e)', async () => {
      // Simulate: 3 items total, limit=2
      // Page 1: items f1, f2 → nextCursor = `${OLDER}:f2`
      vi.mocked(fileRepo.listSoftDeletedByUser)
        .mockResolvedValueOnce([
          { fileId: 'f1', displayName: 'a.mp4', deletedAt: NOW },
          { fileId: 'f2', displayName: 'b.mp4', deletedAt: OLDER },
          { fileId: 'f3', displayName: 'c.mp4', deletedAt: OLDEST }, // extra row
        ])
        // Page 2 (cursor applied in repo): only f3
        .mockResolvedValueOnce([
          { fileId: 'f3', displayName: 'c.mp4', deletedAt: OLDEST },
        ]);

      const page1 = await listTrash('user-1', 'file', 2);
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBe(`${OLDER.toISOString()}:f2`);

      const page2 = await listTrash('user-1', 'file', 2, page1.nextCursor);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]!.id).toBe('f3');
      expect(page2.nextCursor).toBeUndefined();
    });
  });

  // ── type=project ─────────────────────────────────────────────────────────────

  describe('type=project', () => {
    it('returns mapped project items', async () => {
      vi.mocked(projectRepo.listSoftDeletedByUser).mockResolvedValueOnce([
        { projectId: 'proj-1', title: 'My Film', deletedAt: NOW },
      ]);

      const result = await listTrash('user-1', 'project', 10);

      expect(result.items).toEqual([
        { id: 'proj-1', type: 'project', name: 'My Film', deletedAt: NOW },
      ]);
    });

    it('returns empty items array when no deleted projects', async () => {
      vi.mocked(projectRepo.listSoftDeletedByUser).mockResolvedValueOnce([]);

      const result = await listTrash('user-1', 'project', 10);

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });

    it('forwards cursor to the project repository', async () => {
      const cursor = `${OLDER.toISOString()}:proj-2`;
      vi.mocked(projectRepo.listSoftDeletedByUser).mockResolvedValueOnce([]);

      await listTrash('user-1', 'project', 10, cursor);

      expect(projectRepo.listSoftDeletedByUser).toHaveBeenCalledWith('user-1', 11, cursor);
    });
  });

  // ── type=draft ───────────────────────────────────────────────────────────────

  describe('type=draft', () => {
    it('returns mapped draft items', async () => {
      vi.mocked(draftRepo.listSoftDeletedByUser).mockResolvedValueOnce([
        { id: 'draft-1', textPreview: 'A cinematic sunset...', deletedAt: NOW },
      ]);

      const result = await listTrash('user-1', 'draft', 10);

      expect(result.items).toEqual([
        { id: 'draft-1', type: 'draft', name: 'A cinematic sunset...', deletedAt: NOW },
      ]);
    });

    it('forwards cursor to the draft repository', async () => {
      const cursor = `${OLDER.toISOString()}:draft-2`;
      vi.mocked(draftRepo.listSoftDeletedByUser).mockResolvedValueOnce([]);

      await listTrash('user-1', 'draft', 10, cursor);

      expect(draftRepo.listSoftDeletedByUser).toHaveBeenCalledWith('user-1', 11, cursor);
    });
  });
});
