/**
 * Tests for useStoryboardKnifeTool — core behavior.
 *
 * Covers:
 * - isKnifeActive becomes true when Ctrl keydown fires alone.
 * - isKnifeActive becomes true when Meta keydown fires alone.
 * - isKnifeActive becomes false when a non-modifier key (e.g. Z) is pressed
 *   while Ctrl is held (so Ctrl+Z does NOT enter knife mode).
 * - isKnifeActive becomes false on Ctrl keyup.
 * - isKnifeActive becomes false on Meta keyup.
 * - isKnifeActive does NOT become true when a non-modifier key without Ctrl/Meta is pressed.
 * - cutEdge removes the target edge: setEdges is called with an updater that
 *   returns the array minus the deleted edge.
 * - cutEdge calls pushSnapshot once with the current nodes and the post-cut edges.
 * - cutEdge schedules saveNow via setTimeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardKnifeTool } from './useStoryboardKnifeTool';
import { makeNode, makeEdge, fireKeyDown, fireKeyUp } from './useStoryboardKnifeTool.fixtures';

// ── isKnifeActive ──────────────────────────────────────────────────────────────

describe('useStoryboardKnifeTool — isKnifeActive', () => {
  it('becomes true when Ctrl is pressed alone', () => {
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    expect(result.current.isKnifeActive).toBe(false);

    act(() => {
      fireKeyDown('Control', true, false);
    });

    expect(result.current.isKnifeActive).toBe(true);
  });

  it('becomes true when Meta is pressed alone', () => {
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      fireKeyDown('Meta', false, true);
    });

    expect(result.current.isKnifeActive).toBe(true);
  });

  it('becomes false when a non-modifier key is pressed while Ctrl is held (Ctrl+Z does NOT enter knife mode)', () => {
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    // First, activate knife mode via Ctrl.
    act(() => {
      fireKeyDown('Control', true, false);
    });
    expect(result.current.isKnifeActive).toBe(true);

    // Now press Z while Ctrl is still held — should exit knife mode.
    act(() => {
      fireKeyDown('z', true, false);
    });
    expect(result.current.isKnifeActive).toBe(false);
  });

  it('becomes false when Ctrl key is released', () => {
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      fireKeyDown('Control', true, false);
    });
    expect(result.current.isKnifeActive).toBe(true);

    act(() => {
      fireKeyUp('Control');
    });
    expect(result.current.isKnifeActive).toBe(false);
  });

  it('becomes false when Meta key is released', () => {
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      fireKeyDown('Meta', false, true);
    });
    expect(result.current.isKnifeActive).toBe(true);

    act(() => {
      fireKeyUp('Meta');
    });
    expect(result.current.isKnifeActive).toBe(false);
  });

  it('does NOT become true when a non-modifier key without Ctrl/Meta is pressed', () => {
    const setEdges = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      fireKeyDown('a', false, false);
    });
    expect(result.current.isKnifeActive).toBe(false);
  });
});

// ── cutEdge ────────────────────────────────────────────────────────────────────

describe('useStoryboardKnifeTool — cutEdge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls setEdges with an updater that removes the target edge', () => {
    const e1 = makeEdge('e1');
    const e2 = makeEdge('e2', 'b', 'c');
    const existingEdges = [e1, e2];

    // Capture the updater function passed to setEdges.
    let capturedUpdater: ((prev: Edge[]) => Edge[]) | null = null;
    const setEdges = vi.fn((updater: React.SetStateAction<Edge[]>) => {
      if (typeof updater === 'function') {
        capturedUpdater = updater as (prev: Edge[]) => Edge[];
      }
    }) as unknown as React.Dispatch<React.SetStateAction<Edge[]>>;

    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      result.current.cutEdge('e1');
    });

    expect(setEdges).toHaveBeenCalledTimes(1);

    // Verify the updater removes only the 'e1' edge.
    expect(capturedUpdater).not.toBeNull();
    const resultEdges = capturedUpdater!(existingEdges);
    expect(resultEdges).toHaveLength(1);
    expect(resultEdges[0].id).toBe('e2');
  });

  it('calls pushSnapshot once after cutting an edge', () => {
    const node1 = makeNode('n1');
    const edge1 = makeEdge('e1');

    const setEdges = vi.fn((updater: React.SetStateAction<Edge[]>) => {
      // Simulate the state update so edgesAfterCut is computed.
      if (typeof updater === 'function') {
        (updater as (prev: Edge[]) => Edge[])([edge1]);
      }
    }) as unknown as React.Dispatch<React.SetStateAction<Edge[]>>;

    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [node1],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      result.current.cutEdge('e1');
    });

    expect(pushSnapshot).toHaveBeenCalledTimes(1);
    // First arg is nodes, second is the post-cut edges (empty — e1 removed).
    const [calledNodes, calledEdges] = pushSnapshot.mock.calls[0] as [Node[], Edge[]];
    expect(calledNodes).toEqual([node1]);
    // e1 is removed; result is empty array.
    expect(calledEdges).toEqual([]);
  });

  it('schedules saveNow via setTimeout after cutting an edge', () => {
    const setEdges = vi.fn() as unknown as React.Dispatch<React.SetStateAction<Edge[]>>;
    const pushSnapshot = vi.fn().mockResolvedValue(undefined);
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges,
        pushSnapshot,
        saveNow,
      }),
    );

    act(() => {
      result.current.cutEdge('e1');
    });

    // saveNow must not be called synchronously.
    expect(saveNow).not.toHaveBeenCalled();

    // After the setTimeout fires, saveNow should have been called once.
    act(() => {
      vi.runAllTimers();
    });
    expect(saveNow).toHaveBeenCalledTimes(1);
  });
});
