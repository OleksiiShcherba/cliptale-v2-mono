import { buildStoryboardLayout, StoryboardLayoutError } from '@ai-video-editor/project-schema';

import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as storyboardHistoryRepository from '@/repositories/storyboardHistory.repository.js';
import * as storyboardMusicRepository from '@/repositories/storyboardMusic.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type {
  BlockInsert,
  EdgeInsert,
  StoryboardBlock,
} from '@/repositories/storyboard.repository.js';
import type { StoryboardMusicBlockInsert } from '@/repositories/storyboardMusic.repository.js';

import type { StoryboardState } from './storyboard.service.js';

const HISTORY_CAP = 50;

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

function findReusableSentinel(blocks: StoryboardBlock[], blockType: 'start' | 'end') {
  return blocks.find((block) => block.blockType === blockType);
}

function buildHistorySnapshot(
  blocks: BlockInsert[],
  edges: EdgeInsert[],
  musicBlocks: StoryboardMusicBlockInsert[],
) {
  return {
    blocks: blocks.map((block) => ({
      ...block,
      mediaItems: block.mediaItems ?? [],
    })),
    edges,
    musicBlocks,
  };
}

export async function applyLatestCompletedPlan(
  userId: string,
  draftId: string,
): Promise<StoryboardState> {
  await assertOwnership(userId, draftId);

  const job = await storyboardPlanJobRepository.findLatestCompletedByDraftId(draftId);
  if (!job?.plan) {
    throw new UnprocessableEntityError(
      `No completed storyboard plan exists for draft ${draftId}`,
    );
  }

  const existingBlocks = await storyboardRepository.findBlocksByDraftId(draftId);

  // Single source of truth for plan → layout (shared with the media-worker
  // pipeline so the two never drift). Map the layout-level error to the 422 this
  // endpoint has always returned.
  let blocks: BlockInsert[];
  let edges: EdgeInsert[];
  let musicBlocks: StoryboardMusicBlockInsert[];
  try {
    const layout = buildStoryboardLayout({
      draftId,
      plan: job.plan,
      newId: storyboardRepository.newId,
      existingStartId: findReusableSentinel(existingBlocks, 'start')?.id,
      existingEndId: findReusableSentinel(existingBlocks, 'end')?.id,
    });
    blocks = layout.blocks;
    edges = layout.edges;
    musicBlocks = layout.musicBlocks;
  } catch (err) {
    if (err instanceof StoryboardLayoutError) {
      throw new UnprocessableEntityError(err.message);
    }
    throw err;
  }

  const conn = await storyboardRepository.getConnection();
  try {
    await conn.beginTransaction();
    await storyboardRepository.replaceStoryboard(conn, draftId, blocks, edges, musicBlocks);
    await storyboardHistoryRepository.insertHistoryAndPruneInTx(
      conn,
      draftId,
      buildHistorySnapshot(blocks, edges, musicBlocks),
      HISTORY_CAP,
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [savedBlocks, savedEdges, savedMusicBlocks] = await Promise.all([
    storyboardRepository.findBlocksByDraftId(draftId),
    storyboardRepository.findEdgesByDraftId(draftId),
    storyboardMusicRepository.listMusicBlocksByDraftId(draftId),
  ]);

  return { blocks: savedBlocks, edges: savedEdges, musicBlocks: savedMusicBlocks };
}
