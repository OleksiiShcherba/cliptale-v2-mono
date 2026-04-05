import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as projectRepository from '@/repositories/project.repository.js';
import { createProject } from './project.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/project.repository.js', () => ({
  createProject: vi.fn(),
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

      const result = await createProject();

      expect(result.projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('calls projectRepository.createProject with the generated UUID', async () => {
      vi.mocked(projectRepository.createProject).mockResolvedValue({
        projectId: 'any',
        createdAt: new Date(),
      });

      const result = await createProject();

      expect(projectRepository.createProject).toHaveBeenCalledOnce();
      expect(projectRepository.createProject).toHaveBeenCalledWith(result.projectId);
    });

    it('generates a different UUID on each call', async () => {
      vi.mocked(projectRepository.createProject).mockResolvedValue({
        projectId: 'any',
        createdAt: new Date(),
      });

      const [r1, r2] = await Promise.all([createProject(), createProject()]);
      expect(r1.projectId).not.toBe(r2.projectId);
    });

    it('propagates repository errors', async () => {
      vi.mocked(projectRepository.createProject).mockRejectedValue(new Error('DB error'));

      await expect(createProject()).rejects.toThrow('DB error');
    });
  });
});
