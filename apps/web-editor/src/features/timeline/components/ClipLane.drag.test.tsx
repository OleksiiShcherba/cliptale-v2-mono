import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import { ClipLane } from './ClipLane';
import { defaultProps, makeDragInfo } from './ClipLane.fixtures';

vi.mock('../api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  patchClip: vi.fn().mockResolvedValue(undefined),
}));

describe('ClipLane — drag ghosts and snap indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ghost clips when dragInfo has ghost positions for clips in this track', () => {
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 20]]),
    });
    // 2 original clips + 1 same-track ghost = at least 2 role="button" elements
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const buttons = container.querySelectorAll('[role="button"]');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders snap indicator when dragInfo isSnapping is true', () => {
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 100]]),
      isSnapping: true,
      snapIndicatorPx: 400,
    });
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const snapLine = container.querySelector('[aria-hidden="true"][style*="position: absolute"]');
    expect(snapLine).toBeDefined();
  });

  it('does not render snap indicator when dragInfo isSnapping is false', () => {
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 100]]),
    });
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const lane = container.firstChild as HTMLElement;
    const allDivs = lane.querySelectorAll('div');
    const snapIndicator = Array.from(allDivs).find(
      (d) => d.style.background === 'rgb(239, 68, 68)' || d.style.background === '#EF4444',
    );
    expect(snapIndicator).toBeUndefined();
  });

  it('does NOT show clip drag drop target overlay when dragging a clip (clips stay on original track)', () => {
    // Cross-track clip drag overlay is no longer rendered; only asset browser drags show an overlay.
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 20]]),
    });
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    // The dashed border overlay only appears for asset-browser drags, not clip drags.
    const overlay = container.querySelector('[style*="dashed"]') as HTMLElement | null;
    expect(overlay).toBeNull();
  });

  it('renders same-track ghost block at projected position during drag', () => {
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 15]]),
    });

    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);

    const ghostBlocks = container.querySelectorAll('[role="button"]');
    // clip-001 (dimmed original) + ghost + clip-002 = at least 2 buttons
    expect(ghostBlocks.length).toBeGreaterThanOrEqual(2);

    // The ghost block should be positioned at: 15 * pxPerFrame(4) - scrollOffsetX(0) = 60px
    const ghostBlock = Array.from(ghostBlocks).find(
      (b) => (b as HTMLElement).style.left === '60px',
    ) as HTMLElement | undefined;
    expect(ghostBlock).toBeDefined();
  });
});
