/**
 * referenceSelection.test.ts — Unit tests for the reference boundary / selection logic.
 *
 * HISTORY
 * -------
 * Original tests (AC-08b / AC-09 / ADR-0007 / ADR-0008): star-based multi-candidate model.
 * Those tests were RETIRED by task T7 (scene-generation-reference-gate) and deleted
 * by task T12 (this cleanup).
 *
 * T7 tests (AC-05 / AC-06 / AC-06b): new single-output-per-block model.
 * ReferenceBlock gains `outputs: ReferenceOutput[]` and `primaryStarFileId?: string`;
 * the `stars` array and modelCapacity param are removed.
 * selectSceneReferences now returns string[] with exactly one fileId per linked block.
 * checkScopedStarGate now checks output-existence, not star-existence.
 *
 * T12 note (AC-04/AC-05/AC-06/AC-06b/AC-08):
 * The T7 suite below (selectSceneReferences + checkScopedStarGate) provides complete
 * unit-level coverage for the DoD requirements: reference boundary (AC-05), star-usable
 * (AC-06b), deleted-star-fallback (AC-06b), no-star latest+tie-break (AC-06), and
 * zero-reference path (AC-04 unit aspect). AC-08 (legacy principal never consumed) and
 * the integration-level boundary invariant (AC-05 §6 NFR) and deleted-star fallback
 * through the real repository are covered in the integration test (T12 describe blocks).
 *
 * Pure functions, no I/O.
 */

import { describe, it, expect } from 'vitest';

import {
  selectSceneReferences,
  buildDraftStyleDescription,
  checkScopedStarGate,
  type ReferenceBlock,
} from './referenceSelection.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BLOCK_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const SCENE_X = '11111111-1111-4111-8111-111111111111';
const SCENE_Y = '22222222-2222-4222-8222-222222222222';

const FILE_1 = 'f1111111-1111-4111-8111-111111111111';
const FILE_2 = 'f2222222-2222-4222-8222-222222222222';
const FILE_3 = 'f3333333-3333-4333-8333-333333333333';
const FILE_4 = 'f4444444-4444-4444-8444-444444444444';

// Timestamps for tie-break tests (AC-06)
const T_OLD  = new Date('2024-01-01T00:00:00.000Z');
const T_NEW  = new Date('2024-06-01T00:00:00.000Z');
const T_SAME = new Date('2024-03-15T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Helper — T7 model: outputs + optional primaryStarFileId.
// Cast through `unknown` so the test compiles today against the old type shape;
// the production code will update the type to match.
// ---------------------------------------------------------------------------

type ReferenceOutput = { fileId: string; createdAt: Date };

function makeBlockV2(
  id: string,
  linkedScenes: string[],
  outputs: ReferenceOutput[],
  primaryStarFileId?: string,
  windowStatus?: 'pending' | 'running' | 'done' | 'failed' | null,
): ReferenceBlock {
  return {
    id,
    linkedSceneIds: linkedScenes,
    outputs,
    primaryStarFileId,
    ...(windowStatus !== undefined ? { windowStatus } : {}),
  } as unknown as ReferenceBlock;
}

// ===========================================================================
// T7 — selectSceneReferences (AC-05 / AC-06 / AC-06b — output-based single selection)
//
// New model: ReferenceBlock has `outputs: ReferenceOutput[]` and optional
// `primaryStarFileId?: string`.  selectSceneReferences returns exactly one
// fileId per linked block (no modelCapacity).
//
// These tests are RED until the production code is updated by T7.
// ===========================================================================

describe('selectSceneReferences — T7 output-based single selection (AC-05/AC-06/AC-06b)', () => {
  // -------------------------------------------------------------------------
  // AC-06b: primary star points at a completed usable output → that output selected.
  // -------------------------------------------------------------------------
  it('AC-06b star-usable: selects the primary starred output when it is a completed usable output', () => {
    // BLOCK_A has two outputs; FILE_2 is the latest but FILE_1 is primary-starred.
    // Expectation: FILE_1 is selected (primary star honoured).
    const blockA = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [
        { fileId: FILE_1, createdAt: T_OLD },  // primary-starred output
        { fileId: FILE_2, createdAt: T_NEW },  // latest output (fallback if star absent/unusable)
      ],
      FILE_1, // primaryStarFileId
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA],
    } as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(FILE_1);
  });

  // -------------------------------------------------------------------------
  // AC-06b: primary star points at a deleted/non-usable output → fallback to latest completed.
  //         Result must NOT be empty and must NOT be the dead star.
  // -------------------------------------------------------------------------
  it('AC-06b star-deleted-fallback: falls back to latest completed when primary star is not in usable outputs', () => {
    // FILE_3 is primary-starred but NOT in the usable outputs list (deleted/removed).
    // Usable outputs: FILE_1 (older) and FILE_2 (newer).
    // Expectation: FILE_2 is selected (latest completed).
    const blockA = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [
        { fileId: FILE_1, createdAt: T_OLD },
        { fileId: FILE_2, createdAt: T_NEW },
      ],
      FILE_3, // primaryStarFileId — points at a deleted file not present in outputs
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA],
    } as never);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toBe(FILE_3); // dead star must never be returned
    expect(result[0]).toBe(FILE_2);     // latest completed fallback
  });

  // -------------------------------------------------------------------------
  // AC-06: no star → latest completed output selected (created_at DESC).
  // -------------------------------------------------------------------------
  it('AC-06 no-star: selects the latest completed output when no primary star is set', () => {
    const blockA = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [
        { fileId: FILE_1, createdAt: T_OLD },
        { fileId: FILE_2, createdAt: T_NEW },
      ],
      // no primaryStarFileId
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA],
    } as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(FILE_2); // newest created_at wins
  });

  // -------------------------------------------------------------------------
  // AC-06: tie-break by file_id DESC when two outputs share the same created_at.
  // FILE_3 > FILE_2 lexicographically (both start with 'f3...' vs 'f2...').
  // -------------------------------------------------------------------------
  it('AC-06 no-star tie-break: when two outputs share created_at, selects the lexicographically larger file_id', () => {
    // FILE_2 = 'f2222222-...' and FILE_3 = 'f3333333-...' — same timestamp.
    // file_id DESC tie-break: FILE_3 > FILE_2, so FILE_3 is selected.
    const blockA = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [
        { fileId: FILE_2, createdAt: T_SAME },
        { fileId: FILE_3, createdAt: T_SAME },
      ],
      // no primaryStarFileId
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA],
    } as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(FILE_3); // file_id DESC tie-break
  });

  // -------------------------------------------------------------------------
  // AC-05 / DoD: exactly ONE output per linked block (many outputs → one selected).
  // -------------------------------------------------------------------------
  it('AC-05 one-per-block: returns exactly one fileId per linked block regardless of how many outputs the block has', () => {
    // Two linked blocks, each with multiple outputs, no primary star.
    const blockA = makeBlockV2(BLOCK_A, [SCENE_X], [
      { fileId: FILE_1, createdAt: T_OLD },
      { fileId: FILE_2, createdAt: T_NEW },
    ]);
    const blockB = makeBlockV2(BLOCK_B, [SCENE_X], [
      { fileId: FILE_3, createdAt: T_OLD },
      { fileId: FILE_4, createdAt: T_NEW },
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA, blockB],
    } as never);

    // Exactly two results: one per linked block
    expect(result).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // AC-05 reference boundary: outputs of unlinked blocks are NEVER included.
  // -------------------------------------------------------------------------
  it('AC-05 reference boundary: never includes outputs from blocks not linked to the scene', () => {
    const linkedBlock = makeBlockV2(BLOCK_A, [SCENE_X], [
      { fileId: FILE_1, createdAt: T_NEW },
    ]);
    const unlinkedBlock = makeBlockV2(BLOCK_B, [SCENE_Y], [
      { fileId: FILE_2, createdAt: T_NEW },
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [linkedBlock, unlinkedBlock],
    } as never);

    expect(result).toContain(FILE_1);
    expect(result).not.toContain(FILE_2);
  });

  // -------------------------------------------------------------------------
  // Zero-block case: a scene with no linked blocks still yields an empty result.
  // -------------------------------------------------------------------------
  it('returns an empty array for a scene with no linked blocks', () => {
    const unlinkedBlock = makeBlockV2(BLOCK_A, [SCENE_Y], [
      { fileId: FILE_1, createdAt: T_NEW },
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [unlinkedBlock],
    } as never);

    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// T12 — Ready gate (AC-10 / AC-11): a linked block is a usable reference ONLY
// when its window_status is "Ready" (= 'done'). A link to a non-Ready block
// (failed / pending / running) contributes NO output → the scene falls back to
// text-only (AC-11). A NULL/undefined window_status (manual block) stays usable
// for backward compatibility (the curated outputs themselves represent readiness).
// ===========================================================================

describe('selectSceneReferences — T12 Ready gate (AC-10/AC-11)', () => {
  // AC-10: a Ready (window_status='done') linked block feeds its selected output.
  it('AC-10 ready feeds: a linked Ready block (window_status=done) contributes its selected output', () => {
    const readyBlock = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [{ fileId: FILE_1, createdAt: T_NEW }],
      undefined,
      'done',
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [readyBlock],
    } as never);

    expect(result).toEqual([FILE_1]);
  });

  // AC-11: a linked block that FAILED is treated as no reference → no output.
  it('AC-11 non-ready failed: a linked failed block contributes NO output (treated as no reference)', () => {
    const failedBlock = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [{ fileId: FILE_1, createdAt: T_NEW }], // stray output, but block is NOT Ready
      undefined,
      'failed',
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [failedBlock],
    } as never);

    expect(result).toHaveLength(0);
  });

  // AC-11: a linked block still pending/running is treated as no reference.
  it('AC-11 non-ready pending/running: linked pending or running blocks contribute NO output', () => {
    const pendingBlock = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [{ fileId: FILE_1, createdAt: T_NEW }],
      undefined,
      'pending',
    );
    const runningBlock = makeBlockV2(
      BLOCK_B,
      [SCENE_X],
      [{ fileId: FILE_2, createdAt: T_NEW }],
      undefined,
      'running',
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [pendingBlock, runningBlock],
    } as never);

    expect(result).toHaveLength(0);
  });

  // AC-11: mixed — only the Ready block feeds; the failed sibling contributes nothing.
  it('AC-11 mixed: only the Ready linked block feeds; a failed linked sibling is ignored', () => {
    const readyBlock = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [{ fileId: FILE_1, createdAt: T_NEW }],
      undefined,
      'done',
    );
    const failedBlock = makeBlockV2(
      BLOCK_B,
      [SCENE_X],
      [{ fileId: FILE_2, createdAt: T_NEW }],
      undefined,
      'failed',
    );

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [readyBlock, failedBlock],
    } as never);

    expect(result).toEqual([FILE_1]);
  });
});

// ===========================================================================
// T7 — checkScopedStarGate (output-existence gating, replaces star-existence)
//
// The "scoped gate rudiment" must pass when a linked block has ≥1 completed
// output, and fail when a linked block has NO completed output — regardless
// of whether any star is set.
//
// These tests are RED until the production code is updated by T7.
// ===========================================================================

describe('checkScopedStarGate — T7 output-existence gating (AC-03b / Reference-done gate)', () => {
  // -------------------------------------------------------------------------
  // A linked block WITH completed outputs but NO star must PASS.
  // (Old code would fail this block because stars.length === 0.)
  // -------------------------------------------------------------------------
  it('passes for scene X when a linked block has completed outputs but no primary star set', () => {
    const linkedWithOutputNoStar = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [{ fileId: FILE_1, createdAt: T_NEW }],
      // no primaryStarFileId — star-free
    );

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [linkedWithOutputNoStar],
    } as never);

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).not.toContain(BLOCK_A);
  });

  // -------------------------------------------------------------------------
  // A linked block with NO completed outputs must FAIL (output-existence check).
  // -------------------------------------------------------------------------
  it('fails for scene X when a linked block has no completed outputs', () => {
    const linkedNoOutputs = makeBlockV2(
      BLOCK_A,
      [SCENE_X],
      [], // no outputs at all
    );

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [linkedNoOutputs],
    } as never);

    expect(result.passes).toBe(false);
    expect(result.blockingBlockIds).toContain(BLOCK_A);
  });

  // -------------------------------------------------------------------------
  // Zero blocks linked to scene X → passes unconditionally (unchanged).
  // -------------------------------------------------------------------------
  it('passes unconditionally when no blocks are linked to the scene', () => {
    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [],
    } as never);

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Unlinked no-output block does NOT block scene X (scope is per-scene).
  // -------------------------------------------------------------------------
  it('passes for scene X when the no-output block is linked only to a different scene', () => {
    const unlinkedNoOutput = makeBlockV2(BLOCK_B, [SCENE_Y], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [unlinkedNoOutput],
    } as never);

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).not.toContain(BLOCK_B);
  });

  // -------------------------------------------------------------------------
  // Reports all linked-but-no-output block IDs (not just the first).
  // -------------------------------------------------------------------------
  it('reports all linked-but-no-output block IDs when multiple blocks have no outputs', () => {
    const blockA = makeBlockV2(BLOCK_A, [SCENE_X], []);
    const blockB = makeBlockV2(BLOCK_B, [SCENE_X], []);
    const blockC = makeBlockV2(BLOCK_C, [SCENE_X], [{ fileId: FILE_1, createdAt: T_NEW }]);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [blockA, blockB, blockC],
    } as never);

    expect(result.passes).toBe(false);
    expect(result.blockingBlockIds).toContain(BLOCK_A);
    expect(result.blockingBlockIds).toContain(BLOCK_B);
    expect(result.blockingBlockIds).not.toContain(BLOCK_C); // blockC has an output → not blocking
  });
});

// ===========================================================================
// buildDraftStyleDescription (AC-08b, AC-09, ADR-0007)
// ===========================================================================

describe('buildDraftStyleDescription', () => {
  // AC-09 / ADR-0007: style description is derived from starred results when any exist
  it('returns a non-empty derived description when starred file IDs are present', () => {
    const result = buildDraftStyleDescription({
      starredFileIds: [FILE_1, FILE_2],
      scriptFallback: 'A lone warrior travels through foggy mountains.',
    });

    // Must be a non-empty string; we assert on observable shape, not the exact text
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Must NOT be the raw script when starred results are present
    expect(result).not.toBe('A lone warrior travels through foggy mountains.');
  });

  // AC-08b / ADR-0007: fallback to script when no starred results exist
  it('returns the script text as fallback when no starred file IDs exist', () => {
    const result = buildDraftStyleDescription({
      starredFileIds: [],
      scriptFallback: 'A lone warrior travels through foggy mountains.',
    });

    expect(result).toBe('A lone warrior travels through foggy mountains.');
  });

  // AC-09 / ADR-0007: one style description is shared (same call = same result for same inputs)
  it('returns the same description for the same starred file IDs (deterministic within a run)', () => {
    const r1 = buildDraftStyleDescription({
      starredFileIds: [FILE_1],
      scriptFallback: 'script text',
    });
    const r2 = buildDraftStyleDescription({
      starredFileIds: [FILE_1],
      scriptFallback: 'script text',
    });

    expect(r1).toBe(r2);
  });
});
