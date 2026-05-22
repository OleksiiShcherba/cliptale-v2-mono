import { describe, expect, it } from 'vitest';

import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import { orderStoryboardSceneBlocks } from './storyboardGraph.service.js';

const DRAFT_ID = '00000000-0000-4000-8000-000000000100';

function makeBlock(
  id: string,
  blockType: StoryboardBlock['blockType'],
  sortOrder: number,
): StoryboardBlock {
  return {
    id,
    draftId: DRAFT_ID,
    blockType,
    name: blockType,
    prompt: blockType === 'scene' ? `Prompt ${id}` : null,
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder,
    style: null,
    createdAt: new Date('2026-05-22T00:00:00.000Z'),
    updatedAt: new Date('2026-05-22T00:00:00.000Z'),
    mediaItems: [],
  };
}

function edge(sourceBlockId: string, targetBlockId: string): StoryboardEdge {
  return {
    id: `${sourceBlockId}-${targetBlockId}`,
    draftId: DRAFT_ID,
    sourceBlockId,
    targetBlockId,
  };
}

describe('orderStoryboardSceneBlocks', () => {
  it('orders scenes by START-to-END graph traversal', () => {
    const start = makeBlock('start', 'start', 0);
    const sceneA = makeBlock('scene-a', 'scene', 2);
    const sceneB = makeBlock('scene-b', 'scene', 1);
    const end = makeBlock('end', 'end', 3);

    const result = orderStoryboardSceneBlocks(
      [start, sceneA, sceneB, end],
      [edge('start', 'scene-a'), edge('scene-a', 'scene-b'), edge('scene-b', 'end')],
    );

    expect(result.map((block) => block.id)).toEqual(['scene-a', 'scene-b']);
  });

  it('falls back to sortOrder when the graph is incomplete', () => {
    const start = makeBlock('start', 'start', 0);
    const sceneA = makeBlock('scene-a', 'scene', 2);
    const sceneB = makeBlock('scene-b', 'scene', 1);
    const end = makeBlock('end', 'end', 3);

    const result = orderStoryboardSceneBlocks(
      [start, sceneA, sceneB, end],
      [edge('start', 'scene-a'), edge('scene-a', 'end')],
    );

    expect(result.map((block) => block.id)).toEqual(['scene-b', 'scene-a']);
  });

  it('falls back to sortOrder when all scenes are visited but END is not reached', () => {
    const start = makeBlock('start', 'start', 0);
    const sceneA = makeBlock('scene-a', 'scene', 2);
    const sceneB = makeBlock('scene-b', 'scene', 1);

    const result = orderStoryboardSceneBlocks(
      [start, sceneA, sceneB],
      [edge('start', 'scene-a'), edge('scene-a', 'scene-b')],
    );

    expect(result.map((block) => block.id)).toEqual(['scene-b', 'scene-a']);
  });

  it('falls back to sortOrder when a node has multiple outgoing edges', () => {
    const start = makeBlock('start', 'start', 0);
    const sceneA = makeBlock('scene-a', 'scene', 2);
    const sceneB = makeBlock('scene-b', 'scene', 1);

    const result = orderStoryboardSceneBlocks(
      [start, sceneA, sceneB],
      [edge('start', 'scene-a'), edge('start', 'scene-b')],
    );

    expect(result.map((block) => block.id)).toEqual(['scene-b', 'scene-a']);
  });
});
