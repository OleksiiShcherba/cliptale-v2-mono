/**
 * Tests for useHandleRestore.
 *
 * Verifies that the hook:
 * 1. Re-wires onRemove for scene-block nodes before calling setNodes
 * 2. Calls setEdges with the original edges (unchanged)
 * 3. Calls pushSnapshot with the rewired nodes and edges
 * 4. Calls saveNow after setNodes / setEdges / pushSnapshot
 * 5. Does not mutate sentinel (start/end) nodes' data
 * 6. Returns a stable callback reference when deps do not change
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useHandleRestore } from './useHandleRestore';

afterEach(() => {
  vi.useRealTimers();
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeSceneNode(id: string): Node {
  return {
    id,
    type: 'scene-block',
    position: { x: 100, y: 200 },
    data: {
      block: {
        id,
        draftId: 'draft-1',
        blockType: 'scene',
        name: 'Scene',
        prompt: null,
        videoPrompt: null,
        durationS: 5,
        positionX: 100,
        positionY: 200,
        sortOrder: 1,
        style: null,
        createdAt: '',
        updatedAt: '',
        mediaItems: [],
      },
      // Placeholder set by restoreFromSnapshot — should be replaced.
      onRemove: () => undefined,
    },
  };
}

function makeStartNode(id: string): Node {
  return {
    id,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { label: 'START' },
    draggable: true,
    deletable: false,
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

const MUSIC_BLOCK = {
  id: '00000000-0000-4000-8000-000000000001',
  draftId: '00000000-0000-4000-8000-000000000010',
  name: 'Opening music',
  sourceMode: 'generate_on_step3' as const,
  prompt: null,
  compositionPlan: null,
  existingFileId: null,
  startSceneBlockId: '00000000-0000-4000-8000-000000000020',
  endSceneBlockId: '00000000-0000-4000-8000-000000000021',
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

const MUSIC_BLOCK_SAVE_INPUT = {
  id: MUSIC_BLOCK.id,
  draftId: MUSIC_BLOCK.draftId,
  name: MUSIC_BLOCK.name,
  sourceMode: MUSIC_BLOCK.sourceMode,
  prompt: MUSIC_BLOCK.prompt,
  compositionPlan: MUSIC_BLOCK.compositionPlan,
  existingFileId: MUSIC_BLOCK.existingFileId,
  startSceneBlockId: MUSIC_BLOCK.startSceneBlockId,
  endSceneBlockId: MUSIC_BLOCK.endSceneBlockId,
  positionX: MUSIC_BLOCK.positionX,
  positionY: MUSIC_BLOCK.positionY,
  sortOrder: MUSIC_BLOCK.sortOrder,
  volume: MUSIC_BLOCK.volume,
  fadeInS: MUSIC_BLOCK.fadeInS,
  fadeOutS: MUSIC_BLOCK.fadeOutS,
  loopMode: MUSIC_BLOCK.loopMode,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useHandleRestore', () => {
  it('(1) re-wires onRemove for scene-block nodes', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const sceneNode = makeSceneNode('scene-1');
    const edges: Edge[] = [];

    act(() => {
      result.current.handleRestore([sceneNode], edges);
    });

    expect(setNodes).toHaveBeenCalledTimes(1);
    const [rewiredNodes] = setNodes.mock.calls[0] as [Node[]];
    const rewiredScene = rewiredNodes.find((n) => n.id === 'scene-1');
    expect(rewiredScene).toBeDefined();
    // The onRemove on the rewired node should be the real removeNode fn.
    const data = rewiredScene?.data as { onRemove: (id: string) => void };
    data.onRemove('scene-1');
    expect(removeNode).toHaveBeenCalledWith('scene-1');
  });

  it('(2) calls setEdges with the original edges unchanged', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const edges: Edge[] = [makeEdge('e1', 'start-1', 'scene-1')];

    act(() => {
      result.current.handleRestore([], edges);
    });

    expect(setEdges).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledWith(edges);
  });

  it('(3) calls pushSnapshot with rewired nodes and original edges', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const sceneNode = makeSceneNode('scene-1');
    const edges: Edge[] = [makeEdge('e1', 'start-1', 'scene-1')];

    act(() => {
      result.current.handleRestore([sceneNode], edges);
    });

    expect(pushSnapshot).toHaveBeenCalledTimes(1);
    const [snapshotNodes, snapshotEdges] = pushSnapshot.mock.calls[0] as [Node[], Edge[]];
    // Snapshot nodes should be the rewired version.
    const snapshotScene = snapshotNodes.find((n) => n.id === 'scene-1');
    const data = snapshotScene?.data as { onRemove: (id: string) => void };
    data.onRemove('scene-1');
    expect(removeNode).toHaveBeenCalledWith('scene-1');
    // Edges unchanged.
    expect(snapshotEdges).toBe(edges);
  });

  it('(4) calls saveNow after setNodes, setEdges, pushSnapshot', () => {
    const callOrder: string[] = [];
    const removeNode = vi.fn();
    const setNodes = vi.fn(() => { callOrder.push('setNodes'); });
    const setEdges = vi.fn(() => { callOrder.push('setEdges'); });
    const pushSnapshot = vi.fn(() => { callOrder.push('pushSnapshot'); return Promise.resolve(); });
    const saveNow = vi.fn(() => { callOrder.push('saveNow'); return Promise.resolve(); });

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([], []);
    });

    expect(callOrder).toEqual(['setNodes', 'setEdges', 'pushSnapshot', 'saveNow']);
  });

  it('(5) does not mutate sentinel (start/end) node data', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const startNode = makeStartNode('start-1');
    const originalData = startNode.data;

    act(() => {
      result.current.handleRestore([startNode], []);
    });

    const [rewiredNodes] = setNodes.mock.calls[0] as [Node[]];
    const rewiredStart = rewiredNodes.find((n) => n.id === 'start-1');
    // Sentinel node data is unchanged — no onRemove injection.
    expect(rewiredStart?.data).toBe(originalData);
  });

  it('(6) returns a stable callback reference when deps do not change', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const firstRef = result.current.handleRestore;
    rerender();
    expect(result.current.handleRestore).toBe(firstRef);
  });

  it('(7) calls saveNow by default (skipSave undefined)', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([], []);
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
  });

  it('(8) calls saveNow when skipSave is false', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([], [], { skipSave: false });
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
  });

  it('(9) does NOT call saveNow when skipSave is true', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([], [], { skipSave: true });
    });

    // skipSave: true → auto-restore path; saveNow must be skipped to avoid
    // persisting pre-restore (stale) state to the DB.
    expect(saveNow).not.toHaveBeenCalled();
  });

  it('(10) still calls setNodes, setEdges, pushSnapshot even when skipSave is true', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const sceneNode = makeSceneNode('scene-1');
    const edges: Edge[] = [makeEdge('e1', 'start-1', 'scene-1')];

    act(() => {
      result.current.handleRestore([sceneNode], edges, { skipSave: true });
    });

    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
    expect(pushSnapshot).toHaveBeenCalledTimes(1);
    expect(saveNow).not.toHaveBeenCalled();
  });

  it('(11) skips pushSnapshot when skipSnapshot is true', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([makeSceneNode('scene-1')], [], { skipSnapshot: true });
    });

    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
    expect(pushSnapshot).not.toHaveBeenCalled();
    expect(saveNow).toHaveBeenCalledTimes(1);
  });

  it('(12) defers saveNow when deferSave is true', () => {
    vi.useFakeTimers();

    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([makeSceneNode('scene-1')], [], { deferSave: true });
    });

    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
    expect(saveNow).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
  });

  it('(13) keeps hydrated music in history and strips read-only fields for saveNow', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    act(() => {
      result.current.handleRestore([], [], { musicBlocks: [MUSIC_BLOCK] });
    });

    expect(pushSnapshot).toHaveBeenCalledWith([], [], { musicBlocks: [MUSIC_BLOCK] });
    expect(saveNow).toHaveBeenCalledWith({ musicBlocks: [MUSIC_BLOCK_SAVE_INPUT] });
  });
});
