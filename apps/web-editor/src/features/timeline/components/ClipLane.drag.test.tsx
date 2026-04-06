import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import type { Clip } from '@ai-video-editor/project-schema';
import { ClipLane } from './ClipLane';
import { defaultProps, clip1, makeDragInfo } from './ClipLane.fixtures';

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
    render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    // 2 original + 1 same-track ghost
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

  it('shows drop target overlay when a clip from a different track is being dragged over this lane', () => {
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-external']),
      ghostPositions: new Map([['clip-external', 10]]),
      targetTrackId: 'track-001',
      draggingClipSnapshots: [
        {
          id: 'clip-external',
          type: 'video',
          assetId: 'asset-002',
          trackId: 'track-002', // different from this lane's track-001
          startFrame: 0,
          durationFrames: 30,
          trimInFrame: 0,
          volume: 1,
          opacity: 1,
        } as unknown as Clip & { layer?: number },
      ],
    });
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const overlay = container.querySelector('[style*="dashed"]') as HTMLElement | null;
    expect(overlay).not.toBeNull();
  });

  it('does NOT show drop target overlay when dragged clip originates on the same track', () => {
    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 20]]),
      targetTrackId: 'track-001',
      draggingClipSnapshots: [{ ...clip1 }] as unknown as ReadonlyArray<Clip & { layer?: number }>,
    });
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const overlay = container.querySelector('[style*="dashed"]') as HTMLElement | null;
    expect(overlay).toBeNull();
  });

  it('renders cross-track ghost block on the target lane when dragging from another track', () => {
    const externalClip: Clip & { layer?: number } = {
      id: 'clip-external',
      type: 'video',
      assetId: 'asset-ext',
      trackId: 'track-002', // source is different from this lane (track-001)
      startFrame: 5,
      durationFrames: 20,
      trimInFrame: 0,
      volume: 1,
      opacity: 1,
    } as unknown as Clip & { layer?: number };

    const dragInfo = makeDragInfo({
      draggingClipIds: new Set(['clip-external']),
      ghostPositions: new Map([['clip-external', 15]]),
      targetTrackId: 'track-001',
      draggingClipSnapshots: [externalClip],
    });

    // Render track-001 lane with no clips of its own so ghost count is unambiguous.
    const { container } = render(
      <ClipLane {...defaultProps} clips={[]} dragInfo={dragInfo} />,
    );

    const ghostBlocks = container.querySelectorAll('[role="button"]');
    expect(ghostBlocks.length).toBe(1);
    const ghostBlock = ghostBlocks[0] as HTMLElement;
    // ghostLeft = 15 * pxPerFrame(4) - scrollOffsetX(0) = 60px
    expect(ghostBlock.style.left).toBe('60px');
  });
});
