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

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    const { result, rerender } = renderHook(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      {
        initialProps: {
          nodes: DEFAULT_NODES,
          edges: DEFAULT_EDGES,
        },
      },
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
    const { result, rerender } = renderHook(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      {
        initialProps: {
          nodes: DEFAULT_NODES,
          edges: DEFAULT_EDGES,
        },
      },
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

  it('saves again when only a scene node position changes', async () => {
    const scene = makeSceneNode('scene-position');
    const movedScene: Node = {
      ...scene,
      position: { x: scene.position.x + 120, y: scene.position.y + 40 },
    };

    const { result, rerender } = renderHook(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      {
        initialProps: {
          nodes: [makeStartNode(), scene],
          edges: DEFAULT_EDGES,
        },
      },
    );

    await act(async () => {
      await result.current.saveNow();
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);

    rerender({ nodes: [makeStartNode(), movedScene], edges: DEFAULT_EDGES });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(2);
    expect(saveStoryboard).toHaveBeenLastCalledWith(
      DRAFT_ID,
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: 'scene-position',
            positionX: 420,
            positionY: 240,
          }),
        ]),
      }),
    );
  });

  it('queues a second save when saveNow is called during an in-flight save', async () => {
    const firstSave = deferred<void>();
    vi.mocked(saveStoryboard)
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      {
        initialProps: {
          nodes: DEFAULT_NODES,
          edges: DEFAULT_EDGES,
        },
      },
    );

    const firstNodes = [...DEFAULT_NODES, makeSceneNode('scene-1')];
    rerender({ nodes: firstNodes, edges: DEFAULT_EDGES });

    void act(() => {
      void result.current.saveNow();
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);

    const secondNodes = [...DEFAULT_NODES, makeSceneNode('scene-2')];
    rerender({ nodes: secondNodes, edges: DEFAULT_EDGES });

    await act(async () => {
      await result.current.saveNow();
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve();
      await firstSave.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(2);
    expect(saveStoryboard).toHaveBeenLastCalledWith(
      DRAFT_ID,
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({ id: 'scene-2' }),
        ]),
      }),
    );
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
    const sceneBlock = scene.data.block as { videoPrompt: string | null };
    sceneBlock.videoPrompt = 'Slow dolly toward the desk while screens flicker.';
    const edge: Edge = {
      id: 'e1',
      source: 'start',
      target: 'scene-xyz',
    };

    const { result, rerender } = renderHook(
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
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: 'scene-xyz',
            videoPrompt: 'Slow dolly toward the desk while screens flicker.',
          }),
        ]),
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

  it('serializes music nodes to musicBlocks on a normal save', async () => {
    const scene = makeSceneNode('scene-with-preserved-music');
    const musicNode: Node = {
      id: 'music-1',
      type: 'music-block',
      position: { x: 120, y: 520 },
      data: {
        musicBlock: {
          id: 'music-1',
          draftId: DRAFT_ID,
          name: 'Opening music',
          sourceMode: 'generate_on_step3',
          prompt: 'Soft ambient pulse',
          compositionPlan: null,
          existingFileId: null,
          startSceneBlockId: scene.id,
          endSceneBlockId: scene.id,
          positionX: 40,
          positionY: 480,
          sortOrder: 0,
          volume: 0.8,
          fadeInS: 0,
          fadeOutS: 1,
          loopMode: 'trim',
          generationStatus: 'queued',
          generationJobId: 'job-1',
          outputFileId: null,
          errorMessage: null,
          createdAt: '2026-05-26T00:00:00Z',
          updatedAt: '2026-05-26T00:00:00Z',
        },
      },
    };
    const { result, rerender } = renderHook(
      ({ nodes, edges }) => useStoryboardAutosave(DRAFT_ID, nodes, edges),
      { initialProps: { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES } },
    );

    rerender({ nodes: [makeStartNode(), scene, musicNode], edges: DEFAULT_EDGES });

    await act(async () => {
      await result.current.saveNow();
    });

    const [, payload] = vi.mocked(saveStoryboard).mock.calls[0]!;
    expect(payload.blocks).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'music-1' })]));
    expect(payload.musicBlocks).toEqual([
      expect.objectContaining({
        id: 'music-1',
        positionX: 120,
        positionY: 520,
      }),
    ]);
    expect(payload.musicBlocks?.[0]).not.toHaveProperty('generationJobId');
  });
});
