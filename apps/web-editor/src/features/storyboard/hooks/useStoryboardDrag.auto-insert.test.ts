/**
 * Tests for useStoryboardDrag — auto-insert and UUID edge ID behaviour (FOLLOW-2).
 *
 * Covers:
 * - handleNodeDragStop: auto-inserts two edges with UUID v4 ids when node
 *   drops on edge midpoint
 * - handleNodeDragStop: generated edge IDs are distinct
 * - syncRefs: keeps refs up to date so dragStop uses the latest nodes/edges
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Edge } from '@xyflow/react';

import { useStoryboardDrag } from './useStoryboardDrag';
import {
  makeSceneNode,
  makeEdge,
  fireDragStart,
  fireDragStop,
  UUID_V4_REGEX,
} from './useStoryboardDrag.fixtures';

// ── auto-insert tests ──────────────────────────────────────────────────────────

describe('useStoryboardDrag — auto-insert (FOLLOW-2)', () => {
  describe('handleNodeDragStop', () => {
    it('auto-inserts two edges with UUID v4 ids when node drops near edge midpoint', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      // nodeA at (100, 200) with 220x120 → centre (210, 260)
      // nodeB at (700, 200) with 220x120 → centre (810, 260)
      // edge midpoint ≈ (510, 260)
      const nodeA = makeSceneNode('a', 100, 200, 220, 120);
      const nodeB = makeSceneNode('b', 700, 200, 220, 120);
      const edgeAB = makeEdge('a', 'b');

      // Dropped node placed exactly at midpoint:
      // node centre = position + measured/2 = (400+110, 200+60) = (510, 260)
      const droppedNode = makeSceneNode('dropped', 400, 200, 220, 120);

      act(() => {
        result.current.syncRefs([nodeA, nodeB, droppedNode], [edgeAB]);
        fireDragStart(result.current.handleNodeDragStart, droppedNode);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      // setEdges should have been called once.
      expect(setEdges).toHaveBeenCalledTimes(1);

      // Extract the new edges from the updater.
      const updater = setEdges.mock.calls[0][0] as (prev: Edge[]) => Edge[];
      const nextEdges = updater([edgeAB]);

      // Old edge removed; two new edges added.
      expect(nextEdges).toHaveLength(2);

      // Both new edge IDs must match strict RFC 4122 v4 UUID format.
      for (const edge of nextEdges) {
        expect(edge.id).toMatch(UUID_V4_REGEX);
      }

      // New edges must NOT use the old `edge-${source}-${target}` pattern.
      for (const edge of nextEdges) {
        expect(edge.id).not.toMatch(/^edge-/);
      }

      // First edge: source=a → target=dropped; second: source=dropped → target=b.
      const edgeAtoDropped = nextEdges.find(
        (e) => e.source === 'a' && e.target === 'dropped',
      );
      const edgeDroppedToB = nextEdges.find(
        (e) => e.source === 'dropped' && e.target === 'b',
      );

      expect(edgeAtoDropped).toBeTruthy();
      expect(edgeDroppedToB).toBeTruthy();
    });

    it('generates two distinct UUID v4 ids for the two new edges', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const nodeA = makeSceneNode('a', 100, 200, 220, 120);
      const nodeB = makeSceneNode('b', 700, 200, 220, 120);
      const edgeAB = makeEdge('a', 'b');
      const droppedNode = makeSceneNode('dropped', 400, 200, 220, 120);

      act(() => {
        result.current.syncRefs([nodeA, nodeB, droppedNode], [edgeAB]);
        fireDragStart(result.current.handleNodeDragStart, droppedNode);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      const updater = setEdges.mock.calls[0][0] as (prev: Edge[]) => Edge[];
      const nextEdges = updater([edgeAB]);

      expect(nextEdges).toHaveLength(2);
      expect(nextEdges[0].id).not.toBe(nextEdges[1].id);
    });
  });

  // ── syncRefs ─────────────────────────────────────────────────────────────────

  describe('syncRefs', () => {
    it('keeps refs up to date so dragStop uses the latest nodes/edges', () => {
      const setNodes = vi.fn();
      const setEdges = vi.fn();
      const pushSnapshot = vi.fn().mockResolvedValue(undefined);
      const saveNow = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow }));

      const nodeA = makeSceneNode('a', 100, 200, 220, 120);
      const nodeB = makeSceneNode('b', 700, 200, 220, 120);
      const edgeAB = makeEdge('a', 'b');
      const droppedNode = makeSceneNode('dropped', 400, 200, 220, 120);

      // First syncRefs with empty state.
      act(() => {
        result.current.syncRefs([], []);
      });

      // Then update with real nodes/edges before drag stop.
      act(() => {
        result.current.syncRefs([nodeA, nodeB, droppedNode], [edgeAB]);
        fireDragStart(result.current.handleNodeDragStart, droppedNode);
        fireDragStop(result.current.handleNodeDragStop, droppedNode);
      });

      // Auto-insert should have fired because the latest refs were used.
      expect(setEdges).toHaveBeenCalledTimes(1);
    });
  });
});
