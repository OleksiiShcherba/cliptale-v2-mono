/**
 * Tests for useStoryboardHistoryPush (two-tier saving, storyboard-autosave-checkpoints).
 *
 * Covers:
 * 1-3. pushSnapshot is an IN-MEMORY undo push only (AC-02): no capture, no
 *      history-cache writes, no server call.
 * 4. Builds blocks correctly from scene-block nodes.
 * 5. Builds sentinel blocks from start/end nodes with correct shape.
 * 6. Builds edge list with draftId, sourceBlockId, targetBlockId.
 * 7-8. Positions captured; stable references.
 * 9+. pushCheckpoint — the checkpoint push client (capture + ONE POST,
 *     retry, inFlight guard, cache invalidation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const {
  mockCaptureCanvasThumbnail,
  mockCaptureWithFallback,
  mockSetQueryData,
  mockInvalidateQueries,
  mockQueryClient,
} = vi.hoisted(() => {
  const setQueryData = vi.fn();
  const invalidateQueries = vi.fn();
  return {
    mockCaptureCanvasThumbnail: vi.fn<[], Promise<string | null>>(),
    mockCaptureWithFallback: vi.fn<
      [],
      Promise<{ kind: 'screenshot'; dataUrl: string } | { kind: 'minimap' }>
    >(),
    mockSetQueryData: setQueryData,
    mockInvalidateQueries: invalidateQueries,
    mockQueryClient: { setQueryData, invalidateQueries },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

vi.mock('../utils/captureCanvasThumbnail', () => ({
  captureCanvasThumbnail: mockCaptureCanvasThumbnail,
  captureCanvasThumbnailWithFallback: mockCaptureWithFallback,
  CAPTURE_TIMEOUT_MS: 5_000,
}));

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock('../store/storyboard-history-store', () => ({
  push: mockPush,
}));

const { mockPushCheckpointSnapshot } = vi.hoisted(() => ({
  mockPushCheckpointSnapshot: vi.fn<
    [string, { thumbnail?: string }, string],
    Promise<void>
  >(),
}));

// Full module mock — the hook only needs pushCheckpointSnapshot at runtime
// (its other imports from the api module are type-only and erased).
vi.mock('../api', () => ({
  pushCheckpointSnapshot: mockPushCheckpointSnapshot,
}));

import { useStoryboardHistoryPush } from './useStoryboardHistoryPush';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DRAFT_ID = 'draft-abc';

function makeSceneNode(id: string, x = 100, y = 200): Node {
  return {
    id,
    type: 'scene-block',
    position: { x, y },
    data: {
      block: {
        id,
        draftId: DRAFT_ID,
        blockType: 'scene' as const,
        name: 'Scene 1',
        prompt: null,
        videoPrompt: null,
        durationS: 5,
        positionX: x,
        positionY: y,
        sortOrder: 1,
        style: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        mediaItems: [],
      },
    },
  };
}

function makeStartNode(id = 'start-node'): Node {
  return {
    id,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { label: 'START' },
    draggable: true,
    deletable: false,
  };
}

function makeEndNode(id = 'end-node'): Node {
  return {
    id,
    type: 'end',
    position: { x: 600, y: 0 },
    data: { label: 'END' },
    draggable: true,
    deletable: false,
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardHistoryPush — per-change undo push (AC-02)', () => {
  it('(1) pushes the built snapshot onto the in-memory undo stack', async () => {
    const sceneNode = makeSceneNode('scene-1');
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([sceneNode], []);
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    const snapshotArg = mockPush.mock.calls[0][0] as {
      blocks: Array<{ id: string }>;
      thumbnail?: string;
    };
    expect(snapshotArg.blocks[0]).toMatchObject({ id: 'scene-1', blockType: 'scene' });
    // No capture on the lightweight path — the snapshot never carries a thumbnail.
    expect('thumbnail' in snapshotArg).toBe(false);
  });

  it('(2) never captures a screenshot on the per-change path', async () => {
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([], []);
    });

    expect(mockCaptureCanvasThumbnail).not.toHaveBeenCalled();
    expect(mockCaptureWithFallback).not.toHaveBeenCalled();
  });

  it('(3) never touches the history query cache (server checkpoints only)', async () => {
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([makeSceneNode('scene-1')], []);
    });

    expect(mockSetQueryData).not.toHaveBeenCalled();
    expect(mockPushCheckpointSnapshot).not.toHaveBeenCalled();
  });
});

describe('useStoryboardHistoryPush — snapshot structure', () => {
  beforeEach(() => {
    mockCaptureCanvasThumbnail.mockResolvedValue(null);
  });

  it('(4) extracts scene block data from scene-block nodes', async () => {
    const sceneNode = makeSceneNode('scene-1', 150, 250);
    const sceneBlock = sceneNode.data.block as { videoPrompt: string | null };
    sceneBlock.videoPrompt = 'Tilt down as the character enters the frame.';
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([sceneNode], []);
    });

    const snapshot = mockPush.mock.calls[0][0] as {
      blocks: Array<{ id: string; blockType: string; videoPrompt: string | null }>;
    };
    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.blocks[0].id).toBe('scene-1');
    expect(snapshot.blocks[0].blockType).toBe('scene');
    expect(snapshot.blocks[0].videoPrompt).toBe('Tilt down as the character enters the frame.');
  });

  it('(5) builds sentinel blocks from start and end nodes', async () => {
    const startNode = makeStartNode('start-1');
    const endNode = makeEndNode('end-1');
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([startNode, endNode], []);
    });

    const snapshot = mockPush.mock.calls[0][0] as {
      blocks: Array<{ id: string; blockType: string; draftId: string }>;
    };
    const startBlock = snapshot.blocks.find((b) => b.id === 'start-1');
    const endBlock = snapshot.blocks.find((b) => b.id === 'end-1');

    expect(startBlock).toBeDefined();
    expect(startBlock?.blockType).toBe('start');
    expect(startBlock?.draftId).toBe(DRAFT_ID);

    expect(endBlock).toBeDefined();
    expect(endBlock?.blockType).toBe('end');
    expect(endBlock?.draftId).toBe(DRAFT_ID);
  });

  it('(6) builds edge list with draftId, sourceBlockId, targetBlockId', async () => {
    const edge = makeEdge('edge-1', 'start-1', 'scene-1');
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([], [edge]);
    });

    const snapshot = mockPush.mock.calls[0][0] as {
      edges: Array<{ id: string; draftId: string; sourceBlockId: string; targetBlockId: string }>;
    };
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.edges[0].id).toBe('edge-1');
    expect(snapshot.edges[0].draftId).toBe(DRAFT_ID);
    expect(snapshot.edges[0].sourceBlockId).toBe('start-1');
    expect(snapshot.edges[0].targetBlockId).toBe('scene-1');
  });

  it('(7) records node positions in the positions map', async () => {
    const sceneNode = makeSceneNode('scene-1', 150, 250);
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([sceneNode], []);
    });

    const snapshot = mockPush.mock.calls[0][0] as {
      positions: Record<string, { x: number; y: number }>;
    };
    expect(snapshot.positions['scene-1']).toEqual({ x: 150, y: 250 });
  });
});

describe('useStoryboardHistoryPush — stability', () => {
  it('(8) returns a stable pushSnapshot reference when draftId does not change', () => {
    mockCaptureCanvasThumbnail.mockResolvedValue(null);

    const { result, rerender } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    const firstRef = result.current.pushSnapshot;
    rerender();
    expect(result.current.pushSnapshot).toBe(firstRef);
  });
});

// ── Checkpoint push client (storyboard-autosave-checkpoints T9, AC-03 / AC-04) ──

describe('useStoryboardHistoryPush — pushCheckpoint', () => {
  it('successful capture → one POST with previewKind screenshot and dataUrl inside snapshot', async () => {
    mockCaptureWithFallback.mockResolvedValue({
      kind: 'screenshot',
      dataUrl: 'data:image/jpeg;base64,shot',
    });
    mockPushCheckpointSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.pushCheckpoint([makeSceneNode('s1')], []);
    });

    expect(ok).toBe(true);
    expect(mockPushCheckpointSnapshot).toHaveBeenCalledTimes(1);
    const [draftArg, snapshotArg, previewKindArg] =
      mockPushCheckpointSnapshot.mock.calls[0] as [string, { thumbnail?: string }, string];
    expect(draftArg).toBe(DRAFT_ID);
    expect(previewKindArg).toBe('screenshot');
    expect(snapshotArg.thumbnail).toBe('data:image/jpeg;base64,shot');
  });

  it('capture fallback → push still happens with previewKind minimap and no dataUrl (AC-04)', async () => {
    mockCaptureWithFallback.mockResolvedValue({ kind: 'minimap' });
    mockPushCheckpointSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushCheckpoint([makeSceneNode('s1')], []);
    });

    expect(mockPushCheckpointSnapshot).toHaveBeenCalledTimes(1);
    const [, snapshotArg, previewKindArg] =
      mockPushCheckpointSnapshot.mock.calls[0] as [string, { thumbnail?: string }, string];
    expect(previewKindArg).toBe('minimap');
    expect(snapshotArg.thumbnail).toBeUndefined();
  });

  it('POST failure → visible checkpointError; retryCheckpoint succeeds and clears it', async () => {
    mockCaptureWithFallback.mockResolvedValue({ kind: 'minimap' });
    mockPushCheckpointSnapshot.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.pushCheckpoint([], []);
    });
    expect(ok).toBe(false);
    expect(result.current.checkpointError).toBe(true);

    mockPushCheckpointSnapshot.mockResolvedValueOnce(undefined);
    await act(async () => {
      ok = await result.current.retryCheckpoint();
    });
    expect(ok).toBe(true);
    expect(result.current.checkpointError).toBe(false);
    // The retry re-sends the same failed body — capture runs once overall.
    expect(mockCaptureWithFallback).toHaveBeenCalledTimes(1);
    expect(mockPushCheckpointSnapshot).toHaveBeenCalledTimes(2);
  });

  it('invalidates the history query key after a successful push', async () => {
    mockCaptureWithFallback.mockResolvedValue({ kind: 'minimap' });
    mockPushCheckpointSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushCheckpoint([], []);
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['storyboard-history', DRAFT_ID],
    });
  });

  it('does NOT invalidate the history key on failure', async () => {
    mockCaptureWithFallback.mockResolvedValue({ kind: 'minimap' });
    mockPushCheckpointSnapshot.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushCheckpoint([], []);
    });

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it('inFlight is true during the push and false after; concurrent push is rejected', async () => {
    let resolveCapture!: (r: { kind: 'minimap' }) => void;
    mockCaptureWithFallback.mockImplementation(
      () => new Promise((resolve) => { resolveCapture = resolve; }),
    );
    mockPushCheckpointSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));
    expect(result.current.inFlight).toBe(false);

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.pushCheckpoint([], []);
    });
    expect(result.current.inFlight).toBe(true);

    // A second push while in flight is refused (double-save guard source).
    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.pushCheckpoint([], []);
    });
    expect(second).toBe(false);
    expect(mockCaptureWithFallback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCapture({ kind: 'minimap' });
      await pending;
    });
    expect(result.current.inFlight).toBe(false);
    expect(mockPushCheckpointSnapshot).toHaveBeenCalledTimes(1);
  });
});
