import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/storyboard/api', () => ({
  persistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./storyboard-store', () => ({
  getSnapshot: vi.fn().mockReturnValue({ nodes: [], edges: [], positions: {} }),
  setNodes: vi.fn(),
  setEdges: vi.fn(),
}));

import {
  destroyHistoryStore,
  initHistoryStore,
  push,
  undo,
} from './storyboard-history-store';
import type { CanvasSnapshot } from './storyboard-history-store';

const MUSIC_BLOCK = {
  id: 'music-1',
  draftId: 'draft-1',
  name: 'Opening music',
  sourceMode: 'generate_on_step3' as const,
  prompt: null,
  compositionPlan: null,
  existingFileId: null,
  startSceneBlockId: 'scene-1',
  endSceneBlockId: 'scene-2',
  positionX: 120,
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

function scene(id: string, name: string, sortOrder: number) {
  return {
    id,
    draftId: 'draft-1',
    blockType: 'scene' as const,
    name,
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: sortOrder * 200,
    positionY: 200,
    sortOrder,
    style: null,
    mediaItems: [],
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
  };
}

describe('storyboard-history-store music restore', () => {
  beforeEach(() => {
    destroyHistoryStore();
    initHistoryStore('draft-1');
  });

  it('restores music blocks as usable React Flow music nodes on undo', () => {
    const snapWithMusic: CanvasSnapshot = {
      blocks: [scene('scene-1', 'Opening', 1), scene('scene-2', 'Close', 2)],
      edges: [],
      musicBlocks: [MUSIC_BLOCK],
    };
    const snapWithoutMusic: CanvasSnapshot = { blocks: [], edges: [], musicBlocks: [] };

    push(snapWithMusic);
    push(snapWithoutMusic);

    const applied = undo();
    const musicNode = applied?.nodes.find((node) => node.id === MUSIC_BLOCK.id);

    expect(musicNode?.type).toBe('music-block');
    expect(musicNode?.data).toEqual(expect.objectContaining({
      musicBlock: MUSIC_BLOCK,
      sourceLabel: 'Auto later',
      statusLabel: 'Pending',
      onEdit: expect.any(Function),
      onHover: expect.any(Function),
    }));
  });

  it('restores active music job fields and status labels on undo', () => {
    const activeMusicBlock = {
      ...MUSIC_BLOCK,
      generationStatus: 'running' as const,
      generationJobId: 'job-active-music-1',
      outputFileId: null,
    };
    const snapWithActiveMusic: CanvasSnapshot = {
      blocks: [scene('scene-1', 'Opening', 1), scene('scene-2', 'Close', 2)],
      edges: [],
      musicBlocks: [activeMusicBlock],
    };
    const snapWithoutMusic: CanvasSnapshot = { blocks: [], edges: [], musicBlocks: [] };

    push(snapWithActiveMusic);
    push(snapWithoutMusic);

    const applied = undo();
    const musicNode = applied?.nodes.find((node) => node.id === activeMusicBlock.id);

    expect(musicNode?.type).toBe('music-block');
    expect(musicNode?.data).toEqual(expect.objectContaining({
      musicBlock: expect.objectContaining({
        generationStatus: 'running',
        generationJobId: 'job-active-music-1',
      }),
      statusLabel: 'Running',
    }));
    expect(applied?.musicBlocks?.[0]).toEqual(activeMusicBlock);
  });
});
