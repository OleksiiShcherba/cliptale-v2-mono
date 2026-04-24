/**
 * Unit tests for StoryboardHistoryPanel.
 *
 * Covers:
 * 1. Renders loading state
 * 2. Renders error state
 * 3. Renders empty state
 * 4. Renders N entries with timestamps
 * 5. Restore button present per entry
 * 6. Clicking Restore calls restoreFromSnapshot mock
 * 7. Clicking Restore calls onRestore with reconstructed nodes/edges from store
 * 8. Clicking Restore calls onClose after onRestore
 * 9. Clicking Restore does NOT fire when confirm returns false
 * 10. Close button calls onClose
 * 11. Panel title visible
 * 12. isLoading hides entry list
 *
 * `useStoryboardHistoryFetch`, `restoreFromSnapshot`, and `getSnapshot` are
 * mocked via vi.mock. `window.confirm` is stubbed so the restore flow completes
 * in all positive-path tests.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const {
  mockRestoreFromSnapshot,
  mockGetSnapshot,
  mockUseStoryboardHistoryFetch,
} = vi.hoisted(() => ({
  mockRestoreFromSnapshot: vi.fn(),
  mockGetSnapshot: vi.fn(() => ({
    nodes: [
      { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'START' } },
      { id: 'end-1', type: 'end', position: { x: 280, y: 0 }, data: { label: 'END' } },
    ],
    edges: [{ id: 'e1', source: 'start-1', target: 'end-1' }],
    positions: {},
    selectedBlockId: null,
  })),
  mockUseStoryboardHistoryFetch: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistoryFetch', () => ({
  useStoryboardHistoryFetch: mockUseStoryboardHistoryFetch,
}));

vi.mock('@/features/storyboard/store/storyboard-store', () => ({
  restoreFromSnapshot: mockRestoreFromSnapshot,
  getSnapshot: mockGetSnapshot,
}));

vi.mock('@/features/storyboard/store/storyboard-history-store', () => ({
  // CanvasSnapshot is a type — no runtime values needed.
}));

vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: (_date: Date) => '5m ago',
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { StoryboardHistoryPanel } from '@/features/storyboard/components/StoryboardHistoryPanel';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeEntry(id: number) {
  return {
    snapshot: { blocks: [], edges: [] },
    createdAt: new Date(2026, 3, 23, 12, id).toISOString(),
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let mockOnRestore: ReturnType<typeof vi.fn>;
let mockOnClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockOnRestore = vi.fn();
  mockOnClose = vi.fn();
  // Default: non-loading, no-error, no entries.
  mockUseStoryboardHistoryFetch.mockReturnValue({
    entries: [],
    isLoading: false,
    isError: false,
  });
  // Stub window.confirm to automatically confirm restores.
  vi.stubGlobal('confirm', vi.fn(() => true));
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StoryboardHistoryPanel', () => {
  it('(1) renders loading state when isLoading is true', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [],
      isLoading: true,
      isError: false,
    });
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    expect(screen.getByTestId('history-loading')).toBeTruthy();
  });

  it('(2) renders error state when isError is true', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [],
      isLoading: false,
      isError: true,
    });
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    expect(screen.getByTestId('history-error')).toBeTruthy();
  });

  it('(3) renders empty state when entries is empty and not loading/error', () => {
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    expect(screen.getByTestId('history-empty')).toBeTruthy();
  });

  it('(4) renders N entries with timestamps', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [makeEntry(1), makeEntry(2), makeEntry(3)],
      isLoading: false,
      isError: false,
    });
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    const rows = screen.getAllByTestId('history-entry-row');
    expect(rows).toHaveLength(3);
    // Each row shows a relative timestamp.
    const timestamps = screen.getAllByTestId('history-entry-timestamp');
    expect(timestamps).toHaveLength(3);
    timestamps.forEach((ts) => {
      expect(ts.textContent).toBe('5m ago');
    });
  });

  it('(5) Restore button is present for each entry', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [makeEntry(1), makeEntry(2)],
      isLoading: false,
      isError: false,
    });
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    const restoreButtons = screen.getAllByTestId('history-restore-button');
    expect(restoreButtons).toHaveLength(2);
  });

  it('(6) clicking Restore calls restoreFromSnapshot with the entry snapshot', () => {
    const entry = makeEntry(1);
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [entry],
      isLoading: false,
      isError: false,
    });
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    fireEvent.click(screen.getByTestId('history-restore-button'));

    expect(mockRestoreFromSnapshot).toHaveBeenCalledTimes(1);
    // snapshot is cast to CanvasSnapshot — entry.snapshot is the arg
    expect(mockRestoreFromSnapshot).toHaveBeenCalledWith(entry.snapshot);
  });

  it('(7) clicking Restore calls onRestore with nodes/edges from getSnapshot()', () => {
    const reconstructedNodes = [
      { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'START' } },
      { id: 'end-1', type: 'end', position: { x: 280, y: 0 }, data: { label: 'END' } },
    ];
    const reconstructedEdges = [{ id: 'e1', source: 'start-1', target: 'end-1' }];

    mockGetSnapshot.mockReturnValue({
      nodes: reconstructedNodes,
      edges: reconstructedEdges,
      positions: {},
      selectedBlockId: null,
    });

    const entry = makeEntry(1);
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [entry],
      isLoading: false,
      isError: false,
    });

    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    fireEvent.click(screen.getByTestId('history-restore-button'));

    expect(mockOnRestore).toHaveBeenCalledTimes(1);
    expect(mockOnRestore).toHaveBeenCalledWith(reconstructedNodes, reconstructedEdges);
  });

  it('(8) clicking Restore calls onClose after onRestore', () => {
    const callOrder: string[] = [];
    mockOnRestore.mockImplementation(() => { callOrder.push('onRestore'); });
    mockOnClose.mockImplementation(() => { callOrder.push('onClose'); });

    const entry = makeEntry(1);
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [entry],
      isLoading: false,
      isError: false,
    });

    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    fireEvent.click(screen.getByTestId('history-restore-button'));

    expect(callOrder).toEqual(['onRestore', 'onClose']);
  });

  it('(9) clicking Restore does nothing when confirm returns false', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));

    const entry = makeEntry(1);
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [entry],
      isLoading: false,
      isError: false,
    });

    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    fireEvent.click(screen.getByTestId('history-restore-button'));

    expect(mockRestoreFromSnapshot).not.toHaveBeenCalled();
    expect(mockOnRestore).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('(10) close button calls onClose', () => {
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    fireEvent.click(screen.getByTestId('history-close-button'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('(11) panel title is visible', () => {
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    expect(screen.getByTestId('history-panel-title')).toBeTruthy();
    expect(screen.getByTestId('history-panel-title').textContent).toBe('History');
  });

  it('(12) isLoading hides entry list', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [makeEntry(1), makeEntry(2)],
      isLoading: true,
      isError: false,
    });
    render(
      <StoryboardHistoryPanel draftId="d1" onClose={mockOnClose} onRestore={mockOnRestore} />,
    );

    // Loading indicator present.
    expect(screen.getByTestId('history-loading')).toBeTruthy();
    // Entry rows not rendered when loading.
    expect(screen.queryAllByTestId('history-entry-row')).toHaveLength(0);
  });
});
