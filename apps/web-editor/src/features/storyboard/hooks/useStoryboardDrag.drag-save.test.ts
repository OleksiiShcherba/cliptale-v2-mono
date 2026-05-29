/**
 * Tests for useStoryboardDrag — drag-stop save and history snapshot (SB-POLISH-1c).
 *
 * Covers:
 * - handleNodeDragStop: calls saveNow() exactly once when a scene-block is dropped
 * - handleNodeDragStop: calls pushSnapshot() exactly once when a scene-block is dropped
 * - handleNodeDragStop: calls saveNow/pushSnapshot for START/END nodes
 * - handleNodeDragStop: snapshot receives updated position (not the pre-drag position)
 * - handleNodeDragStop: snapshot receives node with opacity restored (not 0.3)
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardDrag } from './useStoryboardDrag';
import {
  makeSceneNode,
  makeMusicNode,
  fireDragStart,
  fireDragStop,
} from './useStoryboardDrag.fixtures';

// ── Save + snapshot on drag-stop ──────────────────────────────────────────────

describe('useStoryboardDrag — drag-stop save (SB-POLISH-1c)', () => {
  describe('handleNodeDragStop', () => {
    it.each([
      {
        label: 'scene block',
        node: {
          ...makeSceneNode('scene-1', 100, 200),
          style: { borderColor: 'red' },
        },
        droppedPosition: { x: 350, y: 280 },
      },
      {
        label: 'music block',
        node: {
          ...makeMusicNode(),
          style: { borderColor: 'blue' },
        },
        droppedPosition: { x: 280, y: 640 },
      },
      {
        label: 'START',
        node: {
          id: 'start',
          type: 'start',
          position: { x: 60, y: 200 },
          data: {},
          style: { borderColor: 'green' },
        } satisfies Node,
        droppedPosition: { x: 80, y: 220 },
      },
      {
        label: 'END',
        node: {
          id: 'end',
          type: 'end',
          position: { x: 900, y: 200 },
          data: {},
          style: { borderColor: 'purple' },
        } satisfies Node,
        droppedPosition: { x: 980, y: 240 },
      },
    ])('pushes restored style and final position for $label drops', ({ node, droppedPosition }) => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      const dimmedNode: Node = {
        ...node,
        style: { ...node.style, opacity: 0.3 },
      };
      const droppedNode: Node = {
        ...dimmedNode,
        position: droppedPosition,
      };

      act(() => {
        result.current.syncRefs([node], []);
        fireDragStart(result.current.handleNodeDragStart, node);
        result.current.syncRefs([dimmedNode], []);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      expect(pushSnapshot).toHaveBeenCalledTimes(1);
      const [snapshotNodes] = pushSnapshot.mock.calls[0] as [Node[], Edge[]];
      const snapshotNode = snapshotNodes.find((n) => n.id === node.id);

      expect(snapshotNode?.position).toEqual(droppedPosition);
      expect(snapshotNode?.position).not.toEqual(node.position);
      expect(snapshotNode?.style).toEqual(node.style);
      expect((snapshotNode?.style as { opacity?: number } | undefined)?.opacity).not.toBe(0.3);
    });

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

    it('calls saveNow when a START node is dropped', () => {
      vi.useFakeTimers();

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
        vi.runAllTimers();
      });

      vi.useRealTimers();

      expect(saveNow).toHaveBeenCalledTimes(1);
    });

    it.each([
      {
        label: 'START',
        node: {
          id: 'start',
          type: 'start',
          position: { x: 60, y: 200 },
          data: {},
          style: { opacity: 0.3 },
        } satisfies Node,
        droppedPosition: { x: 80, y: 220 },
      },
      {
        label: 'END',
        node: {
          id: 'end',
          type: 'end',
          position: { x: 900, y: 200 },
          data: {},
          style: { opacity: 0.3 },
        } satisfies Node,
        droppedPosition: { x: 980, y: 240 },
      },
    ])('persists $label position without changing edges', ({ node, droppedPosition }) => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }),
      );

      const currentEdges: Edge[] = [
        { id: 'edge-scene-1-scene-2', source: 'scene-1', target: 'scene-2' },
      ];
      const droppedNode: Node = {
        ...node,
        position: droppedPosition,
      };

      act(() => {
        result.current.syncRefs([node], currentEdges);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      expect(setEdges).not.toHaveBeenCalled();
      expect(pushSnapshot).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: node.id,
            position: droppedPosition,
          }),
        ]),
        currentEdges,
      );
    });
  });
});
