import { renderHook, waitFor } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { MusicBlockNodeData, SceneBlockNodeData, StoryboardBlock, StoryboardMusicBlock } from '@/features/storyboard/types';

import { useStoryboardMusicDecorations } from './useStoryboardMusicDecorations';

const sceneBlock: StoryboardBlock = {
  id: 'scene-1',
  draftId: 'draft-1',
  blockType: 'scene',
  name: 'Opening',
  prompt: null,
  videoPrompt: null,
  durationS: 5,
  positionX: 200,
  positionY: 200,
  sortOrder: 1,
  style: null,
  mediaItems: [],
  createdAt: '2026-05-26T00:00:00Z',
  updatedAt: '2026-05-26T00:00:00Z',
};

const musicBlock: StoryboardMusicBlock = {
  id: 'music-1',
  draftId: 'draft-1',
  name: 'Opening music',
  sourceMode: 'generate_on_step3',
  prompt: null,
  compositionPlan: null,
  existingFileId: null,
  startSceneBlockId: 'scene-1',
  endSceneBlockId: 'scene-1',
  positionX: 120,
  positionY: 520,
  sortOrder: 0,
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

describe('useStoryboardMusicDecorations', () => {
  it('keeps covered scenes highlighted for the selected music block after hover clears', async () => {
    const setNodes = vi.fn();
    renderHook(() => useStoryboardMusicDecorations({
      activeMusicBlockId: null,
      editingMusicBlockId: 'music-1',
      musicBlocks: [musicBlock],
      orderedScenes: [sceneBlock],
      setActiveMusicBlockId: vi.fn(),
      setEditingMusicBlockId: vi.fn(),
      setNodes,
    }));

    await waitFor(() => expect(setNodes).toHaveBeenCalledWith(expect.any(Function)));
    const updater = setNodes.mock.calls.at(-1)?.[0] as (nodes: Node[]) => Node[];
    const [updatedScene] = updater([
      {
        id: 'scene-1',
        type: 'scene-block',
        position: { x: 200, y: 200 },
        data: { block: sceneBlock, onRemove: vi.fn() } satisfies SceneBlockNodeData,
      },
      {
        id: 'music-1',
        type: 'music-block',
        position: { x: 120, y: 520 },
        data: {
          musicBlock,
          rangeLabel: 'Opening',
          sourceLabel: 'Auto later',
          statusLabel: 'Pending',
          isActive: false,
          onEdit: vi.fn(),
          onHover: vi.fn(),
        } satisfies MusicBlockNodeData,
      },
    ]);

    expect((updatedScene.data as SceneBlockNodeData).musicCoverage).toEqual({
      count: 1,
      isHighlighted: true,
    });
  });
});
