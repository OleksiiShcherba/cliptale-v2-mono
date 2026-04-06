import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { Clip } from '@ai-video-editor/project-schema';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as projectStore from '@/store/project-store';
import * as timelineApi from '../api';
import { ClipLane } from './ClipLane';
import { defaultProps, clip1, clip2, makeProjectDoc } from './ClipLane.fixtures';

vi.mock('../api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  patchClip: vi.fn().mockResolvedValue(undefined),
}));

describe('ClipLane — context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1, clip2]));

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
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1]));

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);
    fireEvent.click(screen.getByText('Duplicate Clip'));

    expect(mockSetProject).toHaveBeenCalled();
    const updatedProject = mockSetProject.mock.calls[0]![0];
    expect(updatedProject.clips?.length).toBe(2);
    const dup = updatedProject.clips?.find((c: Clip) => c.id !== 'clip-001');
    expect(dup?.startFrame).toBe(clip1.startFrame + clip1.durationFrames);
    mockSetProject.mockRestore();
  });

  it('splits clip at playhead when Split at Playhead is selected and playhead overlaps', () => {
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1]));
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
    expect(updatedProject.clips?.length).toBe(2);
    const sorted = [...updatedProject.clips!].sort((a: Clip, b: Clip) => a.startFrame - b.startFrame);
    expect(sorted[0]?.startFrame).toBe(0);
    expect(sorted[0]?.durationFrames).toBe(15);
    expect(sorted[1]?.startFrame).toBe(15);
    expect(sorted[1]?.durationFrames).toBe(15);
    mockSetProject.mockRestore();
  });

  it('calls createClip for both halves when Split at Playhead succeeds', async () => {
    const mockCreateClip = vi.mocked(timelineApi.createClip);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1]));
    vi.spyOn(projectStore, 'setProject');
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 10,
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);
    fireEvent.click(screen.getByText('Split at Playhead'));

    await new Promise((r) => setTimeout(r, 0));

    expect(mockCreateClip).toHaveBeenCalledTimes(2);
    expect(mockCreateClip.mock.calls[0]![0]).toBe('project-001');
    expect(mockCreateClip.mock.calls[1]![0]).toBe('project-001');
  });

  it('does NOT call createClip when split is skipped because playhead is not overlapping', async () => {
    const mockCreateClip = vi.mocked(timelineApi.createClip);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1]));
    vi.spyOn(projectStore, 'setProject');
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 0,
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);
    fireEvent.click(screen.getByText('Split at Playhead'));

    await new Promise((r) => setTimeout(r, 0));

    expect(mockCreateClip).not.toHaveBeenCalled();
  });

  it('Split at Playhead is disabled (canSplit=false) when playhead is at exact clip startFrame', () => {
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1]));
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 0,
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);

    const splitItem = screen.getByText('Split at Playhead').closest('[role="menuitem"]');
    expect(splitItem?.getAttribute('aria-disabled')).toBe('true');
  });

  it('Split at Playhead is disabled when playhead is exactly at clip end (startFrame + durationFrames)', () => {
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProjectDoc([clip1]));
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 30, // clip1 ends at frame 30
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    render(<ClipLane {...defaultProps} clips={[clip1] as ReadonlyArray<Clip & { layer?: number }>} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.contextMenu(buttons[0]!);

    const splitItem = screen.getByText('Split at Playhead').closest('[role="menuitem"]');
    expect(splitItem?.getAttribute('aria-disabled')).toBe('true');
  });
});
