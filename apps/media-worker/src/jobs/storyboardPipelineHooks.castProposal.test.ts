/**
 * Unit tests for the exported cast-proposal helpers in storyboardPipelineHooks.ts.
 *
 * Covers subtask 1 of the "durable reference→scene link creation" task:
 *   - readLatestCastProposal — DB read with mocked pool.execute
 *   - parseProposalCastEntries — pure parse; no I/O
 *
 * ACs verified:
 *   - Normal proposal → typed WorkerProposalCastEntry list
 *   - No completed proposal in DB → null (readLatestCastProposal) / [] (parse)
 *   - cast field absent or non-array → []
 *   - Null / non-object array elements are skipped
 *   - castType defaults to 'character'; 'environment' only when type==='environment'
 *   - name trimmed; blank/missing name → 'Untitled'
 *   - scene_block_ids non-string elements are dropped
 *
 * Run from apps/media-worker:
 *   npx vitest run src/jobs/storyboardPipelineHooks.castProposal.test.ts
 *
 * All I/O is mocked — no real MySQL needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'mysql2/promise';

// storyboardPipelineHooks.ts imports @/lib/realtime.js at module level; mock it
// so importing the module under test does not require a real Redis connection.
vi.mock('@/lib/realtime.js', () => ({
  publishPipelineState: vi.fn().mockResolvedValue(undefined),
}));

import {
  readLatestCastProposal,
  parseProposalCastEntries,
} from './storyboardPipelineHooks.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DRAFT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// ── Pool factory ──────────────────────────────────────────────────────────────

/**
 * Build a minimal mock Pool whose execute() returns the provided rows
 * (RowDataPacket-style) as the first element of a two-element tuple.
 */
function makePool(rows: object[]): Pool {
  return {
    execute: vi.fn().mockResolvedValue([rows, []]),
  } as unknown as Pool;
}

// ── readLatestCastProposal ────────────────────────────────────────────────────

describe('readLatestCastProposal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no completed proposal row exists', async () => {
    const pool = makePool([]);
    const result = await readLatestCastProposal(pool, DRAFT_ID);
    expect(result).toBeNull();
  });

  it('queries the correct table, status, and ordering', async () => {
    const pool = makePool([]);
    await readLatestCastProposal(pool, DRAFT_ID);
    const [sql, params] = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('storyboard_cast_extraction_jobs');
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('completed_at DESC');
    expect(sql).toContain('LIMIT 1');
    expect(params).toContain(DRAFT_ID);
  });

  it('returns proposalJson and castSize when a string proposal_json is stored', async () => {
    const proposalData = {
      cast: [
        { type: 'character', name: 'Alice', scene_block_ids: ['s1', 's2'] },
        { type: 'environment', name: 'Forest', scene_block_ids: ['s3'] },
      ],
    };
    const pool = makePool([{ proposal_json: JSON.stringify(proposalData) }]);
    const result = await readLatestCastProposal(pool, DRAFT_ID);
    expect(result).not.toBeNull();
    expect(result!.castSize).toBe(2);
    expect(result!.proposalJson).toEqual(proposalData);
  });

  it('returns proposalJson and castSize when proposal_json is already an object (MySQL json column)', async () => {
    const proposalData = {
      cast: [{ type: 'character', name: 'Bob', scene_block_ids: [] }],
    };
    const pool = makePool([{ proposal_json: proposalData }]);
    const result = await readLatestCastProposal(pool, DRAFT_ID);
    expect(result).not.toBeNull();
    expect(result!.castSize).toBe(1);
    expect(result!.proposalJson).toEqual(proposalData);
  });

  it('returns castSize 0 when cast field is absent', async () => {
    const pool = makePool([{ proposal_json: JSON.stringify({ other: 'data' }) }]);
    const result = await readLatestCastProposal(pool, DRAFT_ID);
    expect(result).not.toBeNull();
    expect(result!.castSize).toBe(0);
  });

  it('returns castSize 0 when cast field is not an array', async () => {
    const pool = makePool([{ proposal_json: JSON.stringify({ cast: 'invalid' }) }]);
    const result = await readLatestCastProposal(pool, DRAFT_ID);
    expect(result!.castSize).toBe(0);
  });

  it('returns null when proposal_json is malformed JSON string', async () => {
    // safeParseJson returns null on bad JSON, so proposalJson is null and castSize = 0
    // but the row still exists — result is non-null with castSize 0
    const pool = makePool([{ proposal_json: 'not-valid-json{' }]);
    const result = await readLatestCastProposal(pool, DRAFT_ID);
    expect(result).not.toBeNull();
    expect(result!.castSize).toBe(0);
    expect(result!.proposalJson).toBeNull();
  });
});

// ── parseProposalCastEntries ──────────────────────────────────────────────────

describe('parseProposalCastEntries', () => {
  it('returns [] for null input', () => {
    expect(parseProposalCastEntries(null)).toEqual([]);
  });

  it('returns [] for non-object input (string)', () => {
    expect(parseProposalCastEntries('bad')).toEqual([]);
  });

  it('returns [] for non-object input (number)', () => {
    expect(parseProposalCastEntries(42)).toEqual([]);
  });

  it('returns [] when cast field is absent', () => {
    expect(parseProposalCastEntries({ other: 'value' })).toEqual([]);
  });

  it('returns [] when cast is not an array (string value)', () => {
    expect(parseProposalCastEntries({ cast: 'not-an-array' })).toEqual([]);
  });

  it('returns [] when cast is not an array (object value)', () => {
    expect(parseProposalCastEntries({ cast: { type: 'character' } })).toEqual([]);
  });

  it('returns [] when cast is an empty array', () => {
    expect(parseProposalCastEntries({ cast: [] })).toEqual([]);
  });

  it('skips null elements in cast array', () => {
    const result = parseProposalCastEntries({ cast: [null] });
    expect(result).toEqual([]);
  });

  it('skips primitive (non-object) elements in cast array', () => {
    const result = parseProposalCastEntries({ cast: [42, 'string', true] });
    expect(result).toEqual([]);
  });

  it('parses a character entry correctly', () => {
    const proposal = {
      cast: [{ type: 'character', name: 'Alice', scene_block_ids: ['s1', 's2'] }],
    };
    const entries = parseProposalCastEntries(proposal);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      castType: 'character',
      name: 'Alice',
      sceneBlockIds: ['s1', 's2'],
    });
  });

  it('parses an environment entry correctly', () => {
    const proposal = {
      cast: [{ type: 'environment', name: 'Forest Floor', scene_block_ids: ['s3'] }],
    };
    const entries = parseProposalCastEntries(proposal);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      castType: 'environment',
      name: 'Forest Floor',
      sceneBlockIds: ['s3'],
    });
  });

  it('defaults castType to "character" when type is missing', () => {
    const proposal = {
      cast: [{ name: 'Bob', scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.castType).toBe('character');
  });

  it('defaults castType to "character" for an unrecognised type value', () => {
    const proposal = {
      cast: [{ type: 'prop', name: 'Sword', scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.castType).toBe('character');
  });

  it('trims whitespace from the name', () => {
    const proposal = {
      cast: [{ type: 'character', name: '  Alice  ', scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.name).toBe('Alice');
  });

  it('substitutes "Untitled" when name is an empty string', () => {
    const proposal = {
      cast: [{ type: 'character', name: '', scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.name).toBe('Untitled');
  });

  it('substitutes "Untitled" when name is whitespace-only', () => {
    const proposal = {
      cast: [{ type: 'character', name: '   ', scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.name).toBe('Untitled');
  });

  it('substitutes "Untitled" when name is missing', () => {
    const proposal = {
      cast: [{ type: 'character', scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.name).toBe('Untitled');
  });

  it('substitutes "Untitled" when name is a non-string value', () => {
    const proposal = {
      cast: [{ type: 'character', name: 123, scene_block_ids: [] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.name).toBe('Untitled');
  });

  it('filters non-string values from scene_block_ids', () => {
    const proposal = {
      cast: [{ type: 'character', name: 'Alice', scene_block_ids: ['s1', 42, null, 's2', true] }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.sceneBlockIds).toEqual(['s1', 's2']);
  });

  it('returns empty sceneBlockIds when scene_block_ids is absent', () => {
    const proposal = {
      cast: [{ type: 'character', name: 'Alice' }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.sceneBlockIds).toEqual([]);
  });

  it('returns empty sceneBlockIds when scene_block_ids is not an array', () => {
    const proposal = {
      cast: [{ type: 'character', name: 'Alice', scene_block_ids: 'not-array' }],
    };
    const [entry] = parseProposalCastEntries(proposal);
    expect(entry!.sceneBlockIds).toEqual([]);
  });

  it('parses multiple entries in order', () => {
    const proposal = {
      cast: [
        { type: 'character', name: 'Alice', scene_block_ids: ['s1'] },
        { type: 'environment', name: 'Forest', scene_block_ids: ['s2', 's3'] },
        { type: 'character', name: 'Bob', scene_block_ids: [] },
      ],
    };
    const entries = parseProposalCastEntries(proposal);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.name).toBe('Alice');
    expect(entries[1]!.castType).toBe('environment');
    expect(entries[2]!.name).toBe('Bob');
  });

  it('skips null elements interleaved with valid entries', () => {
    const proposal = {
      cast: [
        { type: 'character', name: 'Alice', scene_block_ids: ['s1'] },
        null,
        { type: 'environment', name: 'Desert', scene_block_ids: ['s2'] },
      ],
    };
    const entries = parseProposalCastEntries(proposal);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.name).toBe('Alice');
    expect(entries[1]!.name).toBe('Desert');
  });
});
