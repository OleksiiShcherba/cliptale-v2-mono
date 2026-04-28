/**
 * Unit tests for the SnapshotMinimap sub-component.
 *
 * Covers:
 * (a) 3 blocks at varied positions → SVG renders with 3 rects, correct data-testid
 * (b) 0 blocks → SVG renders (no rects, no crash)
 * (c) 2 blocks at the same position → renders without crash (centered rects)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SnapshotMinimap } from '@/features/storyboard/components/StoryboardHistoryPanel';
import type { StoryboardBlock } from '@/features/storyboard/types';

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
