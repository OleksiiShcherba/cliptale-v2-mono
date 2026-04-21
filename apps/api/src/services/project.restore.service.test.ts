/**
 * Unit tests for project.restore.service.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GoneError, NotFoundError } from '@/lib/errors.js';
import * as projectRepository from '@/repositories/project.repository.js';

import { restoreProject } from './project.restore.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/project.repository.js', () => ({
  findProjectByIdIncludingDeleted: vi.fn(),
  restoreProject: vi.fn().mockResolvedValue(true),
  findProjectById: vi.fn(),
  findProjectsByUserId: vi.fn(),
  createProject: vi.fn(),
  softDeleteProject: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseProject = {
  projectId: 'proj-restore-001',
  ownerUserId: 'user-222',
  title: 'My Project',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  deletedAt: new Date('2026-04-10T00:00:00.000Z'), // recent — within TTL
};

// ── restoreProject ────────────────────────────────────────────────────────────

describe('project.restore.service', () => {
  describe('restoreProject', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(projectRepository.findProjectByIdIncludingDeleted).mockResolvedValue(baseProject);
      vi.mocked(projectRepository.restoreProject).mockResolvedValue(true);
    });

    it('calls restoreProject and returns the project with deletedAt null on happy path', async () => {
      const result = await restoreProject('user-222', 'proj-restore-001');
      expect(projectRepository.restoreProject).toHaveBeenCalledWith('proj-restore-001');
      expect(result.deletedAt).toBeNull();
      expect(result.projectId).toBe('proj-restore-001');
    });

    it('throws GoneError when the row does not exist (hard-purged)', async () => {
      vi.mocked(projectRepository.findProjectByIdIncludingDeleted).mockResolvedValueOnce(null);
      await expect(restoreProject('user-222', 'proj-restore-001')).rejects.toBeInstanceOf(GoneError);
      expect(projectRepository.restoreProject).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the project belongs to another user', async () => {
      vi.mocked(projectRepository.findProjectByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseProject,
        ownerUserId: 'other-user',
      });
      await expect(restoreProject('user-222', 'proj-restore-001')).rejects.toBeInstanceOf(NotFoundError);
      expect(projectRepository.restoreProject).not.toHaveBeenCalled();
    });

    it('throws GoneError when deleted_at is older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      vi.mocked(projectRepository.findProjectByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseProject,
        deletedAt: oldDate,
      });
      await expect(restoreProject('user-222', 'proj-restore-001')).rejects.toBeInstanceOf(GoneError);
      expect(projectRepository.restoreProject).not.toHaveBeenCalled();
    });

    it('returns the project without calling restoreProject when already active (idempotent)', async () => {
      vi.mocked(projectRepository.findProjectByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseProject,
        deletedAt: null,
      });
      const result = await restoreProject('user-222', 'proj-restore-001');
      expect(projectRepository.restoreProject).not.toHaveBeenCalled();
      expect(result.deletedAt).toBeNull();
    });

    it('preserves project fields (projectId, ownerUserId, title) in the returned object', async () => {
      const result = await restoreProject('user-222', 'proj-restore-001');
      expect(result.projectId).toBe(baseProject.projectId);
      expect(result.ownerUserId).toBe(baseProject.ownerUserId);
      expect(result.title).toBe(baseProject.title);
    });
  });
});
