import type { StoryboardBlock, StoryboardMusicBlock } from '@/features/storyboard/types';

export const STORYBOARD_SCENE_NODE_WIDTH = 220;
export const STORYBOARD_SCENE_NODE_RENDERED_HEIGHT = 280;
export const STORYBOARD_MUSIC_NODE_VERTICAL_GAP = 40;
export const STORYBOARD_MUSIC_NODE_LANE_HEIGHT = 132;

/**
 * Calculates the default canvas position for a storyboard music block.
 *
 * The block starts aligned to the first covered scene and is placed in a lane
 * below the rendered scene node so generated and manual music blocks share the
 * same non-overlapping layout.
 */
export function getMusicBlockLayoutPosition(
  coveredScene: Pick<StoryboardBlock, 'positionX' | 'positionY'>,
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

/**
 * Calculates the next manual music block position from existing music lanes.
 */
export function getManualMusicBlockPosition(
  coveredScene: StoryboardBlock,
  existingMusicBlocks: readonly StoryboardMusicBlock[],
): { x: number; y: number } {
  return getMusicBlockLayoutPosition(coveredScene, existingMusicBlocks.length);
}
