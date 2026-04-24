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

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useHandleRestore } from './useHandleRestore';

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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useHandleRestore', () => {
  it('(1) re-wires onRemove for scene-block nodes', () => {
    const removeNode = vi.fn();
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn();
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
    const pushSnapshot = vi.fn();
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
    const pushSnapshot = vi.fn();
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
    const pushSnapshot = vi.fn(() => { callOrder.push('pushSnapshot'); });
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
    const pushSnapshot = vi.fn();
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
    const pushSnapshot = vi.fn();
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(() =>
      useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow }),
    );

    const firstRef = result.current.handleRestore;
    rerender();
    expect(result.current.handleRestore).toBe(firstRef);
  });
});
