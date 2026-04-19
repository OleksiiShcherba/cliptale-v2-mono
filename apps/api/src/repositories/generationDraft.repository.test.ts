/**
 * Unit tests for generationDraft.repository.ts — specifically the `mapRowToDraft`
 * JSON-column handling fix.
 *
 * mysql2/promise returns MySQL JSON columns as already-parsed JavaScript objects
 * when the driver performs automatic JSON parsing. The repository must handle
 * both the object case (real DB) and the string case (legacy / test doubles).
 *
 * All external dependencies (`pool`) are mocked so no real DB is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB connection pool ──────────────────────────────────────────────
// Use vi.hoisted so mockQuery is available when the vi.mock factory runs.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { query: mockQuery },
}));

import { findDraftById, findAssetPreviewsByIds } from './generationDraft.repository.js';
import type { PromptDoc } from '@ai-video-editor/project-schema';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_PROMPT_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Hello world' }],
};

const BASE_ROW = {
  id: 'draft-uuid-001',
  user_id: 'user-uuid-001',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

// ── mapRowToDraft via findDraftById ──────────────────────────────────────────
// mapRowToDraft is private (unexported), so we exercise it indirectly through
// findDraftById which calls it on every row it receives.

describe('generationDraft.repository — mapRowToDraft JSON column handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses prompt_doc when mysql2 returns it as a JSON string', async () => {
    const row = { ...BASE_ROW, prompt_doc: JSON.stringify(VALID_PROMPT_DOC) };
    mockQuery.mockResolvedValueOnce([[row]]);

    const draft = await findDraftById('draft-uuid-001');

    expect(draft).not.toBeNull();
    expect(draft!.promptDoc).toEqual(VALID_PROMPT_DOC);
  });

  it('accepts prompt_doc when mysql2 returns it as an already-parsed object', async () => {
    // This is the real mysql2 behaviour for JSON columns — the driver returns
    // the parsed object directly, not a JSON string.
    const row = { ...BASE_ROW, prompt_doc: VALID_PROMPT_DOC };
    mockQuery.mockResolvedValueOnce([[row]]);

    const draft = await findDraftById('draft-uuid-001');

    expect(draft).not.toBeNull();
    expect(draft!.promptDoc).toEqual(VALID_PROMPT_DOC);
  });

  it('maps id and userId correctly regardless of prompt_doc format', async () => {
    const row = { ...BASE_ROW, prompt_doc: VALID_PROMPT_DOC };
    mockQuery.mockResolvedValueOnce([[row]]);

    const draft = await findDraftById('draft-uuid-001');

    expect(draft!.id).toBe('draft-uuid-001');
    expect(draft!.userId).toBe('user-uuid-001');
  });

  it('returns null when no row is found', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const draft = await findDraftById('nonexistent-draft');

    expect(draft).toBeNull();
  });

  it('preserves all blocks in prompt_doc when given as an object', async () => {
    const multiBlock: PromptDoc = {
      schemaVersion: 1,
      blocks: [
        { type: 'text', value: 'Start ' },
        { type: 'media-ref', mediaType: 'video', fileId: '00000000-0000-0000-0000-000000000001', label: 'Intro' },
        { type: 'text', value: ' End' },
      ],
    };
    const row = { ...BASE_ROW, prompt_doc: multiBlock };
    mockQuery.mockResolvedValueOnce([[row]]);

    const draft = await findDraftById('draft-uuid-001');

    expect(draft!.promptDoc.blocks).toHaveLength(3);
    expect(draft!.promptDoc.blocks[1]).toEqual({
      type: 'media-ref',
      mediaType: 'video',
      fileId: '00000000-0000-0000-0000-000000000001',
      label: 'Intro',
    });
  });
});

// ── findAssetPreviewsByIds ────────────────────────────────────────────────────

describe('generationDraft.repository — findAssetPreviewsByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] immediately without querying the DB when given an empty array', async () => {
    const result = await findAssetPreviewsByIds([]);

    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns one row per fileId that exists in files', async () => {
    const dbRows = [
      { file_id: 'file-001', mime_type: 'video/mp4' },
      { file_id: 'file-002', mime_type: 'image/jpeg' },
    ];
    mockQuery.mockResolvedValueOnce([dbRows]);

    const result = await findAssetPreviewsByIds(['file-001', 'file-002', 'file-missing']);

    // Only the two DB rows come back; missing file is silently absent.
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ fileId: 'file-001', contentType: 'video/mp4', thumbnailUri: null });
    expect(result[1]).toEqual({ fileId: 'file-002', contentType: 'image/jpeg', thumbnailUri: null });
  });

  it('maps mime_type to contentType correctly', async () => {
    mockQuery.mockResolvedValueOnce([[{ file_id: 'file-audio', mime_type: 'audio/mpeg' }]]);

    const result = await findAssetPreviewsByIds(['file-audio']);

    expect(result[0].contentType).toBe('audio/mpeg');
  });

  it('always returns thumbnailUri as null (files table has no thumbnail column)', async () => {
    mockQuery.mockResolvedValueOnce([[{ file_id: 'file-vid', mime_type: 'video/mp4' }]]);

    const result = await findAssetPreviewsByIds(['file-vid']);

    expect(result[0].thumbnailUri).toBeNull();
  });

  it('returns an empty array when none of the provided fileIds exist in files', async () => {
    mockQuery.mockResolvedValueOnce([[]]); // DB returns zero rows

    const result = await findAssetPreviewsByIds(['nonexistent-1', 'nonexistent-2']);

    expect(result).toEqual([]);
  });

  it('issues a single query with IN placeholders for the given fileIds', async () => {
    mockQuery.mockResolvedValueOnce([[{ file_id: 'file-001', mime_type: 'video/mp4' }]]);

    await findAssetPreviewsByIds(['file-001', 'file-002']);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('FROM files');
    expect(sql).not.toContain('project_assets_current');
    expect(params).toEqual(['file-001', 'file-002']);
  });
});
