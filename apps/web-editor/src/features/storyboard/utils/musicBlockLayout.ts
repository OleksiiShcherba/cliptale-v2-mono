import type { StoryboardBlock, StoryboardMusicBlock } from '@/features/storyboard/types';

export const STORYBOARD_SCENE_NODE_WIDTH = 220;
export const STORYBOARD_SCENE_NODE_RENDERED_HEIGHT = 280;
export const STORYBOARD_MUSIC_NODE_VERTICAL_GAP = 40;
export const STORYBOARD_MUSIC_NODE_LANE_HEIGHT = 132;

/**
 * Calculates the default canvas position for a storyboard music block.
 *
 * All music blocks share the same horizontal row (one lane below the scene node),
 * aligned to the X of the first covered scene. This matches the generated-layout
 * convention: each music block is visually "under" its start scene.
 */
export function getMusicBlockLayoutPosition(
  coveredScene: Pick<StoryboardBlock, 'positionX' | 'positionY'>,
): { x: number; y: number } {
  return {
    x: coveredScene.positionX,
    y: coveredScene.positionY
      + STORYBOARD_SCENE_NODE_RENDERED_HEIGHT
      + STORYBOARD_MUSIC_NODE_VERTICAL_GAP,
  };
}

/**
 * Calculates the canvas position for a manually added music block.
 * Placed on the same horizontal music row, aligned to the first covered scene.
 */
export function getManualMusicBlockPosition(
  coveredScene: StoryboardBlock,
  _existingMusicBlocks: readonly StoryboardMusicBlock[],
): { x: number; y: number } {
  return getMusicBlockLayoutPosition(coveredScene);
}
