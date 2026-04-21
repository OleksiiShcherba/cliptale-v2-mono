/**
 * Soft-delete filter unit tests for clip.repository.ts.
 *
 * Tests cover that `isFileLinkedToProject` includes the `deleted_at IS NULL`
 * filter on the `project_files` pivot so that soft-deleted pivot rows are not
 * treated as active links.
 *
 * All DB calls are mocked — no real database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Pool mock — hoisted so it is available when vi.mock factory runs ──────────

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import { isFileLinkedToProject } from './clip.repository.js';

// ── isFileLinkedToProject — deleted_at IS NULL filter ─────────────────────────

describe('clip.repository — isFileLinkedToProject (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause for the project_files pivot', async () => {
    mockExecute.mockResolvedValueOnce([[{ cnt: 0 }], []]);

    await isFileLinkedToProject('proj-uuid-001', 'file-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/FROM\s+project_files/i);
    expect(sql).toMatch(/WHERE\s+project_id\s*=\s*\?\s+AND\s+file_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['proj-uuid-001', 'file-uuid-001']);
  });

  it('returns false when the only matching pivot row is soft-deleted (cnt = 0)', async () => {
    mockExecute.mockResolvedValueOnce([[{ cnt: 0 }], []]);

    const result = await isFileLinkedToProject('proj-uuid-001', 'file-uuid-001');

    expect(result).toBe(false);
  });

  it('returns true when a non-deleted pivot row exists (cnt > 0)', async () => {
    mockExecute.mockResolvedValueOnce([[{ cnt: 1 }], []]);

    const result = await isFileLinkedToProject('proj-uuid-001', 'file-uuid-001');

    expect(result).toBe(true);
  });
});
