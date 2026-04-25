import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Pool mock must be hoisted before module imports ───────────────────────────

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  createProject,
  findProjectsByUserId,
} from './project.repository.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    project_id: 'test-project-id',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-02T00:00:00Z'),
    title: 'My Project',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('project.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('inserts a row with projectId, ownerUserId, and title', async () => {
      mockExecute
        .mockResolvedValueOnce([{}, []])          // INSERT
        .mockResolvedValueOnce([[makeProjectRow()], []]); // SELECT

      await createProject('test-project-id', 'user-123', 'My Title');

      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
        ['test-project-id', 'user-123', 'My Title'],
      );
    });

    it('uses Untitled project as default title when title is undefined', async () => {
      mockExecute
        .mockResolvedValueOnce([{}, []])
        .mockResolvedValueOnce([[makeProjectRow({ title: 'Untitled project' })], []]);

      await createProject('proj-id', 'user-123');

      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
        ['proj-id', 'user-123', 'Untitled project'],
      );
    });

    it('returns projectId and createdAt from the SELECT after insert', async () => {
      const createdAt = new Date('2024-03-01T12:00:00Z');
      mockExecute
        .mockResolvedValueOnce([{}, []])
        .mockResolvedValueOnce([[makeProjectRow({ created_at: createdAt })], []]);

      const result = await createProject('proj-id', 'user-123');

      expect(result.projectId).toBe('test-project-id');
      expect(result.createdAt).toEqual(createdAt);
    });

    it('throws when the SELECT returns no row after insert', async () => {
      mockExecute
        .mockResolvedValueOnce([{}, []])
        .mockResolvedValueOnce([[], []]);

      await expect(createProject('missing-id', 'user-123')).rejects.toThrow(
        'Project row not found after insert: missing-id',
      );
    });
  });

  describe('findProjectsByUserId', () => {
    it('queries with the correct SQL structure (owner filter + ORDER BY + thumbnail subquery)', async () => {
      mockExecute.mockResolvedValueOnce([[], []]);

      await findProjectsByUserId('user-abc');

      const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
      expect(sql).toContain('WHERE p.owner_user_id = ?');
      expect(sql).toContain('ORDER BY p.updated_at DESC');
      // Uses correlated subqueries against project_clips_current and project_files,
      // not the legacy NULL placeholder or project_assets_current.
      expect(sql).toContain('project_clips_current');
      expect(sql).toContain("type IN ('video', 'image')");
      expect(sql).toContain('ORDER BY c.start_frame ASC');
      expect(sql).toContain('project_files');
      expect(sql).not.toContain('NULL AS thumbnail_uri');
      expect(sql).not.toContain('project_assets_current');
      expect(params).toEqual(['user-abc']);
    });

    it('maps rows to ProjectSummary objects', async () => {
      const rows = [
        {
          project_id: 'proj-1',
          title: 'First',
          updated_at: new Date('2024-05-01T00:00:00Z'),
          thumbnail_uri: 's3://bucket/thumb1.jpg',
          thumbnail_file_id: 'file-id-1',
        },
        {
          project_id: 'proj-2',
          title: 'Second',
          updated_at: new Date('2024-04-01T00:00:00Z'),
          thumbnail_uri: null,
          thumbnail_file_id: null,
        },
      ];
      mockExecute.mockResolvedValueOnce([rows, []]);

      const result = await findProjectsByUserId('user-abc');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        projectId: 'proj-1',
        title: 'First',
        updatedAt: new Date('2024-05-01T00:00:00Z'),
        thumbnailUrl: 's3://bucket/thumb1.jpg',
        thumbnailFileId: 'file-id-1',
      });
      expect(result[1]).toEqual({
        projectId: 'proj-2',
        title: 'Second',
        updatedAt: new Date('2024-04-01T00:00:00Z'),
        thumbnailUrl: null,
        thumbnailFileId: null,
      });
    });

    it('returns an empty array when the user has no projects', async () => {
      mockExecute.mockResolvedValueOnce([[], []]);

      const result = await findProjectsByUserId('user-no-projects');

      expect(result).toEqual([]);
    });

    it('maps undefined thumbnail_uri and thumbnail_file_id to null', async () => {
      const rows = [
        {
          project_id: 'proj-1',
          title: 'No clip',
          updated_at: new Date('2024-01-01T00:00:00Z'),
          thumbnail_uri: undefined,
          thumbnail_file_id: undefined,
        },
      ];
      mockExecute.mockResolvedValueOnce([rows, []]);

      const result = await findProjectsByUserId('user-abc');

      expect(result[0]!.thumbnailUrl).toBeNull();
      expect(result[0]!.thumbnailFileId).toBeNull();
    });
  });
});
