/**
 * Tests for useStoryboardHistorySeed.
 *
 * Verifies that the hook:
 * 1. Does nothing while the history fetch is still loading.
 * 2. Does nothing when there are no history entries.
 * 3. Calls restoreFromSnapshot with the most recent (last) entry's snapshot.
 * 4. Calls handleRestore with { skipSave: true } — NOT calling saveNow.
 * 5. Fires at most once per mount (hasSeeded guard prevents repeated calls).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardHistorySeed } from './useStoryboardHistorySeed';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const {
  mockUseStoryboardHistoryFetch,
  mockRestoreFromSnapshot,
  mockGetSnapshot,
} = vi.hoisted(() => ({
  mockUseStoryboardHistoryFetch: vi.fn(),
  mockRestoreFromSnapshot: vi.fn(),
  mockGetSnapshot: vi.fn(),
}));

vi.mock('./useStoryboardHistoryFetch', () => ({
  useStoryboardHistoryFetch: mockUseStoryboardHistoryFetch,
}));

vi.mock('../store/storyboard-store', () => ({
  restoreFromSnapshot: mockRestoreFromSnapshot,
  getSnapshot: mockGetSnapshot,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const STALE_BLOCK = {
  id: 'start-1',
  draftId: 'draft-1',
  blockType: 'start' as const,
  name: 'START',
  prompt: null,
  durationS: 0,
  positionX: 0,
  positionY: 0,
  sortOrder: 0,
  style: null,
  createdAt: '',
  updatedAt: '',
  mediaItems: [],
};

const SCENE_BLOCK = {
  id: 'scene-1',
  draftId: 'draft-1',
  blockType: 'scene' as const,
  name: 'Scene 1',
  prompt: 'A scene',
  durationS: 5,
  positionX: 200,
  positionY: 200,
  sortOrder: 1,
  style: null,
  createdAt: '',
  updatedAt: '',
  mediaItems: [],
};

const OLDER_SNAPSHOT = {
  snapshot: { blocks: [STALE_BLOCK], edges: [] },
  createdAt: '2024-01-01T10:00:00Z',
};

const LATEST_SNAPSHOT = {
  snapshot: { blocks: [STALE_BLOCK, SCENE_BLOCK], edges: [] },
  createdAt: '2024-01-01T12:00:00Z',
};

const RESTORED_NODES: Node[] = [
  { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'START' } },
  { id: 'scene-1', type: 'scene-block', position: { x: 200, y: 200 }, data: { block: SCENE_BLOCK, onRemove: () => undefined } },
];
const RESTORED_EDGES: Edge[] = [];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardHistorySeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSnapshot.mockReturnValue({ nodes: RESTORED_NODES, edges: RESTORED_EDGES });
  });

  it('(1) does nothing while the history fetch is loading', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({ entries: [], isLoading: true, isError: false });

    const handleRestore = vi.fn();
    renderHook(() => useStoryboardHistorySeed({ draftId: 'draft-1', handleRestore }));

    expect(mockRestoreFromSnapshot).not.toHaveBeenCalled();
    expect(handleRestore).not.toHaveBeenCalled();
  });

  it('(2) does nothing when there are no history entries', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({ entries: [], isLoading: false, isError: false });

    const handleRestore = vi.fn();
    renderHook(() => useStoryboardHistorySeed({ draftId: 'draft-1', handleRestore }));

    expect(mockRestoreFromSnapshot).not.toHaveBeenCalled();
    expect(handleRestore).not.toHaveBeenCalled();
  });

  it('(3) calls restoreFromSnapshot with the LAST (most recent) entry snapshot', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [OLDER_SNAPSHOT, LATEST_SNAPSHOT],
      isLoading: false,
      isError: false,
    });

    const handleRestore = vi.fn();
    renderHook(() => useStoryboardHistorySeed({ draftId: 'draft-1', handleRestore }));

    expect(mockRestoreFromSnapshot).toHaveBeenCalledTimes(1);
    // Should have used the latest snapshot, not the older one.
    expect(mockRestoreFromSnapshot).toHaveBeenCalledWith(LATEST_SNAPSHOT.snapshot);
  });

  it('(4) calls handleRestore with { skipSave: true } — saveNow must NOT be called', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [LATEST_SNAPSHOT],
      isLoading: false,
      isError: false,
    });

    const handleRestore = vi.fn();
    renderHook(() => useStoryboardHistorySeed({ draftId: 'draft-1', handleRestore }));

    expect(handleRestore).toHaveBeenCalledTimes(1);
    const [, , options] = handleRestore.mock.calls[0] as [Node[], Edge[], { skipSave?: boolean }];
    expect(options?.skipSave).toBe(true);
  });

  it('(4b) passes the nodes and edges from getSnapshot to handleRestore', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [LATEST_SNAPSHOT],
      isLoading: false,
      isError: false,
    });

    const handleRestore = vi.fn();
    renderHook(() => useStoryboardHistorySeed({ draftId: 'draft-1', handleRestore }));

    expect(handleRestore).toHaveBeenCalledTimes(1);
    const [nodes, edges] = handleRestore.mock.calls[0] as [Node[], Edge[]];
    expect(nodes).toBe(RESTORED_NODES);
    expect(edges).toBe(RESTORED_EDGES);
  });

  it('(5) only seeds once — subsequent entry updates do not trigger another restore', () => {
    // First render: loading
    mockUseStoryboardHistoryFetch.mockReturnValue({ entries: [], isLoading: true, isError: false });

    const handleRestore = vi.fn();
    const { rerender } = renderHook(() =>
      useStoryboardHistorySeed({ draftId: 'draft-1', handleRestore }),
    );

    // Simulate entries becoming available (fetch resolves).
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [LATEST_SNAPSHOT],
      isLoading: false,
      isError: false,
    });
    rerender();

    expect(handleRestore).toHaveBeenCalledTimes(1);

    // Another re-render (e.g. new entries arrive later) must NOT re-seed.
    const EXTRA_SNAPSHOT = { snapshot: { blocks: [STALE_BLOCK], edges: [] }, createdAt: '2024-01-02T00:00:00Z' };
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [LATEST_SNAPSHOT, EXTRA_SNAPSHOT],
      isLoading: false,
      isError: false,
    });
    rerender();

    // Still only called once.
    expect(handleRestore).toHaveBeenCalledTimes(1);
  });
});
