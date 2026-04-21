/**
 * Soft-delete / restore unit tests for generationDraft.repository.ts.
 *
 * Tests cover:
 *  - softDeleteDraft()               sets deleted_at
 *  - restoreDraft()                  clears deleted_at
 *  - findDraftById()                 respects deleted_at IS NULL
 *  - findDraftByIdIncludingDeleted() returns row regardless of state
 *  - findDraftsByUserId()            excludes soft-deleted rows
 *  - findStoryboardDraftsForUser()   excludes soft-deleted rows
 *  - findAssetPreviewsByIds()        excludes soft-deleted files
 *
 * All DB calls are mocked — no real database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';
import type { PromptDoc } from '@ai-video-editor/project-schema';

// ── Pool mock — hoisted so it is available when vi.mock factory runs ──────────

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@/db/connection.js', () => ({
  pool: { query: mockQuery },
}));

import {
  findDraftById,
  findDraftByIdIncludingDeleted,
  findDraftsByUserId,
  findStoryboardDraftsForUser,
  findAssetPreviewsByIds,
  softDeleteDraft,
  restoreDraft,
} from './generationDraft.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_PROMPT_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Hello world' }],
};

function makeDraftRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'draft-uuid-001',
    user_id: 'user-uuid-001',
    prompt_doc: VALID_PROMPT_DOC,
    status: 'draft',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

// ── softDeleteDraft ───────────────────────────────────────────────────────────

describe('generationDraft.repository — softDeleteDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE generation_drafts SET deleted_at = NOW(3) WHERE id = ? AND deleted_at IS NULL', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader]);

    const result = await softDeleteDraft('draft-uuid-001');

    expect(result).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+generation_drafts\s+SET\s+deleted_at\s*=\s*NOW/i);
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['draft-uuid-001']);
  });

  it('returns false when no row was updated (draft not found or already deleted)', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader]);

    const result = await softDeleteDraft('nonexistent');

    expect(result).toBe(false);
  });
});

// ── restoreDraft ──────────────────────────────────────────────────────────────

describe('generationDraft.repository — restoreDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE generation_drafts SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader]);

    const result = await restoreDraft('draft-uuid-001');

    expect(result).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+generation_drafts\s+SET\s+deleted_at\s*=\s*NULL/i);
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NOT\s+NULL/i);
    expect(params).toEqual(['draft-uuid-001']);
  });

  it('returns false when no row was updated (draft not found or not soft-deleted)', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader]);

    const result = await restoreDraft('active-draft');

    expect(result).toBe(false);
  });
});

// ── findDraftById — respects deleted_at IS NULL ───────────────────────────────

describe('generationDraft.repository — findDraftById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await findDraftById('draft-uuid-001');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
    expect(params).toEqual(['draft-uuid-001']);
  });

  it('returns null when the draft is soft-deleted (DB returns empty)', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await findDraftById('soft-deleted-draft');

    expect(result).toBeNull();
  });

  it('returns the mapped draft when found and not deleted', async () => {
    mockQuery.mockResolvedValueOnce([[makeDraftRow()]]);

    const result = await findDraftById('draft-uuid-001');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('draft-uuid-001');
    expect(result!.deletedAt).toBeNull();
  });
});

// ── findDraftByIdIncludingDeleted ─────────────────────────────────────────────

describe('generationDraft.repository — findDraftByIdIncludingDeleted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT include deleted_at IS NULL in the WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await findDraftByIdIncludingDeleted('draft-uuid-001');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\?/i);
  });

  it('returns the row even when deleted_at is set', async () => {
    const deletedAt = new Date('2026-04-20T12:00:00Z');
    mockQuery.mockResolvedValueOnce([[makeDraftRow({ deleted_at: deletedAt })]]);

    const result = await findDraftByIdIncludingDeleted('draft-uuid-001');

    expect(result).not.toBeNull();
    expect(result!.deletedAt).toEqual(deletedAt);
  });

  it('returns null when no row exists', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await findDraftByIdIncludingDeleted('nonexistent');

    expect(result).toBeNull();
  });
});

// ── findDraftsByUserId — excludes soft-deleted rows ───────────────────────────

describe('generationDraft.repository — findDraftsByUserId (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await findDraftsByUserId('user-uuid-001');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+user_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
  });
});

// ── findStoryboardDraftsForUser — excludes soft-deleted rows ──────────────────

describe('generationDraft.repository — findStoryboardDraftsForUser (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await findStoryboardDraftsForUser('user-uuid-001');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+user_id\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i);
  });
});

// ── findAssetPreviewsByIds — excludes soft-deleted files ──────────────────────

describe('generationDraft.repository — findAssetPreviewsByIds (deleted_at filter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes deleted_at IS NULL in the WHERE clause when querying files', async () => {
    mockQuery.mockResolvedValueOnce([[{ file_id: 'file-001', mime_type: 'video/mp4' }]]);

    await findAssetPreviewsByIds(['file-001']);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });

  it('returns [] without querying when given an empty array', async () => {
    const result = await findAssetPreviewsByIds([]);

    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ── deletedAt field mapping ───────────────────────────────────────────────────

describe('generationDraft.repository — deletedAt field mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps deleted_at = null to deletedAt: null on the returned draft', async () => {
    mockQuery.mockResolvedValueOnce([[makeDraftRow({ deleted_at: null })]]);

    const result = await findDraftByIdIncludingDeleted('draft-uuid-001');

    expect(result!.deletedAt).toBeNull();
  });

  it('maps a Date deleted_at to deletedAt on the returned draft', async () => {
    const deletedAt = new Date('2026-04-20T10:00:00Z');
    mockQuery.mockResolvedValueOnce([[makeDraftRow({ deleted_at: deletedAt })]]);

    const result = await findDraftByIdIncludingDeleted('draft-uuid-001');

    expect(result!.deletedAt).toEqual(deletedAt);
  });
});
