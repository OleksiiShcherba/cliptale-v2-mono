/**
 * Unit tests for the SnapshotMinimap sub-component and the HistoryEntryRow
 * thumbnail conditional-render logic.
 *
 * SnapshotMinimap covers:
 * (a) 3 blocks at varied positions → SVG renders with 3 rects, correct data-testid
 * (b) 0 blocks → SVG renders (no rects, no crash)
 * (c) 2 blocks at the same position → renders without crash (centered rects)
 *
 * HistoryEntryRow thumbnail covers (via StoryboardHistoryPanel):
 * (d) snapshot WITH thumbnail → <img data-testid="snapshot-thumbnail-img"> present,
 *     data-testid="snapshot-minimap" absent
 * (e) snapshot WITHOUT thumbnail → data-testid="snapshot-minimap" present,
 *     <img data-testid="snapshot-thumbnail-img"> absent
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SnapshotMinimap } from '@/features/storyboard/components/StoryboardHistoryPanel';
import type { StoryboardBlock } from '@/features/storyboard/types';

// ── Hoisted mocks for HistoryEntryRow thumbnail tests ─────────────────────────

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

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  mockUseStoryboardHistoryFetch.mockReturnValue({
    entries: [],
    isLoading: false,
    isError: false,
  });
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<StoryboardBlock> & { id: string }): StoryboardBlock {
  return {
    id: overrides.id,
    draftId: 'draft-1',
    blockType: overrides.blockType ?? 'scene',
    name: null,
    prompt: null,
    durationS: 5,
    positionX: overrides.positionX ?? 0,
    positionY: overrides.positionY ?? 0,
    sortOrder: 0,
    style: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mediaItems: [],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SnapshotMinimap', () => {
  it('(a) renders SVG with 3 rects when snapshot has 3 blocks at varied positions', () => {
    const blocks: StoryboardBlock[] = [
      makeBlock({ id: 'b1', blockType: 'start', positionX: 0, positionY: 0 }),
      makeBlock({ id: 'b2', blockType: 'scene', positionX: 300, positionY: 150 }),
      makeBlock({ id: 'b3', blockType: 'end', positionX: 600, positionY: 0 }),
    ];

    render(<SnapshotMinimap blocks={blocks} />);

    const minimap = screen.getByTestId('snapshot-minimap');
    expect(minimap).toBeTruthy();

    const rects = screen.getAllByTestId('minimap-block-rect');
    expect(rects).toHaveLength(3);
  });

  it('(b) renders SVG container without crashing when blocks is empty', () => {
    render(<SnapshotMinimap blocks={[]} />);

    const minimap = screen.getByTestId('snapshot-minimap');
    expect(minimap).toBeTruthy();

    // No rects should be rendered for an empty block list.
    const rects = screen.queryAllByTestId('minimap-block-rect');
    expect(rects).toHaveLength(0);
  });

  it('(c) renders without crashing when 2 blocks share the same position', () => {
    const blocks: StoryboardBlock[] = [
      makeBlock({ id: 'b1', blockType: 'start', positionX: 100, positionY: 100 }),
      makeBlock({ id: 'b2', blockType: 'end', positionX: 100, positionY: 100 }),
    ];

    render(<SnapshotMinimap blocks={blocks} />);

    const minimap = screen.getByTestId('snapshot-minimap');
    expect(minimap).toBeTruthy();

    // Both rects rendered (centered) — no crash.
    const rects = screen.getAllByTestId('minimap-block-rect');
    expect(rects).toHaveLength(2);
  });
});

// ── Thumbnail conditional render (HistoryEntryRow) ────────────────────────────

describe('HistoryEntryRow — thumbnail vs minimap conditional render', () => {
  it('(d) renders <img> and NOT <SnapshotMinimap> when snapshot has a thumbnail', () => {
    const thumbnailDataUrl = 'data:image/jpeg;base64,/9j/thumbnaildata';
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [
        {
          snapshot: { blocks: [], edges: [], thumbnail: thumbnailDataUrl },
          createdAt: new Date(2026, 3, 28, 12, 0).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(
      <StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} onRestore={vi.fn()} />,
    );

    // <img> must be present with the correct src
    const img = screen.getByTestId('snapshot-thumbnail-img');
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain(thumbnailDataUrl);

    // SVG minimap must NOT be present
    expect(screen.queryByTestId('snapshot-minimap')).toBeNull();
  });

  it('(e) renders <SnapshotMinimap> and NOT <img> when snapshot has no thumbnail', () => {
    mockUseStoryboardHistoryFetch.mockReturnValue({
      entries: [
        {
          snapshot: { blocks: [], edges: [] },
          createdAt: new Date(2026, 3, 28, 12, 1).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(
      <StoryboardHistoryPanel draftId="d1" onClose={vi.fn()} onRestore={vi.fn()} />,
    );

    // SVG minimap must be present (fallback)
    expect(screen.getByTestId('snapshot-minimap')).toBeTruthy();

    // <img> thumbnail must NOT be present
    expect(screen.queryByTestId('snapshot-thumbnail-img')).toBeNull();
  });
});
