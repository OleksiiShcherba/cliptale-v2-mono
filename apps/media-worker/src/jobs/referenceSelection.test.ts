/**
 * referenceSelection.test.ts — Unit tests for the reference boundary / selection logic
 * (AC-08b, AC-09; ADR-0007, ADR-0008).
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

// ---------------------------------------------------------------------------
// Helpers
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

// ===========================================================================
// selectSceneReferences (AC-09, ADR-0008)
// ===========================================================================

describe('selectSceneReferences', () => {
  // AC-09: primary star of each linked block is always included first (one per block)
  it('includes the primary star of each linked block before any non-primary stars', () => {
    const blockA = makeBlock(BLOCK_A, [SCENE_X], [
      makeStar(FILE_1, true),  // primary
      makeStar(FILE_2, false), // non-primary
    ]);
    const blockB = makeBlock(BLOCK_B, [SCENE_X], [
      makeStar(FILE_3, true),  // primary
    ]);
    // unlinked block — must NEVER appear
    const blockC = makeBlock(BLOCK_C, [SCENE_Y], [
      makeStar(FILE_4, true),
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [blockA, blockB, blockC],
      modelCapacity: 4,
    });

    // Both primaries must come before any top-up
    expect(result).toContain(FILE_1);
    expect(result).toContain(FILE_3);
    // Unlinked block's file must never appear
    expect(result).not.toContain(FILE_4);
    // Primary of A must appear before FILE_2 (non-primary of A)
    const posFile1 = result.indexOf(FILE_1);
    const posFile2 = result.indexOf(FILE_2);
    expect(posFile1).toBeLessThan(posFile2);
  });

  // AC-09: images of unlinked blocks are NEVER in the result for scene X
  it('never includes starred images from blocks not linked to scene X', () => {
    const linkedBlock = makeBlock(BLOCK_A, [SCENE_X], [makeStar(FILE_1, true)]);
    const unlinkedBlock = makeBlock(BLOCK_B, [SCENE_Y], [makeStar(FILE_2, true)]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [linkedBlock, unlinkedBlock],
      modelCapacity: 10,
    });

    expect(result).toContain(FILE_1);
    expect(result).not.toContain(FILE_2);
  });

  // ADR-0008: top-up with additional stars once all primaries are placed, up to capacity
  it('tops up with non-primary stars after all primaries, up to model capacity', () => {
    const block = makeBlock(BLOCK_A, [SCENE_X], [
      makeStar(FILE_1, true),
      makeStar(FILE_2, false),
      makeStar(FILE_3, false),
    ]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [block],
      modelCapacity: 3,
    });

    // All three fit within capacity
    expect(result).toHaveLength(3);
    expect(result).toContain(FILE_1);
    expect(result).toContain(FILE_2);
    expect(result).toContain(FILE_3);
  });

  // ADR-0008: result is capped at model capacity
  it('caps the selection at model capacity', () => {
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
    });

    expect(result.length).toBeLessThanOrEqual(2);
    // Primary must be among selected
    expect(result).toContain(FILE_1);
  });

  // AC-09: scene with no linked blocks returns an empty candidate list
  it('returns no candidates for a scene with no linked blocks', () => {
    const unlinkedBlock = makeBlock(BLOCK_A, [SCENE_Y], [makeStar(FILE_1, true)]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [unlinkedBlock],
      modelCapacity: 10,
    });

    expect(result).toHaveLength(0);
  });

  // AC-09: when multiple blocks are linked, each contributes its primary first
  it('collects primary star from each linked block in link order before any top-up', () => {
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
    });

    // Primaries come before non-primaries in the result
    const posF1 = result.indexOf(FILE_1);
    const posF3 = result.indexOf(FILE_3);
    const posF2 = result.indexOf(FILE_2);
    const posF4 = result.indexOf(FILE_4);

    expect(posF1).toBeGreaterThanOrEqual(0);
    expect(posF3).toBeGreaterThanOrEqual(0);
    // Both primaries must appear before the non-primary top-up
    expect(Math.max(posF1, posF3)).toBeLessThan(Math.min(posF2, posF4));
  });

  // Edge: block linked to scene X but has NO stars — contributes nothing
  it('contributes nothing from a linked block that has no stars', () => {
    const emptyBlock = makeBlock(BLOCK_A, [SCENE_X], []);
    const filledBlock = makeBlock(BLOCK_B, [SCENE_X], [makeStar(FILE_1, true)]);

    const result = selectSceneReferences({
      sceneId: SCENE_X,
      allBlocks: [emptyBlock, filledBlock],
      modelCapacity: 5,
    });

    expect(result).toContain(FILE_1);
    expect(result).toHaveLength(1);
  });
});

// ===========================================================================
// checkScopedStarGate (AC-08b)
// ===========================================================================

describe('checkScopedStarGate', () => {
  // AC-08b: a draft with zero reference blocks passes the gate unconditionally
  it('passes when the draft has no reference blocks at all', () => {
    const result = checkScopedStarGate({ sceneId: SCENE_X, allBlocks: [] });
    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).toHaveLength(0);
  });

  // AC-08b: only blocks linked to scene X matter; unlinked unstarred blocks do NOT block X
  it('passes for scene X when unstarred blocks are only linked to other scenes', () => {
    const unlinkedUnstarred = makeBlock(BLOCK_B, [SCENE_Y], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [unlinkedUnstarred],
    });

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).not.toContain(BLOCK_B);
  });

  // AC-08b: a linked block with no star blocks scene X
  it('fails for scene X when a linked block has no starred result', () => {
    const linkedUnstarred = makeBlock(BLOCK_A, [SCENE_X], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [linkedUnstarred],
    });

    expect(result.passes).toBe(false);
    expect(result.blockingBlockIds).toContain(BLOCK_A);
  });

  // AC-08b: linked block WITH a star does not block
  it('passes for scene X when all blocks linked to X have at least one star', () => {
    const linkedStarred = makeBlock(BLOCK_A, [SCENE_X], [makeStar(FILE_1, true)]);
    const unlinkedUnstarred = makeBlock(BLOCK_B, [SCENE_Y], []);

    const result = checkScopedStarGate({
      sceneId: SCENE_X,
      allBlocks: [linkedStarred, unlinkedUnstarred],
    });

    expect(result.passes).toBe(true);
    expect(result.blockingBlockIds).toHaveLength(0);
  });

  // AC-08b: reports all blocking block IDs, not just the first
  it('reports all linked-but-unstarred block IDs when multiple blocks fail the gate', () => {
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
