/**
 * Tests for useStoryboardAutosave — primary group.
 *
 * Covers:
 * - saveLabel shows "—" on initial render.
 * - Does NOT call the API on mount when nodes/edges are empty.
 * - Calls PUT /storyboards/:draftId after 5s debounce when nodes/edges change.
 * - Multiple changes within 5s collapse into a single API call.
 * - Does NOT call the API again if state has not changed since last save.
 * - saveLabel shows "Saving…" during save, "Saved just now" after save.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Node, Edge } from '@xyflow/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  saveStoryboard: vi.fn().mockResolvedValue(undefined),
}));

import { useStoryboardAutosave } from './useStoryboardAutosave';
import { saveStoryboard } from '../api';
import {
  DRAFT_ID,
  DEFAULT_NODES,
  DEFAULT_EDGES,
  makeSceneNode,
} from './useStoryboardAutosave.fixtures';

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveStoryboard).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardAutosave', () => {
  describe('initial state', () => {
    it('returns saveLabel "—" before any save', () => {
      const { result } = renderHook(() =>
        useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
      );
      expect(result.current.saveLabel).toBe('—');
    });

    it('does NOT call saveStoryboard on mount when nodes is empty', () => {
      renderHook(() => useStoryboardAutosave(DRAFT_ID, [], []));
      vi.advanceTimersByTime(5_001);
      expect(saveStoryboard).not.toHaveBeenCalled();
    });
  });

  describe('debounced save after state change', () => {
    it('calls saveStoryboard once after 5s when nodes change', async () => {
      const { rerender } = renderHook<
        { nodes: Node[]; edges: Edge[] },
        void
      >(
        ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
        { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
      );

      // Simulate canvas adding a new scene node.
      const updatedNodes = [...DEFAULT_NODES, makeSceneNode()];
      rerender({ nodes: updatedNodes, edges: DEFAULT_EDGES });

      // Not yet called — debounce hasn't fired.
      expect(saveStoryboard).not.toHaveBeenCalled();

      // Advance timers past the 5s debounce.
      await act(async () => {
        vi.advanceTimersByTime(5_001);
        await Promise.resolve();
      });

      expect(saveStoryboard).toHaveBeenCalledTimes(1);
      expect(saveStoryboard).toHaveBeenCalledWith(DRAFT_ID, expect.any(Object));
    });

    it('collapses multiple rapid re-renders within 5s into a single API call', async () => {
      const { rerender } = renderHook<
        { nodes: Node[]; edges: Edge[] },
        void
      >(
        ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
        { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
      );

      // Simulate three rapid changes within 30s.
      rerender({ nodes: [...DEFAULT_NODES, makeSceneNode('s1')], edges: DEFAULT_EDGES });
      rerender({ nodes: [...DEFAULT_NODES, makeSceneNode('s1'), makeSceneNode('s2')], edges: DEFAULT_EDGES });
      rerender({ nodes: [...DEFAULT_NODES, makeSceneNode('s1'), makeSceneNode('s2'), makeSceneNode('s3')], edges: DEFAULT_EDGES });

      await act(async () => {
        vi.advanceTimersByTime(5_001);
        await Promise.resolve();
      });

      // Should be called exactly once despite three rapid emissions.
      expect(saveStoryboard).toHaveBeenCalledTimes(1);
    });

    it('does NOT call saveStoryboard again if state has not changed since last save', async () => {
      const { rerender } = renderHook<
        { nodes: Node[]; edges: Edge[] },
        void
      >(
        ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
        { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
      );

      const updatedNodes = [...DEFAULT_NODES, makeSceneNode()];
      // First change → first save.
      rerender({ nodes: updatedNodes, edges: DEFAULT_EDGES });
      await act(async () => {
        vi.advanceTimersByTime(5_001);
        await Promise.resolve();
      });
      expect(saveStoryboard).toHaveBeenCalledTimes(1);

      // Re-render with the exact same nodes/edges reference — debounce fires again
      // but stateKey is identical → no additional API call.
      rerender({ nodes: updatedNodes, edges: DEFAULT_EDGES });
      await act(async () => {
        vi.advanceTimersByTime(5_001);
        await Promise.resolve();
      });

      // Still only one call because the stateKey didn't change.
      expect(saveStoryboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveLabel updates', () => {
    it('shows "Saving…" during an in-progress save', async () => {
      // Make saveStoryboard never resolve so we can observe the "Saving…" state.
      vi.mocked(saveStoryboard).mockImplementation(() => new Promise(() => undefined));

      const { result, rerender } = renderHook<
        { nodes: Node[]; edges: Edge[] },
        { saveLabel: string; saveNow: () => Promise<void> }
      >(
        ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
        { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
      );

      rerender({ nodes: [...DEFAULT_NODES, makeSceneNode()], edges: DEFAULT_EDGES });

      await act(async () => {
        vi.advanceTimersByTime(5_001);
        await Promise.resolve();
      });

      expect(result.current.saveLabel).toBe('Saving…');
    });

    it('shows "Saved just now" immediately after a successful save', async () => {
      const { result, rerender } = renderHook<
        { nodes: Node[]; edges: Edge[] },
        { saveLabel: string; saveNow: () => Promise<void> }
      >(
        ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
        { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
      );

      rerender({ nodes: [...DEFAULT_NODES, makeSceneNode()], edges: DEFAULT_EDGES });

      await act(async () => {
        vi.advanceTimersByTime(5_001);
        await Promise.resolve();
        await Promise.resolve(); // additional flush for state updates
      });

      expect(result.current.saveLabel).toBe('Saved just now');
    });
  });
});
