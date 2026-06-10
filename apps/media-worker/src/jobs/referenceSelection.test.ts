/**
 * referenceSelection.test.ts — Unit tests for the reference boundary / selection logic.
 *
 * HISTORY
 * -------
 * Original tests (AC-08b / AC-09 / ADR-0007 / ADR-0008): star-based multi-candidate model.
 * Those tests are RETIRED by task T7 (scene-generation-reference-gate) — see the
 * "RETIRED (T7)" blocks below that have been converted to it.skip with an explanation.
 *
 * T7 tests (AC-05 / AC-06 / AC-06b): new single-output-per-block model.
 * ReferenceBlock gains `outputs: ReferenceOutput[]` and `primaryStarFileId?: string`;
 * the `stars` array and modelCapacity param are removed.
 * selectSceneReferences now returns string[] with exactly one fileId per linked block.
 * checkScopedStarGate now checks output-existence, not star-existence.
 *
 * Pure functions, no I/O.
 */

import { describe, it, expect } from 'vitest';

import {
  selectSceneReferences,
  buildDraftStyleDescription,
  checkScopedStarGate,
  type ReferenceBlock,
  type ReferenceStar,
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
const FILE_5 = 'f5555555-5555-4555-8555-555555555555';

// Timestamps for tie-break tests (AC-06)
const T_OLD  = new Date('2024-01-01T00:00:00.000Z');
const T_NEW  = new Date('2024-06-01T00:00:00.000Z');
const T_SAME = new Date('2024-03-15T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Helpers (legacy — used only by RETIRED tests below)
// ---------------------------------------------------------------------------

function makeBlock(
  id: string,
  linkedScenes: string[],
  stars: ReferenceStar[],
): ReferenceBlock {
  return { id, linkedSceneIds: linkedScenes, stars };
}

function makeStar(fileId: string, isPrimary: boolean): ReferenceStar {
  return { fileId, isPrimary };
}

// ---------------------------------------------------------------------------
// New helper — T7 model: outputs + optional primaryStarFileId.
// Cast through `unknown` so the test compiles today against the old type shape;
// the production code will update the type to match.
// ---------------------------------------------------------------------------

type ReferenceOutput = { fileId: string; createdAt: Date };

function makeBlockV2(
  id: string,
  linkedScenes: string[],
  outputs: ReferenceOutput[],
  primaryStarFileId?: string,
): ReferenceBlock {
  return { id, linkedSceneIds: linkedScenes, outputs, primaryStarFileId } as unknown as ReferenceBlock;
}

// ===========================================================================
// RETIRED (T7) — selectSceneReferences (old AC-09 / ADR-0008 star-based tests)
//
// These tests asserted multi-candidate star-based selection behaviour that T7
// replaces with single-output-per-block selection driven by output-existence.
// They are skipped rather than deleted so the retirement is explicit.
// ===========================================================================

describe('selectSceneReferences [RETIRED by T7 — old star-based multi-candidate model]', () => {
  // RETIRED: asserted that primaries appear before non-primary top-up stars.
  // Replaced by: T7 "AC-06b star-usable" — now selects exactly one output per block.
  it.skip('RETIRED — includes the primary star of each linked block before any non-primary stars', () => {
    const blockA = makeBlock(BLOCK_A, [SCENE_X], [
      makeStar(FILE_1, true),
      makeStar(FILE_2, false),
    ]);
    const blockB = makeBlock(BLOCK_B, [SCENE_X], [
      makeStar(FILE_3, true),
    ]);
    const blockC = makeBlock(BLOCK_C, [SCENE_Y], [
      makeStar(FILE_4, true),
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA, blockB, blockC],
      modelCapacity: 4,
    } as never);

    expect(result).toContain(FILE_1);
    expect(result).toContain(FILE_3);
    expect(result).not.toContain(FILE_4);
    const posFile1 = result.indexOf(FILE_1);
    const posFile2 = result.indexOf(FILE_2);
    expect(posFile1).toBeLessThan(posFile2);
  });

  // RETIRED: asserted reference boundary via starred files.
  // Replaced by: T7 "AC-05 reference boundary" — boundary is now output-based.
  it.skip('RETIRED — never includes starred images from blocks not linked to scene X', () => {
    const linkedBlock = makeBlock(BLOCK_A, [SCENE_X], [makeStar(FILE_1, true)]);
    const unlinkedBlock = makeBlock(BLOCK_B, [SCENE_Y], [makeStar(FILE_2, true)]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [linkedBlock, unlinkedBlock],
      modelCapacity: 10,
    } as never);

    expect(result).toContain(FILE_1);
    expect(result).not.toContain(FILE_2);
  });

  // RETIRED: asserted top-up with non-primary stars up to model capacity.
  // Replaced by: T7 model has no top-up — exactly one output per block, no modelCapacity.
  it.skip('RETIRED — tops up with non-primary stars after all primaries, up to model capacity', () => {
    const block = makeBlock(BLOCK_A, [SCENE_X], [
      makeStar(FILE_1, true),
      makeStar(FILE_2, false),
      makeStar(FILE_3, false),
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [block],
      modelCapacity: 3,
    } as never);

    expect(result).toHaveLength(3);
    expect(result).toContain(FILE_1);
    expect(result).toContain(FILE_2);
    expect(result).toContain(FILE_3);
  });

  // RETIRED: asserted capping at model capacity.
  // Replaced by: T7 model returns exactly one per block; modelCapacity param removed.
  it.skip('RETIRED — caps the selection at model capacity', () => {
    const block = makeBlock(BLOCK_A, [SCENE_X], [
      makeStar(FILE_1, true),
      makeStar(FILE_2, false),
      makeStar(FILE_3, false),
      makeStar(FILE_4, false),
      makeStar(FILE_5, false),
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [block],
      modelCapacity: 2,
    } as never);

    expect(result.length).toBeLessThanOrEqual(2);
    expect(result).toContain(FILE_1);
  });

  // RETIRED: asserted empty result for scene with no linked blocks.
  // Replaced by: T7 "exactly one output per linked block" — zero linked blocks still yields [].
  // The zero-block case is re-covered in the T7 suite below.
  it.skip('RETIRED — returns no candidates for a scene with no linked blocks', () => {
    const unlinkedBlock = makeBlock(BLOCK_A, [SCENE_Y], [makeStar(FILE_1, true)]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [unlinkedBlock],
      modelCapacity: 10,
    } as never);

    expect(result).toHaveLength(0);
  });

  // RETIRED: asserted all-primaries-before-top-up ordering across multiple blocks.
  // Replaced by: T7 — one output per block, ordering by selection rule not by primary-first.
  it.skip('RETIRED — collects primary star from each linked block in link order before any top-up', () => {
    const blockA = makeBlock(BLOCK_A, [SCENE_X], [
      makeStar(FILE_1, true),
      makeStar(FILE_2, false),
    ]);
    const blockB = makeBlock(BLOCK_B, [SCENE_X], [
      makeStar(FILE_3, true),
      makeStar(FILE_4, false),
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA, blockB],
      modelCapacity: 4,
    } as never);

    const posF1 = result.indexOf(FILE_1);
    const posF3 = result.indexOf(FILE_3);
    const posF2 = result.indexOf(FILE_2);
    const posF4 = result.indexOf(FILE_4);

    expect(posF1).toBeGreaterThanOrEqual(0);
    expect(posF3).toBeGreaterThanOrEqual(0);
    expect(Math.max(posF1, posF3)).toBeLessThan(Math.min(posF2, posF4));
  });

  // RETIRED: asserted that a linked block with no stars contributes nothing.
  // Replaced by: T7 gate checks output-existence; a no-output block does NOT reach
  // selectSceneReferences (it is blocked by checkScopedStarGate / reference-done gate upstream).
  it.skip('RETIRED — contributes nothing from a linked block that has no stars', () => {
    const emptyBlock = makeBlock(BLOCK_A, [SCENE_X], []);
    const filledBlock = makeBlock(BLOCK_B, [SCENE_X], [makeStar(FILE_1, true)]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [emptyBlock, filledBlock],
      modelCapacity: 5,
    } as never);

    expect(result).toContain(FILE_1);
    expect(result).toHaveLength(1);
  });
});

// ===========================================================================
// RETIRED (T7) — checkScopedStarGate (old AC-08b star-existence tests)
//
// These tested that the gate blocks on zero-star blocks.
// T7 replaces star-existence with output-existence as the gating predicate.
// ===========================================================================

describe('checkScopedStarGate [RETIRED by T7 — old star-existence gating]', () => {
  // RETIRED: passes with zero blocks — zero-block case unchanged but re-covered in T7 suite.
  it.skip('RETIRED — passes when the draft has no reference blocks at all', () => {
    const result = checkScopedStarGate({ sceneId: SCENE_X, allBlocks: [] });
    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).toHaveLength(0);
  });

  // RETIRED: passes when unstarred blocks are only linked to other scenes.
  // T7 replacement: passes when output-less blocks are only linked to other scenes.
  it.skip('RETIRED — passes for scene X when unstarred blocks are only linked to other scenes', () => {
    const unlinkedUnstarred = makeBlock(BLOCK_B, [SCENE_Y], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [unlinkedUnstarred],
    });

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).not.toContain(BLOCK_B);
  });

  // RETIRED: fails when a linked block has no star.
  // T7 replacement: fails when a linked block has no completed output.
  it.skip('RETIRED — fails for scene X when a linked block has no starred result', () => {
    const linkedUnstarred = makeBlock(BLOCK_A, [SCENE_X], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [linkedUnstarred],
    });

    expect(result.passes).toBe(false);
    expect(result.blockingBlockIds).toContain(BLOCK_A);
  });

  // RETIRED: passes when linked block has a star.
  // T7 replacement: passes when linked block has a completed output (star irrelevant to gate).
  it.skip('RETIRED — passes for scene X when all blocks linked to X have at least one star', () => {
    const linkedStarred = makeBlock(BLOCK_A, [SCENE_X], [makeStar(FILE_1, true)]);
    const unlinkedUnstarred = makeBlock(BLOCK_B, [SCENE_Y], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [linkedStarred, unlinkedUnstarred],
    });

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).toHaveLength(0);
  });

  // RETIRED: reports all linked-but-unstarred block IDs.
  // T7 replacement: reports all linked-but-no-output block IDs.
  it.skip('RETIRED — reports all linked-but-unstarred block IDs when multiple blocks fail the gate', () => {
    const blockA = makeBlock(BLOCK_A, [SCENE_X], []);
    const blockB = makeBlock(BLOCK_B, [SCENE_X], []);
    const blockC = makeBlock(BLOCK_C, [SCENE_X], [makeStar(FILE_1, false)]);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [blockA, blockB, blockC],
    });

    expect(result.passes).toBe(false);
    expect(result.blockingBlockIds).toContain(BLOCK_A);
    expect(result.blockingBlockIds).toContain(BLOCK_B);
    expect(result.blockingBlockIds).not.toContain(BLOCK_C);
  });
});

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
