import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { Clip } from '@ai-video-editor/project-schema';
import type { TrimDragInfo } from '../hooks/useClipTrim';
import { ClipLane } from './ClipLane';
import { defaultProps, clip1 } from './ClipLane.fixtures';

vi.mock('../api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  patchClip: vi.fn().mockResolvedValue(undefined),
}));

describe('ClipLane — trim interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trimming clip at ghost dimensions when trimInfo is set', () => {
    const trimInfo: TrimDragInfo = {
      clipId: 'clip-001',
      edge: 'right',
      ghostStartFrame: 0,
      ghostDurationFrames: 20,
      isSnapping: false,
      snapIndicatorPx: null,
    };
    const { container } = render(<ClipLane {...defaultProps} trimInfo={trimInfo} />);
    const buttons = container.querySelectorAll('[role="button"]');
    const clip1Block = Array.from(buttons).find(
      (b) => b.getAttribute('data-clip-id') === 'clip-001',
    ) as HTMLElement | undefined;
    expect(clip1Block).toBeDefined();
    // ghostDurationFrames=20 * pxPerFrame=4 = 80px
    expect(clip1Block?.style.width).toBe('80px');
  });

  it('renders snap indicator from trimInfo when snapping during trim', () => {
    const trimInfo: TrimDragInfo = {
      clipId: 'clip-001',
      edge: 'right',
      ghostStartFrame: 0,
      ghostDurationFrames: 30,
      isSnapping: true,
      snapIndicatorPx: 120,
    };
    const { container } = render(<ClipLane {...defaultProps} trimInfo={trimInfo} />);
    const snapLine = container.querySelector('[aria-hidden="true"][style*="position: absolute"]');
    expect(snapLine).toBeDefined();
  });

  it('calls onTrimPointerDown before onClipPointerDown on pointerdown', () => {
    const onTrimPointerDown = vi.fn().mockReturnValue(true); // trim consumes the event
    const onClipPointerDown = vi.fn();
    render(
      <ClipLane
        {...defaultProps}
        onTrimPointerDown={onTrimPointerDown}
        onClipPointerDown={onClipPointerDown}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.pointerDown(buttons[0]!);
    expect(onTrimPointerDown).toHaveBeenCalled();
    expect(onClipPointerDown).not.toHaveBeenCalled();
  });

  it('calls onClipPointerDown when trim does not consume the event', () => {
    const onTrimPointerDown = vi.fn().mockReturnValue(false);
    const onClipPointerDown = vi.fn();
    render(
      <ClipLane
        {...defaultProps}
        onTrimPointerDown={onTrimPointerDown}
        onClipPointerDown={onClipPointerDown}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.pointerDown(buttons[0]!);
    expect(onTrimPointerDown).toHaveBeenCalled();
    expect(onClipPointerDown).toHaveBeenCalled();
  });
});
