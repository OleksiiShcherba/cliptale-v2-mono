import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as storyboardMusicRepository from '@/repositories/storyboardMusic.repository.js';
import type {
  StoryboardBlock,
  StoryboardEdge,
  StoryboardHistoryEntry,
  BlockInsert,
  EdgeInsert,
} from '@/repositories/storyboard.repository.js';
import type { StoryboardMusicBlock, StoryboardMusicBlockInsert } from '@/repositories/storyboardMusic.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import { ForbiddenError, NotFoundError } from '@/lib/errors.js';
import { validateMusicBlockRanges } from '@/services/storyboardMusicRange.service.js';
import { assertReadyAudioFile } from '@/services/storyboardMusic.service.js';

/** Maximum history entries retained per draft (both in-memory and DB). */
const HISTORY_CAP = 50;

/** Canvas coordinates for the seeded START sentinel block. */
const START_POSITION = { x: 50, y: 300 };

/** Canvas coordinates for the seeded END sentinel block. */
const END_POSITION = { x: 900, y: 300 };

/** The full storyboard state returned by load/save/initialize endpoints. */
export type StoryboardState = {
  blocks: StoryboardBlock[];
  edges: StoryboardEdge[];
  musicBlocks: StoryboardMusicBlock[];
};

export { applyLatestCompletedPlan } from './storyboardPlanApply.service.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the generation draft and enforces ownership.
 *
 * Returns the full draft row so callers can read fields (e.g. status) without
 * issuing a second DB round-trip.
 *
 * - Row missing → NotFoundError (404)
 * - Row exists but belongs to a different user → ForbiddenError (403)
 */
async function assertOwnership(userId: string, draftId: string): Promise<GenerationDraft> {
  const draft = await generationDraftRepository.findDraftById(draftId);
  if (!draft) {
    throw new NotFoundError(`Storyboard draft ${draftId} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own storyboard draft ${draftId}`);
  }
  return draft;
}

function normalizeMusicBlocksForDraft(
  draftId: string,
  musicBlocks: StoryboardMusicBlockInsert[],
): StoryboardMusicBlockInsert[] {
  return musicBlocks.map((block) => ({ ...block, draftId }));
}

async function validateExistingMusicFiles(
  userId: string,
  musicBlocks: StoryboardMusicBlockInsert[],
): Promise<void> {
  for (const musicBlock of musicBlocks) {
    if (musicBlock.sourceMode === 'existing') {
      await assertReadyAudioFile(userId, musicBlock.existingFileId);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** InnoDB error code for deadlock — retrying is the standard resolution. */
const ER_LOCK_DEADLOCK = 1213;

/**
 * Atomically seeds START and END sentinel blocks for a draft if they do not
 * yet exist. Uses a transactional `SELECT COUNT(*) ... FOR UPDATE` to prevent
 * duplicate inserts when the load endpoint is called concurrently (e.g. React
 * 18 Strict Mode double-mount).
 *
 * When two concurrent transactions both see count = 0 they can deadlock on the
 * INSERT phase (both hold gap locks, then try to insert into each other's gap).
 * InnoDB automatically resolves the deadlock by rolling back one transaction;
 * we retry that transaction once, at which point the count will be > 0 and the
 * sentinel insert is skipped.
 */
async function insertSentinelsAtomically(draftId: string): Promise<void> {
  // Retry once on deadlock — InnoDB resolves deadlocks by aborting one tx.
  for (let attempt = 0; attempt < 2; attempt++) {
    const conn = await storyboardRepository.getConnection();
    try {
      await conn.beginTransaction();

      // Lock the sentinel rows (or the gap if they don't exist yet) to prevent
      // concurrent inserts from racing past the count = 0 check.
      const existingCount = await storyboardRepository.countSentinelBlocksForUpdate(conn, draftId);

      if (existingCount === 0) {
        const startBlock: BlockInsert = {
          id: storyboardRepository.newId(),
          draftId,
          blockType: 'start',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: START_POSITION.x,
          positionY: START_POSITION.y,
          sortOrder: 0,
          style: null,
        };
        const endBlock: BlockInsert = {
          id: storyboardRepository.newId(),
          draftId,
          blockType: 'end',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: END_POSITION.x,
          positionY: END_POSITION.y,
          sortOrder: 9999,
          style: null,
        };
        await storyboardRepository.insertSentinelsInTx(conn, startBlock, endBlock);
      }

      await conn.commit();
      return; // Success — stop retrying.
    } catch (err) {
      await conn.rollback();
      const isDeadlock =
        typeof err === 'object' &&
        err !== null &&
        'errno' in err &&
        (err as { errno: number }).errno === ER_LOCK_DEADLOCK;
      if (isDeadlock && attempt === 0) {
        // InnoDB rolled back this transaction; retry once — by the second attempt
        // the winning transaction will have committed its sentinels.
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

/**
 * Loads the full storyboard state for a draft.
 * Atomically seeds START/END sentinels on first load (idempotent).
 * Advances the draft status from `'draft'` to `'step2'` on first load (idempotent).
 * Throws 404 if the draft does not exist, 403 if it belongs to another user.
 */
export async function loadStoryboard(
  userId: string,
  draftId: string,
): Promise<StoryboardState> {
  const draft = await assertOwnership(userId, draftId);

  // Advance status from 'draft' → 'step2' on first storyboard page load.
  // Already-advanced statuses ('step2', 'step3', 'completed') are left untouched (idempotent).
  if (draft.status === 'draft') {
    await generationDraftRepository.updateDraftStatus(draftId, 'step2');
  }

  // Seed sentinels atomically on every load — no-op if they already exist.
  await insertSentinelsAtomically(draftId);

  const [blocks, edges, musicBlocks] = await Promise.all([
    storyboardRepository.findBlocksByDraftId(draftId),
    storyboardRepository.findEdgesByDraftId(draftId),
    storyboardMusicRepository.listMusicBlocksByDraftId(draftId),
  ]);

  return { blocks, edges, musicBlocks };
}

/**
 * Full-replaces the storyboard state for a draft inside a single DB transaction.
 * Deletes all existing blocks (cascades to edges + media) and re-inserts the
 * provided arrays.
 *
 * The destructive DELETE is intentional: the full-replace PUT semantics match
 * the client autosave model where the whole graph is resent on every save.
 * Wrapping in a transaction guarantees the storyboard is never left in a
 * partially-replaced state if the insert phase fails.
 *
 * Risk note: if the transaction rolls back, the storyboard retains its prior
 * state (the DELETE has not committed). Test this rollback path in integration
 * tests — see storyboard.integration.test.ts.
 */
export async function saveStoryboard(
  userId: string,
  draftId: string,
  blocks: BlockInsert[],
  edges: EdgeInsert[],
  musicBlocks?: StoryboardMusicBlockInsert[],
): Promise<StoryboardState> {
  await assertOwnership(userId, draftId);

  const conn = await storyboardRepository.getConnection();
  try {
    await conn.beginTransaction();
    const blocksToSave = normalizeMusicBlocksForDraft(
      draftId,
      musicBlocks ?? await storyboardMusicRepository.findMusicBlocksByDraftIdForUpdate(conn, draftId),
    );
    validateMusicBlockRanges(draftId, blocks, edges, blocksToSave);
    await validateExistingMusicFiles(userId, blocksToSave);
    await storyboardRepository.replaceStoryboard(conn, draftId, blocks, edges, blocksToSave);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Re-load the persisted state to return the authoritative saved snapshot.
  const [savedBlocks, savedEdges, savedMusicBlocks] = await Promise.all([
    storyboardRepository.findBlocksByDraftId(draftId),
    storyboardRepository.findEdgesByDraftId(draftId),
    storyboardMusicRepository.listMusicBlocksByDraftId(draftId),
  ]);

  return { blocks: savedBlocks, edges: savedEdges, musicBlocks: savedMusicBlocks };
}

/**
 * Idempotent initializer: if START and END sentinel blocks already exist,
 * returns the current state unchanged. Otherwise inserts them and returns the
 * updated state.
 *
 * The two sentinel blocks are always inserted together; partial state (one
 * without the other) is not possible because we only insert when both counts
 * are zero.
 */
export async function initializeStoryboard(
  userId: string,
  draftId: string,
): Promise<StoryboardState> {
  await assertOwnership(userId, draftId);

  const [startCount, endCount] = await Promise.all([
    storyboardRepository.countBlocksByType(draftId, 'start'),
    storyboardRepository.countBlocksByType(draftId, 'end'),
  ]);

  // Idempotency: only seed if neither sentinel exists.
  if (startCount === 0 && endCount === 0) {
    const startBlock: BlockInsert = {
      id: storyboardRepository.newId(),
      draftId,
      blockType: 'start',
      name: null,
      prompt: null,
      videoPrompt: null,
      durationS: 5,
      positionX: START_POSITION.x,
      positionY: START_POSITION.y,
      sortOrder: 0,
      style: null,
    };

    const endBlock: BlockInsert = {
      id: storyboardRepository.newId(),
      draftId,
      blockType: 'end',
      name: null,
      prompt: null,
      videoPrompt: null,
      durationS: 5,
      positionX: END_POSITION.x,
      positionY: END_POSITION.y,
      sortOrder: 9999,
      style: null,
    };

    await storyboardRepository.insertBlock(startBlock);
    await storyboardRepository.insertBlock(endBlock);
  }

  const [blocks, edges, musicBlocks] = await Promise.all([
    storyboardRepository.findBlocksByDraftId(draftId),
    storyboardRepository.findEdgesByDraftId(draftId),
    storyboardMusicRepository.listMusicBlocksByDraftId(draftId),
  ]);

  return { blocks, edges, musicBlocks };
}

/**
 * Pushes a checkpoint history snapshot for a draft and prunes the DB beyond
 * HISTORY_CAP rows (the cap is origin-agnostic — legacy rows age out with it).
 * The row is stamped origin='checkpoint' by the repository (ADR-0003).
 * Returns the id assigned to the inserted snapshot row.
 */
export async function pushHistory(
  userId: string,
  draftId: string,
  snapshot: unknown,
  previewKind: 'screenshot' | 'minimap',
): Promise<number> {
  await assertOwnership(userId, draftId);
  return storyboardRepository.insertHistoryAndPrune(draftId, snapshot, HISTORY_CAP, previewKind);
}

/**
 * Returns the last HISTORY_CAP history snapshots for a draft, newest first.
 */
export async function listHistory(
  userId: string,
  draftId: string,
): Promise<StoryboardHistoryEntry[]> {
  await assertOwnership(userId, draftId);
  return storyboardRepository.findHistoryByDraftId(draftId, HISTORY_CAP);
}
