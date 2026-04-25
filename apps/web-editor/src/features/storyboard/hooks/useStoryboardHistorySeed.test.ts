/**
 * Tests for useStoryboardHistorySeed.
 *
 * Covers:
 * - Seeds history and auto-restores most recent snapshot when canvas + history are loaded
 * - Does NOT seed when canvas is still loading
 * - Does NOT seed when history is still loading
 * - Does NOT seed when history entries are empty
 * - Seeds only once (guard prevents re-seeding on re-render)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockLoadServerHistory, mockRestoreFromSnapshot, mockGetSnapshot, mockHistoryEntries, mockIsHistoryLoading } =
  vi.hoisted(() => ({
    mockLoadServerHistory: vi.fn(),
    mockRestoreFromSnapshot: vi.fn(),
    mockGetSnapshot: vi.fn(() => ({ nodes: [{ id: 'n1' }], edges: [] })),
    mockHistoryEntries: [] as { snapshot: { blocks: unknown[]; edges: unknown[] }; createdAt: string }[],
    mockIsHistoryLoading: { value: false },
  }));

vi.mock('../store/storyboard-history-store', () => ({
  loadServerHistory: mockLoadServerHistory,
}));

vi.mock('../store/storyboard-store', () => ({
  restoreFromSnapshot: mockRestoreFromSnapshot,
  getSnapshot: mockGetSnapshot,
}));

vi.mock('./useStoryboardHistoryFetch', () => ({
  useStoryboardHistoryFetch: vi.fn(() => ({
    entries: mockHistoryEntries,
    isLoading: mockIsHistoryLoading.value,
    isError: false,
  })),
}));

import { useStoryboardHistorySeed } from './useStoryboardHistorySeed';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeEntry(createdAt: string) {
  return {
    snapshot: { blocks: [{ id: 'b1' }], edges: [] },
    createdAt,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardHistorySeed', () => {
  const handleRestore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset shared mutable defaults
    mockHistoryEntries.length = 0;
    mockIsHistoryLoading.value = false;
    mockGetSnapshot.mockReturnValue({ nodes: [{ id: 'n1' }], edges: [] });
  });

  it('should seed history and auto-restore when canvas and history are both loaded', () => {
    const entry = makeEntry('2026-04-25T10:00:00Z');
    mockHistoryEntries.push(entry);

    renderHook(() =>
      useStoryboardHistorySeed({
        draftId: 'draft-1',
        isCanvasLoading: false,
        handleRestore,
      }),
    );

    expect(mockLoadServerHistory).toHaveBeenCalledOnce();
    expect(mockLoadServerHistory).toHaveBeenCalledWith([entry]);

    expect(mockRestoreFromSnapshot).toHaveBeenCalledOnce();
    expect(mockRestoreFromSnapshot).toHaveBeenCalledWith(entry.snapshot);

    expect(handleRestore).toHaveBeenCalledOnce();
    const [restoredNodes, restoredEdges] = handleRestore.mock.calls[0] as [unknown[], unknown[]];
    expect(restoredNodes).toEqual([{ id: 'n1' }]);
    expect(restoredEdges).toEqual([]);
  });

  it('should restore the LAST (most recent) entry when multiple snapshots exist', () => {
    const first = makeEntry('2026-04-25T09:00:00Z');
    const second = makeEntry('2026-04-25T10:00:00Z');
    mockHistoryEntries.push(first, second);

    renderHook(() =>
      useStoryboardHistorySeed({
        draftId: 'draft-1',
        isCanvasLoading: false,
        handleRestore,
      }),
    );

    expect(mockRestoreFromSnapshot).toHaveBeenCalledWith(second.snapshot);
  });

  it('should NOT seed when canvas is still loading', () => {
    const entry = makeEntry('2026-04-25T10:00:00Z');
    mockHistoryEntries.push(entry);

    renderHook(() =>
      useStoryboardHistorySeed({
        draftId: 'draft-1',
        isCanvasLoading: true,
        handleRestore,
      }),
    );

    expect(mockLoadServerHistory).not.toHaveBeenCalled();
    expect(mockRestoreFromSnapshot).not.toHaveBeenCalled();
    expect(handleRestore).not.toHaveBeenCalled();
  });

  it('should NOT seed when history is still loading', () => {
    const entry = makeEntry('2026-04-25T10:00:00Z');
    mockHistoryEntries.push(entry);
    mockIsHistoryLoading.value = true;

    renderHook(() =>
      useStoryboardHistorySeed({
        draftId: 'draft-1',
        isCanvasLoading: false,
        handleRestore,
      }),
    );

    expect(mockLoadServerHistory).not.toHaveBeenCalled();
    expect(mockRestoreFromSnapshot).not.toHaveBeenCalled();
    expect(handleRestore).not.toHaveBeenCalled();
  });

  it('should NOT seed when history entries list is empty', () => {
    // mockHistoryEntries is empty by default after beforeEach

    renderHook(() =>
      useStoryboardHistorySeed({
        draftId: 'draft-1',
        isCanvasLoading: false,
        handleRestore,
      }),
    );

    expect(mockLoadServerHistory).not.toHaveBeenCalled();
    expect(mockRestoreFromSnapshot).not.toHaveBeenCalled();
    expect(handleRestore).not.toHaveBeenCalled();
  });
});
