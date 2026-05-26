import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Edge, Node } from '@xyflow/react';

import { useStoryboardDrag } from './useStoryboardDrag';
import {
  fireDragStart,
  fireDragStop,
  makeEdge,
  makeMusicNode,
  makeSceneNode,
} from './useStoryboardDrag.fixtures';

afterEach(() => {
  vi.useRealTimers();
});

describe('useStoryboardDrag music blocks', () => {
  it('starts a ghost drag for music blocks and dims the original node', () => {
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));
    const musicNode = makeMusicNode();

    act(() => {
      fireDragStart(result.current.handleNodeDragStart, musicNode);
    });

    expect(result.current.dragState?.node.id).toBe('music-1');
    expect(result.current.dragState?.nodeWidth).toBe(220);
    expect(result.current.dragState?.nodeHeight).toBe(144);

    const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
    const [dimmedNode] = updater([musicNode]);
    expect(dimmedNode.style?.opacity).toBe(0.3);
  });

  it('persists a dropped music block position without changing scene graph edges', () => {
    vi.useFakeTimers();

    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));
    const sceneA = makeSceneNode('scene-1', 100);
    const sceneB = makeSceneNode('scene-2', 420);
    const edgeAB = makeEdge('scene-1', 'scene-2');
    const musicNode = makeMusicNode({ style: { opacity: 0.3 } });
    const droppedMusicNode = {
      ...musicNode,
      position: { x: 280, y: 640 },
    };

    act(() => {
      result.current.syncRefs([sceneA, sceneB, musicNode], [edgeAB]);
      fireDragStart(result.current.handleNodeDragStart, musicNode);
      fireDragStop(result.current.handleNodeDragStop, droppedMusicNode);
    });

    expect(setEdges).not.toHaveBeenCalled();
    expect(pushSnapshot).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'music-1',
          position: { x: 280, y: 640 },
          style: {},
        }),
      ]),
      [edgeAB] satisfies Edge[],
    );
    expect(result.current.dragState).toBeNull();

    act(() => {
      vi.runAllTimers();
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
  });
});
