import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as storyboardHistoryRepository from '@/repositories/storyboardHistory.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type {
  BlockInsert,
  EdgeInsert,
  StoryboardBlock,
} from '@/repositories/storyboard.repository.js';
import type { StoryboardState } from './storyboard.service.js';

const HISTORY_CAP = 50;
const BASELINE_Y = 300;
const START_X = 50;
const FIRST_SCENE_X = 300;
const NODE_GAP_X = 250;

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

function buildSentinel(
  draftId: string,
  existing: StoryboardBlock | undefined,
  blockType: 'start' | 'end',
  positionX: number,
  sortOrder: number,
): BlockInsert {
  return {
    id: existing?.id ?? storyboardRepository.newId(),
    draftId,
    blockType,
    name: null,
    prompt: null,
    durationS: 5,
    positionX,
    positionY: BASELINE_Y,
    sortOrder,
    style: null,
  };
}

function buildHistorySnapshot(blocks: BlockInsert[], edges: EdgeInsert[]) {
  return {
    blocks: blocks.map((block) => ({
      ...block,
      mediaItems: block.mediaItems ?? [],
    })),
    edges,
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
  const start = buildSentinel(
    draftId,
    findReusableSentinel(existingBlocks, 'start'),
    'start',
    START_X,
    0,
  );

  const sceneBlocks = job.plan.scenes.map((scene, index): BlockInsert => {
    const blockId = storyboardRepository.newId();
    return {
      id: blockId,
      draftId,
      blockType: 'scene',
      name: `Scene ${String(scene.sceneNumber).padStart(2, '0')}`,
      prompt: scene.visualPrompt,
      durationS: Math.max(1, Math.round(scene.durationSeconds)),
      positionX: FIRST_SCENE_X + index * NODE_GAP_X,
      positionY: BASELINE_Y,
      sortOrder: scene.sceneNumber,
      style: scene.style,
      mediaItems: scene.referencedMedia.map((media, mediaIndex) => ({
        id: storyboardRepository.newId(),
        fileId: media.fileId,
        mediaType: media.mediaType,
        sortOrder: mediaIndex,
      })),
    };
  });

  const end = buildSentinel(
    draftId,
    findReusableSentinel(existingBlocks, 'end'),
    'end',
    FIRST_SCENE_X + sceneBlocks.length * NODE_GAP_X,
    9999,
  );

  const blocks = [start, ...sceneBlocks, end];
  const edges = blocks.slice(0, -1).map((block, index): EdgeInsert => ({
    id: storyboardRepository.newId(),
    draftId,
    sourceBlockId: block.id,
    targetBlockId: blocks[index + 1]!.id,
  }));

  const conn = await storyboardRepository.getConnection();
  try {
    await conn.beginTransaction();
    await storyboardRepository.replaceStoryboard(conn, draftId, blocks, edges);
    await storyboardHistoryRepository.insertHistoryAndPruneInTx(
      conn,
      draftId,
      buildHistorySnapshot(blocks, edges),
      HISTORY_CAP,
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [savedBlocks, savedEdges] = await Promise.all([
    storyboardRepository.findBlocksByDraftId(draftId),
    storyboardRepository.findEdgesByDraftId(draftId),
  ]);

  return { blocks: savedBlocks, edges: savedEdges };
}
