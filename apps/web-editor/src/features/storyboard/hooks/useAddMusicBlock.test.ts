import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MusicBlockNodeData, SceneBlockNodeData, StoryboardBlock } from '@/features/storyboard/types';
import { getManualMusicBlockPosition } from '@/features/storyboard/utils/musicBlockLayout';

import { useAddMusicBlock } from './useAddMusicBlock';

const DRAFT_ID = '00000000-0000-4000-8000-000000000010';
const MUSIC_ID = '00000000-0000-4000-8000-000000000099';

function scene(id: string, sortOrder: number, x: number): StoryboardBlock {
  return {
    id,
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: `Scene ${sortOrder}`,
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

function sceneNode(block: StoryboardBlock): Node {
  return {
    id: block.id,
    type: 'scene-block',
    position: { x: block.positionX, y: block.positionY },
    data: { block, onRemove: vi.fn() } satisfies SceneBlockNodeData,
  };
}

describe('useAddMusicBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(MUSIC_ID);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disables creation when the storyboard has no scene blocks', () => {
    const setNodes = vi.fn();
    const { result } = renderHook(() =>
      useAddMusicBlock({
        draftId: DRAFT_ID,
        nodes: [],
        edges: [],
        orderedScenes: [],
        setNodes,
        saveNow: vi.fn().mockResolvedValue(undefined),
      }),
    );

    expect(result.current.canAddMusicBlock).toBe(false);
    expect(result.current.addMusicBlock()).toBeNull();
    expect(setNodes).not.toHaveBeenCalled();
  });

  it('creates a generate-on-step3 music node covering first through last scene', () => {
    const scene1 = scene('scene-1', 1, 300);
    const scene2 = scene('scene-2', 2, 580);
    const nodes = [sceneNode(scene1), sceneNode(scene2)];
    const edges: Edge[] = [{ id: 'edge-1', source: 'scene-1', target: 'scene-2' }];
    const setNodes = vi.fn((updater: (prev: Node[]) => Node[]) => updater(nodes));
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const onAfterAdd = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAddMusicBlock({
        draftId: DRAFT_ID,
        nodes,
        edges,
        orderedScenes: [scene1, scene2],
        setNodes: setNodes as React.Dispatch<React.SetStateAction<Node[]>>,
        saveNow,
        onAfterAdd,
      }),
    );

    let created = null as ReturnType<typeof result.current.addMusicBlock>;
    act(() => {
      created = result.current.addMusicBlock();
      vi.runAllTimers();
    });

    expect(created).toEqual(expect.objectContaining({
      id: MUSIC_ID,
      draftId: DRAFT_ID,
      sourceMode: 'generate_on_step3',
      startSceneBlockId: 'scene-1',
      endSceneBlockId: 'scene-2',
      sortOrder: 0,
      volume: 0.8,
      fadeInS: 0,
      fadeOutS: 1,
      loopMode: 'trim',
      generationStatus: null,
      generationJobId: null,
      outputFileId: null,
      errorMessage: null,
    }));

    const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
    const nextNodes = updater(nodes);
    const musicNode = nextNodes.find((node) => node.id === MUSIC_ID);
    expect(musicNode?.type).toBe('music-block');
    expect(musicNode?.position).toEqual(getManualMusicBlockPosition(scene1, []));
    expect((musicNode?.data as MusicBlockNodeData).rangeLabel).toBe('Scene 1 - Scene 2');
    expect(saveNow).toHaveBeenCalledWith({
      musicBlocks: [expect.objectContaining({ id: MUSIC_ID, draftId: DRAFT_ID })],
    });
    expect(onAfterAdd).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: MUSIC_ID, type: 'music-block' })]),
      edges,
    );
  });

  it('places new manual music blocks on the same horizontal row as other music blocks', () => {
    const scene1 = scene('scene-1', 1, 300);
    const existingMusicBlock = {
      id: 'music-existing',
      draftId: DRAFT_ID,
      name: 'Existing music',
      sourceMode: 'generate_on_step3' as const,
      prompt: 'Warm pulse',
      compositionPlan: null,
      existingFileId: null,
      startSceneBlockId: 'scene-1',
      endSceneBlockId: 'scene-1',
      positionX: 300,
      positionY: 520,
      sortOrder: 0,
      volume: 0.8,
      fadeInS: 0,
      fadeOutS: 1,
      loopMode: 'trim' as const,
      generationStatus: null,
      generationJobId: null,
      outputFileId: null,
      errorMessage: null,
      createdAt: '2026-05-26T00:00:00Z',
      updatedAt: '2026-05-26T00:00:00Z',
    };
    const existingMusicNode: Node = {
      id: existingMusicBlock.id,
      type: 'music-block',
      position: { x: existingMusicBlock.positionX, y: existingMusicBlock.positionY },
      data: {
        musicBlock: existingMusicBlock,
        rangeLabel: 'Scene 1',
        sourceLabel: 'Auto later',
        statusLabel: 'Pending',
        isActive: false,
        onEdit: vi.fn(),
        onHover: vi.fn(),
      } satisfies MusicBlockNodeData,
    };
    const nodes = [sceneNode(scene1), existingMusicNode];
    const setNodes = vi.fn((updater: (prev: Node[]) => Node[]) => updater(nodes));

    const { result } = renderHook(() =>
      useAddMusicBlock({
        draftId: DRAFT_ID,
        nodes,
        edges: [],
        orderedScenes: [scene1],
        setNodes: setNodes as React.Dispatch<React.SetStateAction<Node[]>>,
        saveNow: vi.fn().mockResolvedValue(undefined),
      }),
    );

    act(() => {
      result.current.addMusicBlock();
    });

    const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
    const createdNode = updater(nodes).find((node) => node.id === MUSIC_ID);
    expect(createdNode?.position).toEqual(getManualMusicBlockPosition(scene1, [existingMusicBlock]));
    // All music blocks share one horizontal row — new block y equals the layout row y.
    expect(createdNode?.position.y).toBe(getManualMusicBlockPosition(scene1, []).y);
  });
});
