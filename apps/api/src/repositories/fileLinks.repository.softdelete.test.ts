/**
 * Soft-delete filter unit tests for fileLinks.repository.ts.
 *
 * Tests cover that `findFilesByProjectId` and `findFilesByDraftId` filter both
 * the pivot row (`pf.deleted_at IS NULL` / `df.deleted_at IS NULL`) and the
 * joined file row (`f.deleted_at IS NULL`).
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

import {
  findFilesByProjectId,
  findFilesByDraftId,
} from './fileLinks.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    file_id: 'file-uuid-001',
    user_id: 'user-uuid-001',
    kind: 'video',
    storage_uri: 's3://bucket/video.mp4',
    mime_type: 'video/mp4',
    bytes: 500_000,
    width: 1280,
    height: 720,
    duration_ms: 8000,
    display_name: 'Clip A',
    status: 'ready',
    error_message: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

// ── findFilesByProjectId ──────────────────────────────────────────────────────

describe('fileLinks.repository — findFilesByProjectId (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters both pivot (pf.deleted_at IS NULL) and file (f.deleted_at IS NULL)', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findFilesByProjectId('proj-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/pf\.deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/f\.deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['proj-uuid-001']);
  });

  it('returns an empty array when no non-deleted files are linked to the project', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findFilesByProjectId('proj-uuid-001');

    expect(result).toEqual([]);
  });

  it('maps returned rows to FileRow shape including deletedAt', async () => {
    const row = makeFileRow();
    mockExecute.mockResolvedValueOnce([[row], []]);

    const result = await findFilesByProjectId('proj-uuid-001');

    expect(result).toHaveLength(1);
    expect(result[0]!.fileId).toBe('file-uuid-001');
    expect(result[0]!.deletedAt).toBeNull();
  });
});

// ── findFilesByDraftId ────────────────────────────────────────────────────────

describe('fileLinks.repository — findFilesByDraftId (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters both pivot (df.deleted_at IS NULL) and file (f.deleted_at IS NULL)', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await findFilesByDraftId('draft-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/df\.deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/f\.deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['draft-uuid-001']);
  });

  it('returns an empty array when no non-deleted files are linked to the draft', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await findFilesByDraftId('draft-uuid-001');

    expect(result).toEqual([]);
  });

  it('maps returned rows to FileRow shape including deletedAt', async () => {
    const row = makeFileRow({ file_id: 'file-uuid-002', display_name: 'Draft Asset' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const result = await findFilesByDraftId('draft-uuid-001');

    expect(result).toHaveLength(1);
    expect(result[0]!.fileId).toBe('file-uuid-002');
    expect(result[0]!.displayName).toBe('Draft Asset');
    expect(result[0]!.deletedAt).toBeNull();
  });
});
