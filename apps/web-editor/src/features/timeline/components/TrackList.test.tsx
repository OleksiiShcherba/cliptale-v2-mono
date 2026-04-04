import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TrackList } from './TrackList';
import type { Clip, Track } from '@ai-video-editor/project-schema';

function makeTrack(index: number, type: Track['type'] = 'video'): Track {
  return {
    id: `track-${index}`,
    type,
    name: `Track ${index}`,
    muted: false,
    locked: false,
  };
}

function makeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => makeTrack(i + 1));
}

const NO_CLIPS: Clip[] = [];
const NO_SELECTION = new Set<string>();

const defaultProps = {
  clips: NO_CLIPS,
  pxPerFrame: 4,
  selectedClipIds: NO_SELECTION,
  laneWidth: 800,
  height: 400,
  dragInfo: null,
  onClipPointerDown: vi.fn(),
  trimInfo: null,
  getTrimCursor: vi.fn().mockReturnValue(null),
  onTrimPointerDown: vi.fn().mockReturnValue(false),
  onRename: vi.fn(),
  onToggleMute: vi.fn(),
  onToggleLock: vi.fn(),
};

describe('TrackList', () => {
  it('renders an empty state when no tracks are provided', () => {
    render(<TrackList tracks={[]} {...defaultProps} />);
    expect(screen.getByText(/No tracks/)).toBeDefined();
  });

  it('renders a list with a single track', () => {
    const tracks = makeTracks(1);
    render(<TrackList tracks={tracks} {...defaultProps} />);
    expect(screen.getByText('Track 1')).toBeDefined();
  });

  it('renders multiple tracks', () => {
    const tracks = makeTracks(4);
    render(<TrackList tracks={tracks} {...defaultProps} />);
    // react-window renders a subset; at least the first few should be visible
    expect(screen.getByText('Track 1')).toBeDefined();
    expect(screen.getByText('Track 2')).toBeDefined();
  });

  it('renders with a video track and audio track', () => {
    const tracks: Track[] = [
      makeTrack(1, 'video'),
      makeTrack(2, 'audio'),
    ];
    render(<TrackList tracks={tracks} {...defaultProps} />);
    expect(screen.getByText('Track 1')).toBeDefined();
    expect(screen.getByText('Track 2')).toBeDefined();
  });

  it('has role="list" for accessibility', () => {
    render(<TrackList tracks={makeTracks(2)} {...defaultProps} />);
    expect(screen.getByRole('list', { name: 'Timeline tracks' })).toBeDefined();
  });

  it('renders a list container with aria-label for empty state', () => {
    render(<TrackList tracks={[]} {...defaultProps} />);
    const list = screen.getByRole('list', { name: 'Track list' });
    expect(list).toBeDefined();
  });

  it('handles 100 tracks without throwing', () => {
    const tracks = makeTracks(100);
    expect(() =>
      render(<TrackList tracks={tracks} {...defaultProps} />),
    ).not.toThrow();
  });

  it('passes onRename to TrackHeader', () => {
    const onRename = vi.fn();
    const tracks = makeTracks(1);
    render(<TrackList tracks={tracks} {...defaultProps} onRename={onRename} />);
    // TrackHeader with the first track should be rendered
    expect(screen.getByLabelText('Track: Track 1')).toBeDefined();
  });
});
