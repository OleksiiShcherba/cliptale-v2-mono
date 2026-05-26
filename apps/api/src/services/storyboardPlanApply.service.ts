import type { StoryboardPlan, StoryboardPlanMusicSegment } from '@ai-video-editor/project-schema';

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
const BASELINE_Y = 300;
const START_X = 50;
const FIRST_SCENE_X = 300;
const STORYBOARD_SCENE_NODE_WIDTH = 220;
const STORYBOARD_NODE_SPACING_X = 32;
const NODE_GAP_X = STORYBOARD_SCENE_NODE_WIDTH + STORYBOARD_NODE_SPACING_X;
const STORYBOARD_SCENE_NODE_RENDERED_HEIGHT = 280;
const STORYBOARD_MUSIC_NODE_VERTICAL_GAP = 40;
const STORYBOARD_MUSIC_NODE_LANE_HEIGHT = 132;

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
    videoPrompt: null,
    durationS: 5,
    positionX,
    positionY: BASELINE_Y,
    sortOrder,
    style: null,
  };
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

function buildMusicBlockName(segment: StoryboardPlanMusicSegment, index: number): string {
  const number = String(index + 1).padStart(2, '0');
  const segmentName = segment.name.trim();
  const name = segmentName.toLowerCase().startsWith(`music ${number}`)
    ? segmentName
    : `Music ${number} - ${segmentName}`;
  return name.slice(0, 255);
}

function getMusicBlockLayoutPosition(
  coveredScene: Pick<BlockInsert, 'positionX' | 'positionY'>,
  laneIndex: number,
): { x: number; y: number } {
  return {
    x: coveredScene.positionX,
    y: coveredScene.positionY
      + STORYBOARD_SCENE_NODE_RENDERED_HEIGHT
      + STORYBOARD_MUSIC_NODE_VERTICAL_GAP
      + laneIndex * STORYBOARD_MUSIC_NODE_LANE_HEIGHT,
  };
}

function validateMusicSegmentRange(
  plan: StoryboardPlan,
  segment: StoryboardPlanMusicSegment,
  index: number,
): void {
  if (
    segment.startSceneNumber > segment.endSceneNumber ||
    segment.startSceneNumber < 1 ||
    segment.endSceneNumber > plan.scenes.length
  ) {
    throw new UnprocessableEntityError(
      `Storyboard plan music segment ${index + 1} references scenes ${segment.startSceneNumber}-${segment.endSceneNumber}, but the plan has ${plan.scenes.length} scenes`,
    );
  }
}

function buildMusicBlocks(
  draftId: string,
  plan: StoryboardPlan,
  sceneBlocks: BlockInsert[],
): StoryboardMusicBlockInsert[] {
  const sceneBlocksByNumber = new Map<number, BlockInsert>();
  sceneBlocks.forEach((block, index) => {
    sceneBlocksByNumber.set(index + 1, block);
  });

  return (plan.musicSegments ?? []).map((segment, index) => {
    validateMusicSegmentRange(plan, segment, index);

    const startScene = sceneBlocksByNumber.get(segment.startSceneNumber);
    const endScene = sceneBlocksByNumber.get(segment.endSceneNumber);
    if (!startScene || !endScene) {
      throw new UnprocessableEntityError(
        `Storyboard plan music segment ${index + 1} could not be mapped to generated scene blocks`,
      );
    }

    const position = getMusicBlockLayoutPosition(startScene, index);

    return {
      id: storyboardRepository.newId(),
      draftId,
      name: buildMusicBlockName(segment, index),
      sourceMode: segment.sourceMode,
      prompt: segment.prompt,
      compositionPlan: segment.compositionPlan,
      existingFileId: null,
      startSceneBlockId: startScene.id,
      endSceneBlockId: endScene.id,
      positionX: position.x,
      positionY: position.y,
      sortOrder: index,
      volume: 0.8,
      fadeInS: 0,
      fadeOutS: 1,
      loopMode: 'trim',
    };
  });
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
      videoPrompt: scene.videoPrompt,
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
  const musicBlocks = buildMusicBlocks(draftId, job.plan, sceneBlocks);

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
