import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  MusicBlockNodeData,
  StoryboardBlock,
  StoryboardMusicBlock,
} from '@/features/storyboard/types';

import {
  getMusicRangeInfo,
  getSceneNodesInStoryOrder,
  useStoryboardMusic,
} from './useStoryboardMusic';

function scene(id: string, name: string, sortOrder: number, x: number): StoryboardBlock {
  return {
    id,
    draftId: 'draft-1',
    blockType: 'scene',
    name,
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: x,
    positionY: 200,
    sortOrder,
    style: null,
    mediaItems: [],
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
  };
}

function node(block: StoryboardBlock): Node {
  return {
    id: block.id,
    type: 'scene-block',
    position: { x: block.positionX, y: block.positionY },
    data: { block },
  };
}

function musicBlock(id: string, prompt: string, sortOrder: number): StoryboardMusicBlock {
  return {
    id,
    draftId: 'draft-1',
    name: `Music ${sortOrder}`,
    sourceMode: 'generate_now',
    prompt,
    compositionPlan: null,
    existingFileId: null,
    startSceneBlockId: 'scene-a',
    endSceneBlockId: 'scene-b',
    positionX: 120,
    positionY: 520 + (sortOrder * 132),
    sortOrder,
    volume: 0.8,
    fadeInS: 0,
    fadeOutS: 1,
    loopMode: 'trim',
    generationStatus: null,
    generationJobId: null,
    outputFileId: null,
    errorMessage: null,
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
  };
}

function musicNode(block: StoryboardMusicBlock): Node {
  return {
    id: block.id,
    type: 'music-block',
    position: { x: block.positionX, y: block.positionY },
    data: {
      musicBlock: block,
      rangeLabel: 'Alpha - Beta',
      sourceLabel: 'Generate now',
      statusLabel: 'Pending',
      isActive: false,
      onEdit: () => {},
      onHover: () => {},
    } satisfies MusicBlockNodeData,
  };
}

const startNode: Node = { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'START' } };
const endNode: Node = { id: 'end-1', type: 'end', position: { x: 1200, y: 0 }, data: { label: 'END' } };

describe('storyboard music story order', () => {
  it('updates range labels from story edges instead of canvas position', () => {
    const sceneA = scene('scene-a', 'Alpha', 1, 900);
    const sceneB = scene('scene-b', 'Beta', 2, 100);
    const nodes = [startNode, node(sceneA), node(sceneB), endNode];
    const firstOrderEdges: Edge[] = [
      { id: 'e1', source: 'start-1', target: 'scene-a' },
      { id: 'e2', source: 'scene-a', target: 'scene-b' },
      { id: 'e3', source: 'scene-b', target: 'end-1' },
    ];
    const secondOrderEdges: Edge[] = [
      { id: 'e1', source: 'start-1', target: 'scene-b' },
      { id: 'e2', source: 'scene-b', target: 'scene-a' },
      { id: 'e3', source: 'scene-a', target: 'end-1' },
    ];

    const firstOrder = getSceneNodesInStoryOrder(nodes, firstOrderEdges);
    const secondOrder = getSceneNodesInStoryOrder(nodes, secondOrderEdges);

    expect(firstOrder.map((block) => block.id)).toEqual(['scene-a', 'scene-b']);
    expect(secondOrder.map((block) => block.id)).toEqual(['scene-b', 'scene-a']);
    const rangeInfo = getMusicRangeInfo({
      id: 'music-1',
      draftId: 'draft-1',
      name: 'Cue',
      sourceMode: 'generate_on_step3',
      prompt: null,
      compositionPlan: null,
      existingFileId: null,
      startSceneBlockId: 'scene-b',
      endSceneBlockId: 'scene-a',
      positionX: 0,
      positionY: 0,
      sortOrder: 0,
      volume: 0.8,
      fadeInS: 0,
      fadeOutS: 1,
      loopMode: 'trim',
      generationStatus: null,
      generationJobId: null,
      outputFileId: null,
      errorMessage: null,
      createdAt: '',
      updatedAt: '',
    }, secondOrder);
    expect(rangeInfo.rangeLabel).toBe('Beta - Alpha');
    expect(rangeInfo.coveredSceneIds).toEqual(['scene-b', 'scene-a']);
  });

  it('commits prompt edits only to the active music block save payload', async () => {
    const firstBlock = musicBlock('music-1', 'Original first cue', 0);
    const secondBlock = musicBlock('music-2', 'Keep this cue', 1);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState<Node[]>([
        musicNode(firstBlock),
        musicNode(secondBlock),
      ]);
      return {
        nodes,
        music: useStoryboardMusic({
          draftId: 'draft-1',
          nodes,
          setNodes,
          saveNow,
        }),
      };
    });

    act(() => {
      result.current.music.commitMusicBlock({
        ...firstBlock,
        prompt: 'Edited cue for active block',
      });
    });

    const currentMusicNodes = result.current.nodes
      .filter((currentNode) => currentNode.type === 'music-block')
      .map((currentNode) => (currentNode.data as MusicBlockNodeData).musicBlock);
    expect(currentMusicNodes.map((block) => [block.id, block.prompt])).toEqual([
      ['music-1', 'Edited cue for active block'],
      ['music-2', 'Keep this cue'],
    ]);

    await waitFor(() => expect(saveNow).toHaveBeenCalledTimes(1));
    expect(saveNow).toHaveBeenCalledWith({
      musicBlocks: [
        expect.objectContaining({ id: 'music-1', prompt: 'Edited cue for active block' }),
        expect.objectContaining({ id: 'music-2', prompt: 'Keep this cue' }),
      ],
    });
  });
});
