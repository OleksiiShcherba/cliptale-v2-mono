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

import { findDraftById } from './generationDraft.repository.js';
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
