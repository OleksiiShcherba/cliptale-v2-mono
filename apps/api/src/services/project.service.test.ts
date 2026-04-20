import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as projectRepository from '@/repositories/project.repository.js';
import { NotFoundError } from '@/lib/errors.js';
import { createProject, listForUser, softDeleteProject } from './project.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/project.repository.js', () => ({
  createProject: vi.fn(),
  findProjectsByUserId: vi.fn(),
  findProjectById: vi.fn(),
  softDeleteProject: vi.fn().mockResolvedValue(true),
  findProjectByIdIncludingDeleted: vi.fn(),
  restoreProject: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('project.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('returns a projectId that is a valid UUID v4', async () => {
      vi.mocked(projectRepository.createProject).mockResolvedValue({
        projectId: 'will-be-overridden',
        createdAt: new Date(),
      });

      const result = await createProject('user-001');

      expect(result.projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('calls projectRepository.createProject with userId and generated UUID', async () => {
      vi.mocked(projectRepository.createProject).mockResolvedValue({
        projectId: 'any',
        createdAt: new Date(),
      });

      const result = await createProject('user-001');

      expect(projectRepository.createProject).toHaveBeenCalledOnce();
      expect(projectRepository.createProject).toHaveBeenCalledWith(
        result.projectId,
        'user-001',
        undefined,
      );
    });

    it('passes the optional title to the repository', async () => {
      vi.mocked(projectRepository.createProject).mockResolvedValue({
        projectId: 'any',
        createdAt: new Date(),
      });

      const result = await createProject('user-001', 'My Custom Title');

      expect(projectRepository.createProject).toHaveBeenCalledWith(
        result.projectId,
        'user-001',
        'My Custom Title',
      );
    });

    it('generates a different UUID on each call', async () => {
      vi.mocked(projectRepository.createProject).mockResolvedValue({
        projectId: 'any',
        createdAt: new Date(),
      });

      const [r1, r2] = await Promise.all([
        createProject('user-001'),
        createProject('user-001'),
      ]);
      expect(r1.projectId).not.toBe(r2.projectId);
    });

    it('propagates repository errors', async () => {
      vi.mocked(projectRepository.createProject).mockRejectedValue(new Error('DB error'));

      await expect(createProject('user-001')).rejects.toThrow('DB error');
    });
  });

  describe('listForUser', () => {
    const userId = 'user-list-test';

    const summaries = [
      {
        projectId: 'proj-1',
        title: 'Alpha',
        updatedAt: new Date('2024-05-10T00:00:00Z'),
        thumbnailUrl: 's3://bucket/thumb1.jpg',
        thumbnailFileId: 'file-id-1',
      },
      {
        projectId: 'proj-2',
        title: 'Beta',
        updatedAt: new Date('2024-04-10T00:00:00Z'),
        thumbnailUrl: null,
        thumbnailFileId: null,
      },
    ];

    it('delegates to projectRepository.findProjectsByUserId with the userId', async () => {
      vi.mocked(projectRepository.findProjectsByUserId).mockResolvedValue(summaries);

      await listForUser(userId);

      expect(projectRepository.findProjectsByUserId).toHaveBeenCalledOnce();
      expect(projectRepository.findProjectsByUserId).toHaveBeenCalledWith(userId);
    });

    it('returns the list returned by the repository', async () => {
      vi.mocked(projectRepository.findProjectsByUserId).mockResolvedValue(summaries);

      const result = await listForUser(userId);

      expect(result).toEqual(summaries);
    });

    it('returns an empty array when the user has no projects', async () => {
      vi.mocked(projectRepository.findProjectsByUserId).mockResolvedValue([]);

      const result = await listForUser(userId);

      expect(result).toEqual([]);
    });

    it('isolates ownership — never mixes projects from different users', async () => {
      vi.mocked(projectRepository.findProjectsByUserId).mockImplementation(
        async (uid) => (uid === userId ? summaries : []),
      );

      const result = await listForUser('other-user');

      expect(result).toEqual([]);
      expect(projectRepository.findProjectsByUserId).toHaveBeenCalledWith('other-user');
    });

    it('propagates repository errors', async () => {
      vi.mocked(projectRepository.findProjectsByUserId).mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(listForUser(userId)).rejects.toThrow('DB connection lost');
    });
  });

  // ── softDeleteProject ──────────────────────────────────────────────────────

  describe('softDeleteProject', () => {
    const projectRecord = {
      projectId: 'proj-sd-001',
      ownerUserId: 'user-sd-001',
      title: 'To Delete',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(projectRepository.findProjectById).mockResolvedValue(projectRecord);
      vi.mocked(projectRepository.softDeleteProject).mockResolvedValue(true);
    });

    it('calls softDeleteProject and resolves void on the happy path', async () => {
      await expect(softDeleteProject('user-sd-001', 'proj-sd-001')).resolves.toBeUndefined();
      expect(projectRepository.softDeleteProject).toHaveBeenCalledWith('proj-sd-001');
    });

    it('throws NotFoundError when the project does not exist', async () => {
      vi.mocked(projectRepository.findProjectById).mockResolvedValueOnce(null);
      await expect(softDeleteProject('user-sd-001', 'proj-sd-001')).rejects.toBeInstanceOf(NotFoundError);
      expect(projectRepository.softDeleteProject).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the project belongs to another user', async () => {
      vi.mocked(projectRepository.findProjectById).mockResolvedValueOnce({
        ...projectRecord,
        ownerUserId: 'different-user',
      });
      await expect(softDeleteProject('user-sd-001', 'proj-sd-001')).rejects.toBeInstanceOf(NotFoundError);
      expect(projectRepository.softDeleteProject).not.toHaveBeenCalled();
    });

    it('propagates repository errors from softDeleteProject', async () => {
      vi.mocked(projectRepository.softDeleteProject).mockRejectedValue(new Error('DB fail'));
      await expect(softDeleteProject('user-sd-001', 'proj-sd-001')).rejects.toThrow('DB fail');
    });
  });
});
