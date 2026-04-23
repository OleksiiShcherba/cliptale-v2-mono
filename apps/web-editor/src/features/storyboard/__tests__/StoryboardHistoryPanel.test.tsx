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
 * 7. Clicking Restore triggers saveStoryboard mock
 * 8. Close button calls onClose
 * 9. Panel title visible
 * 10. isLoading hides entry list
 *
 * `useStoryboardHistoryFetch` and `restoreFromSnapshot` are mocked via vi.mock.
 * `saveStoryboard` and `getSnapshot` are also mocked to isolate side-effects.
 * `window.confirm` is stubbed to return true so restore flow completes.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const {
  mockRestoreFromSnapshot,
  mockGetSnapshot,
  mockSaveStoryboard,
  mockUseStoryboardHistoryFetch,
} = vi.hoisted(() => ({
  mockRestoreFromSnapshot: vi.fn(),
  mockGetSnapshot: vi.fn(() => ({ nodes: [], edges: [], positions: {}, selectedBlockId: null })),
  mockSaveStoryboard: vi.fn(() => Promise.resolve()),
  mockUseStoryboardHistoryFetch: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistoryFetch', () => ({
  useStoryboardHistoryFetch: mockUseStoryboardHistoryFetch,
}));

vi.mock('@/features/storyboard/store/storyboard-store', () => ({
  restoreFromSnapshot: mockRestoreFromSnapshot,
  getSnapshot: mockGetSnapshot,
}));

vi.mock('@/features/storyboard/api', () => ({
  saveStoryboard: mockSaveStoryboard,
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

beforeEach(() => {
  vi.clearAllMocks();
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
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    expect(screen.getByTestId('history-loading')).toBeTruthy();
  });

  it('(2) renders error state when isError is true', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [],
      isLoading: false,
      isError: true,
    });
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    expect(screen.getByTestId('history-error')).toBeTruthy();
  });

  it('(3) renders empty state when entries is empty and not loading/error', () => {
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    expect(screen.getByTestId('history-empty')).toBeTruthy();
  });

  it('(4) renders N entries with timestamps', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [makeEntry(1), makeEntry(2), makeEntry(3)],
      isLoading: false,
      isError: false,
    });
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

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
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    const restoreButtons = screen.getAllByTestId('history-restore-button');
    expect(restoreButtons).toHaveLength(2);
  });

  it('(6) clicking Restore calls restoreFromSnapshot with the entry snapshot', async () => {
    const entry = makeEntry(1);
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [entry],
      isLoading: false,
      isError: false,
    });
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId('history-restore-button'));

    // Wait for the async handler to resolve.
    await vi.waitFor(() => {
      expect(mockRestoreFromSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  it('(7) clicking Restore triggers saveStoryboard after restore', async () => {
    const entry = makeEntry(1);
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [entry],
      isLoading: false,
      isError: false,
    });
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId('history-restore-button'));

    await vi.waitFor(() => {
      expect(mockSaveStoryboard).toHaveBeenCalledTimes(1);
      expect(mockSaveStoryboard).toHaveBeenCalledWith('d1', expect.any(Object));
    });
  });

  it('(8) close button calls onClose', () => {
    const onClose = vi.fn();
    render(<StoryboardHistoryPanel draftId="d1" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('history-close-button'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(9) panel title is visible', () => {
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    expect(screen.getByTestId('history-panel-title')).toBeTruthy();
    expect(screen.getByTestId('history-panel-title').textContent).toBe('History');
  });

  it('(10) isLoading hides entry list', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [makeEntry(1), makeEntry(2)],
      isLoading: true,
      isError: false,
    });
    render(<StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} />);

    // Loading indicator present.
    expect(screen.getByTestId('history-loading')).toBeTruthy();
    // Entry rows not rendered when loading.
    expect(screen.queryAllByTestId('history-entry-row')).toHaveLength(0);
  });
});
