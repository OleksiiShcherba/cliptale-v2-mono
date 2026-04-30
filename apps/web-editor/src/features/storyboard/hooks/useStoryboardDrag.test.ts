/**
 * Tests for useStoryboardDrag — drag lifecycle, ghost state, and no-op cases.
 *
 * Covers:
 * - handleNodeDragStart: sets dragState for scene-block nodes
 * - handleNodeDragStart: no-op for non-scene-block nodes
 * - handleNodeDragStart: dims original node to GHOST_OPACITY (0.3)
 * - handleNodeDrag: updates dragState clientX/clientY for scene-block nodes
 * - handleNodeDrag: no-op for non-scene-block nodes
 * - handleNodeDragStop: clears dragState
 * - handleNodeDragStop: no-op auto-insert when no edge midpoint is within tolerance
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardDrag } from './useStoryboardDrag';
import {
  makeSceneNode,
  makeEdge,
  fireDragStart,
  fireDrag,
  fireDragStop,
} from './useStoryboardDrag.fixtures';

// ── handleNodeDragStart ────────────────────────────────────────────────────────

describe('useStoryboardDrag', () => {
  describe('handleNodeDragStart', () => {
    it('sets dragState when a scene-block node drag starts', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const sceneNode = makeSceneNode('scene-1', 100);

      act(() => {
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
      });

      expect(result.current.dragState).not.toBeNull();
      expect(result.current.dragState?.node.id).toBe('scene-1');
    });

    it('does NOT set dragState for non-scene-block nodes', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const startNode: Node = {
        id: 'start',
        type: 'start',
        position: { x: 60, y: 200 },
        data: {},
      };

      act(() => {
        fireDragStart(result.current.handleNodeDragStart, startNode);
      });

      expect(result.current.dragState).toBeNull();
    });

    it('dims the original node opacity to GHOST_OPACITY (0.3)', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const sceneNode = makeSceneNode('scene-1', 100);

      act(() => {
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
      });

      // setNodes should have been called to apply the ghost opacity.
      expect(setNodes).toHaveBeenCalledTimes(1);

      // Extract the updater and apply it.
      const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
      const nextNodes = updater([sceneNode]);
      const updated = nextNodes.find((n) => n.id === 'scene-1');

      expect(updated?.style?.opacity).toBe(0.3);
    });
  });

  // ── handleNodeDrag ───────────────────────────────────────────────────────────

  describe('handleNodeDrag', () => {
    it('updates dragState clientX and clientY for scene-block nodes', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const sceneNode = makeSceneNode('scene-1', 100);

      // Must start a drag first so dragState is non-null.
      act(() => {
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
        fireDrag(result.current.handleNodeDrag, sceneNode, 250, 300);
      });

      expect(result.current.dragState?.clientX).toBe(250);
      expect(result.current.dragState?.clientY).toBe(300);
    });

    it('does NOT update dragState for non-scene-block nodes', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const startNode: Node = {
        id: 'start',
        type: 'start',
        position: { x: 60, y: 200 },
        data: {},
      };

      act(() => {
        fireDrag(result.current.handleNodeDrag, startNode, 999, 999);
      });

      // dragState should remain null — not updated by non-scene events.
      expect(result.current.dragState).toBeNull();
    });
  });

  // ── handleNodeDragStop ───────────────────────────────────────────────────────

  describe('handleNodeDragStop', () => {
    it('clears dragState when drag ends', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const sceneNode = makeSceneNode('scene-1', 100);

      act(() => {
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
      });

      expect(result.current.dragState).not.toBeNull();

      act(() => {
        fireDragStop(result.current.handleNodeDragStop, sceneNode);
      });

      expect(result.current.dragState).toBeNull();
    });

    it('does NOT call setEdges when dropped node is far from all edge midpoints', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      // Two nodes with an edge between them — midpoint at (450, 200).
      const nodeA = makeSceneNode('a', 100, 200);
      const nodeB = makeSceneNode('b', 700, 200);
      const edgeAB = makeEdge('a', 'b');

      // Dropped node is placed far from the midpoint.
      const droppedNode = makeSceneNode('dropped', 0, 0);

      act(() => {
        result.current.syncRefs([nodeA, nodeB, droppedNode], [edgeAB]);
        fireDragStart(result.current.handleNodeDragStart, droppedNode);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      expect(setEdges).not.toHaveBeenCalled();
    });
  });
});
