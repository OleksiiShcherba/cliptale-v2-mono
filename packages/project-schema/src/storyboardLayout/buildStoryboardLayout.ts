/**
 * buildStoryboardLayout — the PURE plan → storyboard-layout projection.
 *
 * Single source of truth for turning a validated {@link StoryboardPlan} into the
 * concrete blocks / edges / music blocks the canvas (and every downstream phase)
 * reads. Both surfaces consume it:
 *   - api `applyLatestCompletedPlan` (the manual "apply latest plan" endpoint), and
 *   - media-worker scene-plan completion (the backend-owned pipeline materialises
 *     scene blocks here before advancing to reference-data — review r6-F1).
 *
 * Keeping the layout math in one shared, dependency-free function is what stops the
 * two callers from drifting (e.g. one positions music differently from the other).
 * It is intentionally side-effect-free: ids come from an injected factory and the
 * caller owns persistence.
 */

import type { StoryboardPlan, StoryboardPlanMusicSegment } from '../schemas/storyboardPlan.schema.js';

// ── Layout constants (mirrors the canvas node geometry) ───────────────────────
const BASELINE_Y = 300;
const START_X = 50;
const FIRST_SCENE_X = 300;
const STORYBOARD_SCENE_NODE_WIDTH = 220;
const STORYBOARD_NODE_SPACING_X = 32;
const NODE_GAP_X = STORYBOARD_SCENE_NODE_WIDTH + STORYBOARD_NODE_SPACING_X;
const STORYBOARD_SCENE_NODE_RENDERED_HEIGHT = 280;
const STORYBOARD_MUSIC_NODE_VERTICAL_GAP = 40;
const STORYBOARD_MUSIC_NODE_LANE_HEIGHT = 132;
const SENTINEL_DURATION_S = 5;
const END_SORT_ORDER = 9999;

// ── Neutral output types (structurally compatible with the api repo Insert types) ─
export type StoryboardLayoutBlockType = 'start' | 'end' | 'scene';

export type StoryboardLayoutMediaItem = {
  id: string;
  fileId: string;
  mediaType: 'image' | 'video' | 'audio';
  sortOrder: number;
};

export type StoryboardLayoutBlock = {
  id: string;
  draftId: string;
  blockType: StoryboardLayoutBlockType;
  name: string | null;
  prompt: string | null;
  videoPrompt: string | null;
  durationS: number;
  positionX: number;
  positionY: number;
  sortOrder: number;
  style: string | null;
  mediaItems: StoryboardLayoutMediaItem[];
};

export type StoryboardLayoutEdge = {
  id: string;
  draftId: string;
  sourceBlockId: string;
  targetBlockId: string;
};

export type StoryboardLayoutMusicBlock = {
  id: string;
  draftId: string;
  name: string;
  sourceMode: StoryboardPlanMusicSegment['sourceMode'];
  prompt: string | null;
  compositionPlan: StoryboardPlanMusicSegment['compositionPlan'] | null;
  existingFileId: string | null;
  startSceneBlockId: string;
  endSceneBlockId: string;
  positionX: number;
  positionY: number;
  sortOrder: number;
  volume: number;
  fadeInS: number;
  fadeOutS: number;
  loopMode: 'loop' | 'trim';
};

export type StoryboardLayout = {
  blocks: StoryboardLayoutBlock[];
  edges: StoryboardLayoutEdge[];
  musicBlocks: StoryboardLayoutMusicBlock[];
};

export type BuildStoryboardLayoutParams = {
  draftId: string;
  plan: StoryboardPlan;
  /** Id factory — the caller decides how ids are minted (uuid v4, sequential, …). */
  newId: () => string;
  /** Reuse the draft's existing START sentinel id when one already exists. */
  existingStartId?: string | null;
  /** Reuse the draft's existing END sentinel id when one already exists. */
  existingEndId?: string | null;
};

/**
 * Raised when a plan cannot be laid out (currently: a music segment whose scene
 * range falls outside the generated scenes). Callers map this to their own
 * transport error (api → 422; worker → phase failure).
 */
export class StoryboardLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardLayoutError';
  }
}

function buildSentinel(
  draftId: string,
  id: string,
  blockType: 'start' | 'end',
  positionX: number,
  sortOrder: number,
): StoryboardLayoutBlock {
  return {
    id,
    draftId,
    blockType,
    name: null,
    prompt: null,
    videoPrompt: null,
    durationS: SENTINEL_DURATION_S,
    positionX,
    positionY: BASELINE_Y,
    sortOrder,
    style: null,
    mediaItems: [],
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
  coveredScene: Pick<StoryboardLayoutBlock, 'positionX' | 'positionY'>,
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
    throw new StoryboardLayoutError(
      `Storyboard plan music segment ${index + 1} references scenes ${segment.startSceneNumber}-${segment.endSceneNumber}, but the plan has ${plan.scenes.length} scenes`,
    );
  }
}

function buildMusicBlocks(
  draftId: string,
  plan: StoryboardPlan,
  sceneBlocks: StoryboardLayoutBlock[],
  newId: () => string,
): StoryboardLayoutMusicBlock[] {
  const sceneBlocksByNumber = new Map<number, StoryboardLayoutBlock>();
  sceneBlocks.forEach((block, index) => {
    sceneBlocksByNumber.set(index + 1, block);
  });

  return (plan.musicSegments ?? []).map((segment, index) => {
    validateMusicSegmentRange(plan, segment, index);

    const startScene = sceneBlocksByNumber.get(segment.startSceneNumber);
    const endScene = sceneBlocksByNumber.get(segment.endSceneNumber);
    if (!startScene || !endScene) {
      throw new StoryboardLayoutError(
        `Storyboard plan music segment ${index + 1} could not be mapped to generated scene blocks`,
      );
    }

    const position = getMusicBlockLayoutPosition(startScene, index);

    return {
      id: newId(),
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

/**
 * Project a validated storyboard plan into concrete blocks + edges + music blocks.
 * Pure: mints ids via `newId`, performs no I/O.
 */
export function buildStoryboardLayout(params: BuildStoryboardLayoutParams): StoryboardLayout {
  const { draftId, plan, newId, existingStartId, existingEndId } = params;

  const start = buildSentinel(draftId, existingStartId ?? newId(), 'start', START_X, 0);

  const sceneBlocks: StoryboardLayoutBlock[] = plan.scenes.map((scene, index) => ({
    id: newId(),
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
      id: newId(),
      fileId: media.fileId,
      mediaType: media.mediaType,
      sortOrder: mediaIndex,
    })),
  }));

  const end = buildSentinel(
    draftId,
    existingEndId ?? newId(),
    'end',
    FIRST_SCENE_X + sceneBlocks.length * NODE_GAP_X,
    END_SORT_ORDER,
  );

  const blocks = [start, ...sceneBlocks, end];
  const edges: StoryboardLayoutEdge[] = blocks.slice(0, -1).map((block, index) => ({
    id: newId(),
    draftId,
    sourceBlockId: block.id,
    targetBlockId: blocks[index + 1]!.id,
  }));
  const musicBlocks = buildMusicBlocks(draftId, plan, sceneBlocks, newId);

  return { blocks, edges, musicBlocks };
}
