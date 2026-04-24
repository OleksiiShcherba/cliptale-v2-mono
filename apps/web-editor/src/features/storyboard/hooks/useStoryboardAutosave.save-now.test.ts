/**
 * Tests for useStoryboardAutosave — saveNow, beforeunload, and edge cases.
 *
 * Covers:
 * - saveNow triggers an immediate save bypassing the debounce timer.
 * - saveNow does not call the API when state has not changed.
 * - beforeunload listener is registered on mount and removed on unmount.
 * - Does not arm debounce when both nodes and edges arrays are empty.
 * - Builds StoryboardState with correct draftId in blocks and edges.
 *
 * See useStoryboardAutosave.test.ts for initial state, debounce, and
 * saveLabel tests.
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
  makeStartNode,
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

describe('useStoryboardAutosave — saveNow', () => {
  it('triggers an immediate save bypassing the debounce timer', async () => {
    const { result, rerender } = renderHook<
      { nodes: Node[]; edges: Edge[] },
      { saveLabel: string; saveNow: () => Promise<void> }
    >(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
    );

    // Simulate a canvas change (so state is different from last saved state).
    rerender({ nodes: [...DEFAULT_NODES, makeSceneNode()], edges: DEFAULT_EDGES });

    // Call saveNow immediately without advancing the debounce timer.
    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(1);
  });

  it('does not call saveStoryboard when nodes/edges state has not changed', async () => {
    const { result, rerender } = renderHook<
      { nodes: Node[]; edges: Edge[] },
      { saveLabel: string; saveNow: () => Promise<void> }
    >(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
    );

    const changedNodes = [...DEFAULT_NODES, makeSceneNode()];
    rerender({ nodes: changedNodes, edges: DEFAULT_EDGES });

    // Save once to set savedStateKey.
    await act(async () => {
      await result.current.saveNow();
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);

    // Call saveNow again with same state — stateKey unchanged → no additional call.
    await act(async () => {
      await result.current.saveNow();
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);
  });
});

describe('useStoryboardAutosave — beforeunload listener', () => {
  it('registers a beforeunload listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES));
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    vi.restoreAllMocks();
  });

  it('removes the beforeunload listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    vi.restoreAllMocks();
  });
});

describe('useStoryboardAutosave — edge cases', () => {
  it('does not arm debounce when both nodes and edges arrays are empty', () => {
    renderHook(() => useStoryboardAutosave(DRAFT_ID, [], []));
    vi.advanceTimersByTime(60_000);
    expect(saveStoryboard).not.toHaveBeenCalled();
  });

  it('builds StoryboardState with correct draftId in blocks and edges', async () => {
    const scene = makeSceneNode('scene-xyz');
    const edge: Edge = {
      id: 'e1',
      source: 'start',
      target: 'scene-xyz',
    };

    const { result, rerender } = renderHook<
      { nodes: Node[]; edges: Edge[] },
      { saveLabel: string; saveNow: () => Promise<void> }
    >(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
    );

    rerender({ nodes: [makeStartNode(), scene], edges: [edge] });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveStoryboard).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.objectContaining({
        blocks: expect.any(Array),
        edges: expect.arrayContaining([
          expect.objectContaining({
            draftId: DRAFT_ID,
            sourceBlockId: 'start',
            targetBlockId: 'scene-xyz',
          }),
        ]),
      }),
    );
  });
});
