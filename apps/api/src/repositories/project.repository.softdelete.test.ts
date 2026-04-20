/**
 * Soft-delete / restore unit tests for project.repository.ts.
 *
 * Tests cover:
 *  - softDeleteProject()               sets deleted_at on the row
 *  - restoreProject()                  clears deleted_at
 *  - findProjectById()                 respects deleted_at IS NULL
 *  - findProjectByIdIncludingDeleted() returns row regardless of state
 *  - findProjectsByUserId()            excludes soft-deleted rows
 *
 * All DB calls are mocked — no real database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

// ── Pool mock — hoisted so it is available when vi.mock factory runs ──────────

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  findProjectById,
  findProjectByIdIncludingDeleted,
  findProjectsByUserId,
  softDeleteProject,
  restoreProject,
} from './project.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProjectRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    project_id: 'proj-uuid-001',
    owner_user_id: 'user-uuid-001',
    title: 'My Project',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

// ── softDeleteProject ─────────────────────────────────────────────────────────

describe('project.repository — softDeleteProject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE projects SET deleted_at scoped to the project and WHERE deleted_at IS NULL', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    const result = await softDeleteProject('proj-uuid-001');

    expect(result).toBe(true);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+projects\s+SET\s+deleted_at\s*=\s*NOW/i);
    expect(sql).toMatch(/WHERE\s+project_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['proj-uuid-001']);
  });

  it('returns false when no row was updated (project not found or already deleted)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    const result = await softDeleteProject('nonexistent-project');

    expect(result).toBe(false);
  });
});

// ── restoreProject ────────────────────────────────────────────────────────────

describe('project.repository — restoreProject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE projects SET deleted_at = NULL WHERE deleted_at IS NOT NULL', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    const result = await restoreProject('proj-uuid-001');

    expect(result).toBe(true);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+projects\s+SET\s+deleted_at\s*=\s*NULL/i);
    expect(sql).toMatch(/WHERE\s+project_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NOT\s+NULL/i);
    expect(params).toEqual(['proj-uuid-001']);
  });

  it('returns false when no row was updated (project not found or not soft-deleted)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    const result = await restoreProject('active-project');

    expect(result).toBe(false);
  });
});

// ── findProjectById — respects deleted_at IS NULL ─────────────────────────────

describe('project.repository — findProjectById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findProjectById('proj-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+project_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['proj-uuid-001']);
  });

  it('returns null when the project is soft-deleted (DB returns empty row)', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findProjectById('soft-deleted-project');

    expect(result).toBeNull();
  });

  it('returns the mapped ProjectRecord when the project exists and is not deleted', async () => {
    mockExecute.mockResolvedValueOnce([[makeProjectRow()], []]);

    const result = await findProjectById('proj-uuid-001');

    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-uuid-001');
    expect(result!.ownerUserId).toBe('user-uuid-001');
    expect(result!.deletedAt).toBeNull();
  });
});

// ── findProjectByIdIncludingDeleted ───────────────────────────────────────────

describe('project.repository — findProjectByIdIncludingDeleted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT include deleted_at IS NULL in the WHERE clause', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findProjectByIdIncludingDeleted('proj-uuid-001');

    const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/WHERE\s+project_id\s*=\s*\?/i);
  });

  it('returns the row when deleted_at is set', async () => {
    const deletedAt = new Date('2026-04-20T12:00:00Z');
    mockExecute.mockResolvedValueOnce([[makeProjectRow({ deleted_at: deletedAt })], []]);

    const result = await findProjectByIdIncludingDeleted('proj-uuid-001');

    expect(result).not.toBeNull();
    expect(result!.deletedAt).toEqual(deletedAt);
  });

  it('returns null when no row exists', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findProjectByIdIncludingDeleted('nonexistent');

    expect(result).toBeNull();
  });
});

// ── findProjectsByUserId — excludes soft-deleted rows ─────────────────────────

describe('project.repository — findProjectsByUserId (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findProjectsByUserId('user-uuid-001');

    const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/WHERE\s+p\.owner_user_id\s*=\s*\?\s+AND\s+p\.deleted_at\s+IS\s+NULL/i);
  });
});
