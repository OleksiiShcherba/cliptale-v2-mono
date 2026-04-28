/**
 * Tests for useStoryboardHistoryPush.
 *
 * Covers:
 * 1. Calls captureCanvasThumbnail() before pushing the snapshot.
 * 2. Includes thumbnail in the push() call when captureCanvasThumbnail returns a data URL.
 * 3. Pushes snapshot without thumbnail (no throw) when captureCanvasThumbnail returns null.
 * 4. Builds blocks correctly from scene-block nodes.
 * 5. Builds sentinel blocks from start/end nodes with correct shape.
 * 6. Builds edge list with draftId, sourceBlockId, targetBlockId.
 * 7. Returns a stable pushSnapshot reference when draftId is unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockCaptureCanvasThumbnail } = vi.hoisted(() => ({
  mockCaptureCanvasThumbnail: vi.fn<[], Promise<string | null>>(),
}));

vi.mock('../utils/captureCanvasThumbnail', () => ({
  captureCanvasThumbnail: mockCaptureCanvasThumbnail,
}));

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock('../store/storyboard-history-store', () => ({
  push: mockPush,
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

describe('useStoryboardHistoryPush — thumbnail capture', () => {
  it('(1) calls captureCanvasThumbnail() before calling push()', async () => {
    const callOrder: string[] = [];
    mockCaptureCanvasThumbnail.mockImplementation(async () => {
      callOrder.push('captureCanvasThumbnail');
      return 'data:image/jpeg;base64,abc';
    });
    mockPush.mockImplementation(() => {
      callOrder.push('push');
    });

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([], []);
    });

    expect(callOrder).toEqual(['captureCanvasThumbnail', 'push']);
  });

  it('(2) includes thumbnail in push() when captureCanvasThumbnail returns a data URL', async () => {
    const thumbnailDataUrl = 'data:image/jpeg;base64,xyz123';
    mockCaptureCanvasThumbnail.mockResolvedValue(thumbnailDataUrl);

    const sceneNode = makeSceneNode('scene-1');
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([sceneNode], []);
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    const snapshotArg = mockPush.mock.calls[0][0] as { thumbnail?: string };
    expect(snapshotArg.thumbnail).toBe(thumbnailDataUrl);
  });

  it('(3) pushes snapshot without thumbnail when captureCanvasThumbnail returns null', async () => {
    mockCaptureCanvasThumbnail.mockResolvedValue(null);

    const sceneNode = makeSceneNode('scene-1');
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([sceneNode], []);
    });

    // push() must be called even when thumbnail is null.
    expect(mockPush).toHaveBeenCalledTimes(1);
    const snapshotArg = mockPush.mock.calls[0][0] as { thumbnail?: string };
    // thumbnail should be absent from the snapshot — not undefined explicitly, just missing.
    expect('thumbnail' in snapshotArg).toBe(false);
  });

  it('(3b) does not throw when captureCanvasThumbnail returns null', async () => {
    mockCaptureCanvasThumbnail.mockResolvedValue(null);

    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await expect(
      act(async () => {
        await result.current.pushSnapshot([], []);
      }),
    ).resolves.not.toThrow();
  });
});

describe('useStoryboardHistoryPush — snapshot structure', () => {
  beforeEach(() => {
    mockCaptureCanvasThumbnail.mockResolvedValue(null);
  });

  it('(4) extracts scene block data from scene-block nodes', async () => {
    const sceneNode = makeSceneNode('scene-1', 150, 250);
    const { result } = renderHook(() => useStoryboardHistoryPush(DRAFT_ID));

    await act(async () => {
      await result.current.pushSnapshot([sceneNode], []);
    });

    const snapshot = mockPush.mock.calls[0][0] as {
      blocks: Array<{ id: string; blockType: string }>;
    };
    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.blocks[0].id).toBe('scene-1');
    expect(snapshot.blocks[0].blockType).toBe('scene');
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
