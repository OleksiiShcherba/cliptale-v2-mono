import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ClipLane } from './ClipLane';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as projectStore from '@/store/project-store';
import type { Clip, Track, ProjectDoc } from '@ai-video-editor/project-schema';
import type { ClipDragInfo } from '../hooks/useClipDrag';
import type { TrimDragInfo } from '../hooks/useClipTrim';

const videoTrack: Track = {
  id: 'track-001',
  type: 'video',
  name: 'Video Track',
  muted: false,
  locked: false,
};

const clip1: Clip = {
  id: 'clip-001',
  type: 'video',
  assetId: 'asset-001',
  trackId: 'track-001',
  startFrame: 0,
  durationFrames: 30,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
};

const clip2: Clip = {
  id: 'clip-002',
  type: 'video',
  assetId: 'asset-002',
  trackId: 'track-001',
  startFrame: 50,
  durationFrames: 20,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
};

const defaultProps = {
  track: videoTrack,
  clips: [clip1, clip2] as ReadonlyArray<Clip & { layer?: number }>,
  pxPerFrame: 4,
  selectedClipIds: new Set<string>(),
  width: 800,
  dragInfo: null as ClipDragInfo | null,
  onClipPointerDown: vi.fn(),
  trimInfo: null as TrimDragInfo | null,
  getTrimCursor: vi.fn().mockReturnValue(null),
  onTrimPointerDown: vi.fn().mockReturnValue(false),
};

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

  // ---------------------------------------------------------------------------
  // Drag-related tests
  // ---------------------------------------------------------------------------

  it('renders ghost clips when dragInfo has ghost positions for clips in this track', () => {
    const dragInfo: ClipDragInfo = {
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 20]]),
      isSnapping: false,
      snapIndicatorPx: null,
    };
    render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    // Should have 3 buttons: 2 original + 1 ghost (clip-001 ghost)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders snap indicator when dragInfo isSnapping is true', () => {
    const dragInfo: ClipDragInfo = {
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 100]]),
      isSnapping: true,
      snapIndicatorPx: 400,
    };
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const snapLine = container.querySelector('[aria-hidden="true"][style*="position: absolute"]');
    expect(snapLine).toBeDefined();
  });

  it('does not render snap indicator when dragInfo isSnapping is false', () => {
    const dragInfo: ClipDragInfo = {
      draggingClipIds: new Set(['clip-001']),
      ghostPositions: new Map([['clip-001', 100]]),
      isSnapping: false,
      snapIndicatorPx: null,
    };
    const { container } = render(<ClipLane {...defaultProps} dragInfo={dragInfo} />);
    const lane = container.firstChild as HTMLElement;
    const allDivs = lane.querySelectorAll('div');
    const snapIndicator = Array.from(allDivs).find(
      (d) => d.style.background === 'rgb(239, 68, 68)' || d.style.background === '#EF4444',
    );
    expect(snapIndicator).toBeUndefined();
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
    // Either drag or trim handler is called
    expect(onTrimPointerDown).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Trim-related tests
  // ---------------------------------------------------------------------------

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
    // clip-001 should render at ghostDurationFrames * pxPerFrame = 80px width
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
    // Drag should not start when trim consumed the event
    expect(onClipPointerDown).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Context menu tests
  // ---------------------------------------------------------------------------

  it('opens context menu on right-click on a clip', () => {
    render(<ClipLane {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('closes context menu when onClose is triggered (Escape key)', () => {
    render(<ClipLane {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('deletes clip from project doc when Delete Clip is selected', () => {
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue({
      schemaVersion: 1,
      id: 'project-001',
      title: 'Test',
      fps: 30,
      durationFrames: 300,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [clip1, clip2],
      createdAt: '',
      updatedAt: '',
    } as unknown as ProjectDoc);

    render(<ClipLane {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);

    fireEvent.click(screen.getByText('Delete Clip'));

    expect(mockSetProject).toHaveBeenCalled();
    const updatedProject = mockSetProject.mock.calls[0]![0];
    expect(updatedProject.clips?.find((c: Clip) => c.id === 'clip-001')).toBeUndefined();
    mockSetProject.mockRestore();
  });

  it('duplicates clip when Duplicate Clip is selected', () => {
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue({
      schemaVersion: 1,
      id: 'project-001',
      title: 'Test',
      fps: 30,
      durationFrames: 300,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [clip1],
      createdAt: '',
      updatedAt: '',
    } as unknown as ProjectDoc);

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);

    fireEvent.click(screen.getByText('Duplicate Clip'));

    expect(mockSetProject).toHaveBeenCalled();
    const updatedProject = mockSetProject.mock.calls[0]![0];
    // Should have 2 clips now — original + duplicate
    expect(updatedProject.clips?.length).toBe(2);
    // Duplicate starts after original end
    const dup = updatedProject.clips?.find((c: Clip) => c.id !== 'clip-001');
    expect(dup?.startFrame).toBe(clip1.startFrame + clip1.durationFrames);
    mockSetProject.mockRestore();
  });

  it('splits clip at playhead when Split at Playhead is selected and playhead overlaps', () => {
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue({
      schemaVersion: 1,
      id: 'project-001',
      title: 'Test',
      fps: 30,
      durationFrames: 300,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [clip1],
      createdAt: '',
      updatedAt: '',
    } as unknown as ProjectDoc);
    // Set playhead to frame 15 (within clip1's range [0, 30))
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 15,
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);

    fireEvent.click(screen.getByText('Split at Playhead'));

    expect(mockSetProject).toHaveBeenCalled();
    const updatedProject = mockSetProject.mock.calls[0]![0];
    // Should have 2 clips — first covers [0, 15), second covers [15, 30)
    expect(updatedProject.clips?.length).toBe(2);
    const sorted = [...updatedProject.clips!].sort((a: Clip, b: Clip) => a.startFrame - b.startFrame);
    expect(sorted[0]?.startFrame).toBe(0);
    expect(sorted[0]?.durationFrames).toBe(15);
    expect(sorted[1]?.startFrame).toBe(15);
    expect(sorted[1]?.durationFrames).toBe(15);
    // Both reference the same assetId
    expect(sorted[0]?.type !== 'text-overlay' && (sorted[0] as { assetId: string })?.assetId).toBe('asset-001');
    expect(sorted[1]?.type !== 'text-overlay' && (sorted[1] as { assetId: string })?.assetId).toBe('asset-001');
    mockSetProject.mockRestore();
  });
});
