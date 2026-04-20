/**
 * Soft-delete / restore unit tests for file.repository.ts.
 *
 * Tests cover:
 *  - softDelete()  sets deleted_at, so findById() returns null afterwards
 *  - restore()     clears deleted_at, so findById() returns the row again
 *  - findByIdIncludingDeleted() always returns the row regardless of state
 *  - findByIdForUser() respects deleted_at IS NULL
 *  - findReadyForUser() excludes soft-deleted rows
 *  - getReadyTotalsForUser() excludes soft-deleted rows
 *
 * All DB calls are mocked — no real database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

// ── Pool mock — hoisted so it is available when vi.mock factory runs ──────────

const { mockExecute, mockQuery } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute, query: mockQuery },
}));

import {
  findById,
  findByIdIncludingDeleted,
  findByIdForUser,
  findReadyForUser,
  getReadyTotalsForUser,
  softDelete,
  restore,
} from './file.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    file_id: 'file-uuid-001',
    user_id: 'user-uuid-001',
    kind: 'video',
    storage_uri: 's3://bucket/video.mp4',
    mime_type: 'video/mp4',
    bytes: 1_000_000,
    width: 1920,
    height: 1080,
    duration_ms: 5000,
    display_name: 'My Video',
    status: 'ready',
    error_message: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

// ── softDelete ────────────────────────────────────────────────────────────────

describe('file.repository — softDelete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE files SET deleted_at = NOW(3) scoped to the file and WHERE deleted_at IS NULL', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    const result = await softDelete('file-uuid-001');

    expect(result).toBe(true);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+files\s+SET\s+deleted_at\s*=\s*NOW/i);
    expect(sql).toMatch(/WHERE\s+file_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['file-uuid-001']);
  });

  it('returns false when no row was updated (file not found or already deleted)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    const result = await softDelete('nonexistent-file');

    expect(result).toBe(false);
  });
});

// ── restore ───────────────────────────────────────────────────────────────────

describe('file.repository — restore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE files SET deleted_at = NULL scoped to the file and WHERE deleted_at IS NOT NULL', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    const result = await restore('file-uuid-001');

    expect(result).toBe(true);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+files\s+SET\s+deleted_at\s*=\s*NULL/i);
    expect(sql).toMatch(/WHERE\s+file_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NOT\s+NULL/i);
    expect(params).toEqual(['file-uuid-001']);
  });

  it('returns false when no row was updated (file not found or not soft-deleted)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    const result = await restore('active-file');

    expect(result).toBe(false);
  });
});

// ── findById — respects deleted_at IS NULL ────────────────────────────────────

describe('file.repository — findById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findById('file-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+file_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['file-uuid-001']);
  });

  it('returns null when the row has a non-null deleted_at (simulated by empty result)', async () => {
    // The WHERE clause filters soft-deleted rows; the DB returns empty.
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findById('soft-deleted-file');

    expect(result).toBeNull();
  });

  it('returns the mapped row when found and not deleted', async () => {
    const row = makeDbRow();
    mockExecute.mockResolvedValueOnce([[row], []]);

    const result = await findById('file-uuid-001');

    expect(result).not.toBeNull();
    expect(result!.fileId).toBe('file-uuid-001');
    expect(result!.deletedAt).toBeNull();
  });
});

// ── findByIdIncludingDeleted — ignores deleted_at ─────────────────────────────

describe('file.repository — findByIdIncludingDeleted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT include deleted_at IS NULL in the WHERE clause', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findByIdIncludingDeleted('file-uuid-001');

    const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/WHERE\s+file_id\s*=\s*\?/i);
  });

  it('returns the row even when deleted_at is set', async () => {
    const deletedAt = new Date('2026-04-20T12:00:00Z');
    const row = makeDbRow({ deleted_at: deletedAt });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const result = await findByIdIncludingDeleted('file-uuid-001');

    expect(result).not.toBeNull();
    expect(result!.deletedAt).toEqual(deletedAt);
  });

  it('returns null when no row exists at all', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findByIdIncludingDeleted('nonexistent');

    expect(result).toBeNull();
  });
});

// ── findByIdForUser — respects deleted_at IS NULL ─────────────────────────────

describe('file.repository — findByIdForUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findByIdForUser('file-uuid-001', 'user-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+file_id\s*=\s*\?.*AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['file-uuid-001', 'user-uuid-001']);
  });

  it('returns null for a soft-deleted file (DB returns empty due to filter)', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findByIdForUser('deleted-file', 'user-uuid-001');

    expect(result).toBeNull();
  });
});

// ── findReadyForUser — excludes soft-deleted rows ─────────────────────────────

describe('file.repository — findReadyForUser (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL as a WHERE clause condition', async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    await findReadyForUser({ userId: 'user-001', limit: 10 });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });
});

// ── getReadyTotalsForUser — excludes soft-deleted rows ────────────────────────

describe('file.repository — getReadyTotalsForUser (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    await getReadyTotalsForUser('user-001');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });
});

// ── deletedAt field mapping ───────────────────────────────────────────────────

describe('file.repository — deletedAt field mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps deleted_at = null to deletedAt: null in the returned FileRow', async () => {
    mockExecute.mockResolvedValueOnce([[makeDbRow({ deleted_at: null })], []]);

    const result = await findById('file-uuid-001');

    expect(result!.deletedAt).toBeNull();
  });

  it('maps a Date deleted_at value to deletedAt in the returned row (via findByIdIncludingDeleted)', async () => {
    const deletedAt = new Date('2026-04-20T12:00:00Z');
    mockExecute.mockResolvedValueOnce([[makeDbRow({ deleted_at: deletedAt })], []]);

    const result = await findByIdIncludingDeleted('file-uuid-001');

    expect(result!.deletedAt).toEqual(deletedAt);
  });
});
