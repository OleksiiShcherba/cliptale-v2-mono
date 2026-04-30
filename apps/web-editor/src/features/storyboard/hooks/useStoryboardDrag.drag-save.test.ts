/**
 * Tests for useStoryboardDrag — drag-stop save and history snapshot (SB-POLISH-1c).
 *
 * Covers:
 * - handleNodeDragStop: calls saveNow() exactly once when a scene-block is dropped
 * - handleNodeDragStop: calls pushSnapshot() exactly once when a scene-block is dropped
 * - handleNodeDragStop: does NOT call saveNow/pushSnapshot for non-scene-block nodes
 * - handleNodeDragStop: snapshot receives updated position (not the pre-drag position)
 * - handleNodeDragStop: snapshot receives node with opacity restored (not 0.3)
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardDrag } from './useStoryboardDrag';
import {
  makeSceneNode,
  makeEdge,
  fireDragStart,
  fireDragStop,
} from './useStoryboardDrag.fixtures';

// ── Save + snapshot on drag-stop ──────────────────────────────────────────────

describe('useStoryboardDrag — drag-stop save (SB-POLISH-1c)', () => {
  describe('handleNodeDragStop', () => {
    it('calls saveNow exactly once when a scene-block node is dropped', () => {
      // Install fake timers before the act so the setTimeout inside
      // handleNodeDragStop is captured and can be flushed synchronously.
      vi.useFakeTimers();

      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      const sceneNode = makeSceneNode('scene-1', 100);

      act(() => {
        result.current.syncRefs([sceneNode], []);
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
        fireDragStop(result.current.handleNodeDragStop, sceneNode);
        vi.runAllTimers();
      });

      vi.useRealTimers();

      expect(saveNow).toHaveBeenCalledTimes(1);
    });

    it('calls pushSnapshot exactly once when a scene-block node is dropped', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      const sceneNode = makeSceneNode('scene-1', 100);

      act(() => {
        result.current.syncRefs([sceneNode], []);
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
        fireDragStop(result.current.handleNodeDragStop, sceneNode);
      });

      expect(pushSnapshot).toHaveBeenCalledTimes(1);
    });

    it('does NOT call saveNow when a non-scene-block node is dropped', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      const startNode: Node = {
        id: 'start',
        type: 'start',
        position: { x: 60, y: 200 },
        data: {},
      };

      act(() => {
        result.current.syncRefs([startNode], []);
        // Fire drag stop directly — no drag start needed for non-scene node
        fireDragStop(result.current.handleNodeDragStop, startNode);
      });

      vi.useFakeTimers();
      act(() => { vi.runAllTimers(); });
      vi.useRealTimers();

      expect(saveNow).not.toHaveBeenCalled();
    });

    it('does NOT call pushSnapshot when a non-scene-block node is dropped', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      const startNode: Node = {
        id: 'start',
        type: 'start',
        position: { x: 60, y: 200 },
        data: {},
      };

      act(() => {
        result.current.syncRefs([startNode], []);
        fireDragStop(result.current.handleNodeDragStop, startNode);
      });

      expect(pushSnapshot).not.toHaveBeenCalled();
    });

    it('passes the updated (post-drop) position to pushSnapshot', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      // Node starts at x=100, y=200.
      const sceneNode = makeSceneNode('scene-1', 100, 200);

      // The "dropped" node that handleNodeDragStop receives has the final position.
      const droppedNode = makeSceneNode('scene-1', 350, 280);

      act(() => {
        result.current.syncRefs([sceneNode], []);
        fireDragStart(result.current.handleNodeDragStart, sceneNode);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      expect(pushSnapshot).toHaveBeenCalledTimes(1);
      const [snapshotNodes] = pushSnapshot.mock.calls[0] as [Node[], Edge[]];

      const snapshotNode = snapshotNodes.find((n) => n.id === 'scene-1');
      expect(snapshotNode?.position.x).toBe(350);
      expect(snapshotNode?.position.y).toBe(280);
    });

    it('passes nodes with opacity restored (not 0.3) to pushSnapshot', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      // Simulate a node with ghost opacity already set in the ref
      // (as would happen after handleNodeDragStart ran and the effect synced refs).
      const ghostNode: Node = {
        ...makeSceneNode('scene-1', 100, 200),
        style: { opacity: 0.3 },
      };

      act(() => {
        result.current.syncRefs([ghostNode], []);
        fireDragStop(result.current.handleNodeDragStop, makeSceneNode('scene-1', 100, 200));
      });

      expect(pushSnapshot).toHaveBeenCalledTimes(1);
      const [snapshotNodes] = pushSnapshot.mock.calls[0] as [Node[], Edge[]];

      const snapshotNode = snapshotNodes.find((n) => n.id === 'scene-1');
      // Opacity must be removed — not 0.3 in the snapshot.
      expect((snapshotNode?.style as { opacity?: number } | undefined)?.opacity).toBeUndefined();
    });
  });
});
