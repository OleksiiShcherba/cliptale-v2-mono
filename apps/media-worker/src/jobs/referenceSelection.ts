/**
 * referenceSelection.ts — Pure reference-boundary + style-description logic
 * for the scene generation master (AC-05, AC-06, AC-06b; ADR-0002, ADR-0003).
 *
 * No I/O — all inputs are pre-loaded caller-side; this module is a set of
 * pure functions easily unit-tested.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A completed usable output for a reference block (flow_files row). */
export type ReferenceOutput = {
  fileId: string;
  /** created_at of the flow_files row — used for tie-break ordering. */
  createdAt: Date;
};

/** A reference block as consumed by the scene generation master. */
export type ReferenceBlock = {
  id: string;
  /** Scene IDs this block is linked to. */
  linkedSceneIds: string[];
  /** Completed usable outputs for this block (flow_files, deleted_at IS NULL). */
  outputs: ReferenceOutput[];
  /**
   * File ID of the primary-starred output, if one is set (storyboard_reference_stars
   * with is_primary = 1).  May point at a deleted file — callers must verify
   * usability against outputs before honouring it.
   */
  primaryStarFileId?: string;
  /**
   * Rolling-window readiness of the block (storyboard_reference_blocks.window_status):
   *   'done' = Ready (the only state that feeds scenes — AC-10).
   *   'failed' / 'pending' / 'running' = NOT Ready → treated as no reference (AC-11).
   *   null / undefined = manually-managed block: not gated (its curated outputs
   *     themselves represent readiness — backward-compatible).
   */
  windowStatus?: 'pending' | 'running' | 'done' | 'failed' | null;
};

/**
 * AC-10 / AC-11 readiness gate. A linked reference block feeds a scene ONLY when it
 * is "Ready". Ready = window_status 'done'. A non-Ready terminal/in-progress state
 * ('failed' / 'pending' / 'running') means the link is treated as no reference
 * (text-only fallback). A null/undefined window_status is a manually-managed block
 * and is NOT gated (its curated outputs already represent readiness).
 */
function isReferenceReady(block: ReferenceBlock): boolean {
  if (block.windowStatus === undefined || block.windowStatus === null) {
    return true; // manual block — ungated, backward-compatible
  }
  return block.windowStatus === 'done';
}

// ---------------------------------------------------------------------------
// selectSceneReferences (AC-05, AC-06, AC-06b; ADR-0003)
// ---------------------------------------------------------------------------

export type SelectSceneReferencesParams = {
  sceneId: string;
  allBlocks: ReferenceBlock[];
};

/**
 * Returns exactly one file ID per reference block linked to sceneId
 * (AC-05 reference boundary).
 *
 * Selection rule per block (ADR-0003):
 *   1. primaryStarFileId is set AND present in block.outputs → that file.
 *   2. Otherwise: latest completed output (createdAt DESC, fileId DESC tie-break).
 *
 * Blocks NOT linked to sceneId are NEVER included.
 */
export function selectSceneReferences(
  params: SelectSceneReferencesParams,
): string[] {
  const { sceneId, allBlocks } = params;

  const linkedBlocks = allBlocks.filter((b) =>
    b.linkedSceneIds.includes(sceneId),
  );

  return linkedBlocks.flatMap((block): string[] => {
    // AC-11: a link to a non-Ready block is treated as no reference (text-only).
    if (!isReferenceReady(block)) {
      return [];
    }
    if (block.outputs.length === 0) {
      return [];
    }

    // AC-06b: honour primary star when it is a usable (present) output
    if (
      block.primaryStarFileId !== undefined &&
      block.outputs.some((o) => o.fileId === block.primaryStarFileId)
    ) {
      return [block.primaryStarFileId];
    }

    // AC-06: latest completed output (createdAt DESC, fileId DESC tie-break)
    const sorted = [...block.outputs].sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.fileId > a.fileId ? 1 : b.fileId < a.fileId ? -1 : 0;
    });

    return [sorted[0]!.fileId];
  });
}

// ---------------------------------------------------------------------------
// checkScopedStarGate (AC-03b — output-existence gate)
// ---------------------------------------------------------------------------

export type ScopedStarGateParams = {
  sceneId: string;
  allBlocks: ReferenceBlock[];
};

export type ScopedStarGateResult = {
  /** true = scene X may be generated. */
  passes: boolean;
  /** IDs of blocks linked to sceneId that have no completed output. */
  blockingBlockIds: string[];
};

/**
 * Scoped reference-done gate for a single scene (AC-03b):
 *   - No blocks linked to sceneId → passes unconditionally (zero-block case).
 *   - Otherwise fails if any block LINKED to sceneId has zero completed outputs;
 *     blocks NOT linked to sceneId are irrelevant.
 */
export function checkScopedStarGate(
  params: ScopedStarGateParams,
): ScopedStarGateResult {
  const { sceneId, allBlocks } = params;

  const linkedBlocks = allBlocks.filter((b) =>
    b.linkedSceneIds.includes(sceneId),
  );

  if (linkedBlocks.length === 0) {
    return { passes: true, blockingBlockIds: [] };
  }

  const blockingBlockIds = linkedBlocks
    .filter((b) => b.outputs.length === 0)
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
  const fileList = starredFileIds.join(', ');
  return `Visual style derived from curated reference images [${fileList}].`;
}
