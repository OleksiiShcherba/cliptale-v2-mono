/**
 * referenceSelection.ts — Pure reference-boundary + style-description logic
 * for the scene generation master (AC-08b, AC-09; ADR-0007, ADR-0008).
 *
 * No I/O — all inputs are pre-loaded caller-side; this module is a set of
 * pure functions easily unit-tested.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A starred result for a reference block. */
export type ReferenceStar = {
  fileId: string;
  /** true = primary star (block preview / first-priority candidate). */
  isPrimary: boolean;
};

/** A reference block as consumed by the scene generation master. */
export type ReferenceBlock = {
  id: string;
  /** Scene IDs this block is linked to. */
  linkedSceneIds: string[];
  stars: ReferenceStar[];
};

// ---------------------------------------------------------------------------
// selectSceneReferences (AC-09, ADR-0008)
// ---------------------------------------------------------------------------

export type SelectSceneReferencesParams = {
  sceneId: string;
  allBlocks: ReferenceBlock[];
  modelCapacity: number;
};

/**
 * Returns the ordered list of file IDs to use as reference candidates for
 * scene X, respecting the reference boundary (AC-09) and ADR-0008 selection rule:
 *   1. Primary star of each linked block (one per block, in block order).
 *   2. Top-up with additional starred files from linked blocks, in order, until
 *      `modelCapacity` is reached.
 *
 * Files from blocks NOT linked to sceneId are NEVER included.
 */
export function selectSceneReferences(
  params: SelectSceneReferencesParams,
): string[] {
  const { sceneId, allBlocks, modelCapacity } = params;

  // Filter to blocks linked to this scene
  const linkedBlocks = allBlocks.filter((b) =>
    b.linkedSceneIds.includes(sceneId),
  );

  const result: string[] = [];

  // Phase 1: collect primary star from each linked block (in block order)
  const primaryFileIds = new Set<string>();
  for (const block of linkedBlocks) {
    const primary = block.stars.find((s) => s.isPrimary);
    if (primary && result.length < modelCapacity) {
      result.push(primary.fileId);
      primaryFileIds.add(primary.fileId);
    }
  }

  // Phase 2: top-up with non-primary stars from linked blocks, in block/star order
  for (const block of linkedBlocks) {
    for (const star of block.stars) {
      if (result.length >= modelCapacity) break;
      if (!primaryFileIds.has(star.fileId) && !result.includes(star.fileId)) {
        result.push(star.fileId);
      }
    }
    if (result.length >= modelCapacity) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// checkScopedStarGate (AC-08b)
// ---------------------------------------------------------------------------

export type ScopedStarGateParams = {
  sceneId: string;
  allBlocks: ReferenceBlock[];
};

export type ScopedStarGateResult = {
  /** true = scene X may be generated. */
  passes: boolean;
  /** IDs of blocks linked to sceneId that have no starred result. */
  blockingBlockIds: string[];
};

/**
 * Scoped star gate for a single scene regeneration (AC-08b):
 *   - No blocks linked to sceneId → passes unconditionally (zero-block case).
 *   - Otherwise fails if any block LINKED to sceneId has zero starred results;
 *     blocks NOT linked to sceneId are irrelevant.
 */
export function checkScopedStarGate(
  params: ScopedStarGateParams,
): ScopedStarGateResult {
  const { sceneId, allBlocks } = params;

  const linkedBlocks = allBlocks.filter((b) =>
    b.linkedSceneIds.includes(sceneId),
  );

  // Zero-block case: passes unconditionally
  if (linkedBlocks.length === 0) {
    return { passes: true, blockingBlockIds: [] };
  }

  const blockingBlockIds = linkedBlocks
    .filter((b) => b.stars.length === 0)
    .map((b) => b.id);

  return {
    passes: blockingBlockIds.length === 0,
    blockingBlockIds,
  };
}

// ---------------------------------------------------------------------------
// buildDraftStyleDescription (AC-08b, AC-09, ADR-0007)
// ---------------------------------------------------------------------------

export type BuildDraftStyleDescriptionParams = {
  /** All starred file IDs across the draft at generation time. */
  starredFileIds: string[];
  /** Script text used as fallback when no starred results exist. */
  scriptFallback: string;
};

/**
 * Returns one draft-global derived style description for scenes with no linked
 * blocks (AC-09, ADR-0007):
 *   - When `starredFileIds` is non-empty: derives a style description from those
 *     files (deterministic descriptor referencing the curated image set).
 *   - When `starredFileIds` is empty: returns `scriptFallback` verbatim (AC-08b).
 *
 * Callers cache the result per draft-generation run (one description per draft,
 * not per scene — ADR-0007 §Consequences).
 */
export function buildDraftStyleDescription(
  params: BuildDraftStyleDescriptionParams,
): string {
  const { starredFileIds, scriptFallback } = params;

  if (starredFileIds.length === 0) {
    return scriptFallback;
  }

  // Deterministic derived style description from the curated starred image set.
  // The description references the file IDs so callers can identify the source
  // images. In production the worker passes these IDs to the LLM for analysis;
  // this pure function produces the deterministic prompt/descriptor portion.
  const fileList = starredFileIds.join(', ');
  return `Visual style derived from curated reference images [${fileList}].`;
}
