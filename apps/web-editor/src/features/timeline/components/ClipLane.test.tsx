import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ClipLane } from './ClipLane';
import * as ephemeralStore from '@/store/ephemeral-store';

vi.mock('../api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  patchClip: vi.fn().mockResolvedValue(undefined),
}));

import { defaultProps, videoTrack, clip1, clip2 } from './ClipLane.fixtures';

describe('ClipLane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with aria-label for accessibility', () => {
    render(<ClipLane {...defaultProps} />);
    expect(screen.getByLabelText('Clip lane for track: Video Track')).toBeDefined();
  });

  it('renders all clips in the track', () => {
    render(<ClipLane {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
  });

  it('renders no clips when clips array is empty', () => {
    render(<ClipLane {...defaultProps} clips={[]} />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBe(0);
  });

  it('clears selection when lane background is clicked', () => {
    const spy = vi.spyOn(ephemeralStore, 'setSelectedClips');
    const { container } = render(<ClipLane {...defaultProps} />);
    const lane = container.firstChild as HTMLElement;
    fireEvent.click(lane);
    expect(spy).toHaveBeenCalledWith([]);
    spy.mockRestore();
  });

  it('adds clip to selection on click (single select)', () => {
    const spy = vi.spyOn(ephemeralStore, 'setSelectedClips');
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    render(<ClipLane {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(spy).toHaveBeenCalledWith(['clip-001']);
    spy.mockRestore();
  });

  it('toggles clip in selection on shift+click', () => {
    const spy = vi.spyOn(ephemeralStore, 'setSelectedClips');
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      selectedClipIds: ['clip-002'],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    render(<ClipLane {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!, { shiftKey: true });
    expect(spy).toHaveBeenCalledWith(expect.arrayContaining(['clip-001', 'clip-002']));
    spy.mockRestore();
  });

  it('removes clip from selection on shift+click when already selected', () => {
    const spy = vi.spyOn(ephemeralStore, 'setSelectedClips');
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      selectedClipIds: ['clip-001', 'clip-002'],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    render(<ClipLane {...defaultProps} selectedClipIds={new Set(['clip-001', 'clip-002'])} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!, { shiftKey: true });
    expect(spy).toHaveBeenCalledWith(['clip-002']);
    spy.mockRestore();
  });

  it('does not call setSelectedClips on clip click when track is locked', () => {
    const spy = vi.spyOn(ephemeralStore, 'setSelectedClips');
    const lockedTrack = { ...videoTrack, locked: true };
    render(<ClipLane {...defaultProps} track={lockedTrack} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders with half opacity when track is muted', () => {
    const mutedTrack = { ...videoTrack, muted: true };
    const { container } = render(<ClipLane {...defaultProps} track={mutedTrack} />);
    const lane = container.firstChild as HTMLElement;
    expect(lane.style.opacity).toBe('0.5');
  });

  it('shifts clip positions left when scrollOffsetX is applied', () => {
    const { container } = render(
      <ClipLane {...defaultProps} scrollOffsetX={40} clips={[clip1] as ReadonlyArray<import('@ai-video-editor/project-schema').Clip & { layer?: number }>} />,
    );
    const block = container.querySelector('[data-clip-id="clip-001"]') as HTMLElement | null;
    expect(block).not.toBeNull();
    // clip1.startFrame=0 * pxPerFrame=4 - scrollOffsetX=40 = -40px
    expect(block?.style.left).toBe('-40px');
  });

  it('renders clip at correct left when scrollOffsetX is 0', () => {
    const { container } = render(
      <ClipLane {...defaultProps} scrollOffsetX={0} clips={[clip2] as ReadonlyArray<import('@ai-video-editor/project-schema').Clip & { layer?: number }>} />,
    );
    const block = container.querySelector('[data-clip-id="clip-002"]') as HTMLElement | null;
    expect(block).not.toBeNull();
    // clip2.startFrame=50 * pxPerFrame=4 - 0 = 200px
    expect(block?.style.left).toBe('200px');
  });

  it('passes onClipPointerDown to ClipBlock', () => {
    const onClipPointerDown = vi.fn();
    const onTrimPointerDown = vi.fn().mockReturnValue(false);
    render(
      <ClipLane
        {...defaultProps}
        onClipPointerDown={onClipPointerDown}
        onTrimPointerDown={onTrimPointerDown}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.pointerDown(buttons[0]!);
    expect(onTrimPointerDown).toHaveBeenCalled();
  });
});
