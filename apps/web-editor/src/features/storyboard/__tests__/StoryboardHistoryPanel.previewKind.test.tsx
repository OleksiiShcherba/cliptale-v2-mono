/**
 * Tests for HistoryEntryRow previewKind-driven rendering
 * (storyboard-autosave-checkpoints T12, AC-08 / AC-04).
 *
 * The server now exposes previewKind on every checkpoint entry — the panel
 * must render by IT, not by guessing from thumbnail presence:
 * (a) previewKind 'screenshot' → <img> with the inline data-URL
 * (b) previewKind 'minimap'   → <SnapshotMinimap>, even if a stale thumbnail
 *     field is present in the snapshot (the server-declared kind wins)
 * (c) legacy entry without previewKind → falls back to thumbnail presence
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUseStoryboardHistoryFetch } = vi.hoisted(() => ({
  mockUseStoryboardHistoryFetch: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistoryFetch', () => ({
  useStoryboardHistoryFetch: mockUseStoryboardHistoryFetch,
}));

vi.mock('@/features/storyboard/store/storyboard-store', () => ({
  restoreFromSnapshot: vi.fn(),
  getSnapshot: vi.fn(() => ({ nodes: [], edges: [], positions: {}, selectedBlockId: null })),
}));

vi.mock('@/features/storyboard/store/storyboard-history-store', () => ({}));

vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: () => 'just now',
}));

import { StoryboardHistoryPanel } from '@/features/storyboard/components/StoryboardHistoryPanel';

const THUMB = 'data:image/jpeg;base64,/9j/previewdata';

function renderPanelWith(entry: Record<string, unknown>): void {
  mockUseStoryboardHistoryFetch.mockReturnValue({
    entries: [entry],
    isLoading: false,
    isError: false,
  });
  render(
    <StoryboardHistoryPanel draftId="draft-1" onClose={vi.fn()} onRestore={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HistoryEntryRow — previewKind-driven preview (AC-08 / AC-04)', () => {
  it('(a) previewKind screenshot → renders the screenshot image', () => {
    renderPanelWith({
      snapshot: { blocks: [], edges: [], thumbnail: THUMB },
      previewKind: 'screenshot',
      createdAt: '2026-06-05T10:00:00.000Z',
    });

    const img = screen.getByTestId('snapshot-thumbnail-img');
    expect((img as HTMLImageElement).src).toContain(THUMB);
    expect(screen.queryByTestId('snapshot-minimap')).toBeNull();
  });

  it('(b) previewKind minimap → renders SnapshotMinimap even with a thumbnail field present', () => {
    renderPanelWith({
      snapshot: { blocks: [], edges: [], thumbnail: THUMB },
      previewKind: 'minimap',
      createdAt: '2026-06-05T10:00:00.000Z',
    });

    expect(screen.getByTestId('snapshot-minimap')).toBeTruthy();
    expect(screen.queryByTestId('snapshot-thumbnail-img')).toBeNull();
  });

  it('(c) legacy entry without previewKind falls back to thumbnail presence', () => {
    renderPanelWith({
      snapshot: { blocks: [], edges: [], thumbnail: THUMB },
      createdAt: '2026-06-05T10:00:00.000Z',
    });

    expect(screen.getByTestId('snapshot-thumbnail-img')).toBeTruthy();
    expect(screen.queryByTestId('snapshot-minimap')).toBeNull();
  });
});
