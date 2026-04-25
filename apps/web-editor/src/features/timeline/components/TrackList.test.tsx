import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

import { TrackList } from './TrackList';

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
  projectId: '00000000-0000-0000-0000-000000000001',
  clips: NO_CLIPS,
  pxPerFrame: 4,
  selectedClipIds: NO_SELECTION,
  laneWidth: 800,
  scrollOffsetX: 0,
  height: 400,
  dragInfo: null,
  onClipPointerDown: vi.fn(),
  trimInfo: null,
  getTrimCursor: vi.fn().mockReturnValue(null),
  onTrimPointerDown: vi.fn().mockReturnValue(false),
  onRename: vi.fn(),
  onToggleMute: vi.fn(),
  onToggleLock: vi.fn(),
  onAssetDrop: vi.fn(),
};

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'test.mp4',
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: 'https://cdn.example.com/test.mp4',
    status: 'ready',
    durationSeconds: 5,
    width: null,
    height: null,
    fileSizeBytes: null,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

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

  describe('empty state drag-and-drop', () => {
    it('shows default empty state hint text when no drag is in progress', () => {
      render(<TrackList tracks={[]} {...defaultProps} onEmptyAreaDrop={vi.fn()} />);
      expect(screen.getByText(/drag a media file here to get started/i)).toBeDefined();
    });

    it('changes hint text to drop prompt when dragging a cliptale-asset over the empty area', () => {
      render(<TrackList tracks={[]} {...defaultProps} onEmptyAreaDrop={vi.fn()} />);
      const emptyList = screen.getByRole('list', { name: 'Track list' });

      fireEvent.dragOver(emptyList, {
        dataTransfer: { types: ['application/cliptale-asset'], dropEffect: '' },
      });

      expect(screen.getByText(/drop to create a new track/i)).toBeDefined();
    });

    it('resets hint text to default after dragleave', () => {
      render(<TrackList tracks={[]} {...defaultProps} onEmptyAreaDrop={vi.fn()} />);
      const emptyList = screen.getByRole('list', { name: 'Track list' });

      fireEvent.dragOver(emptyList, {
        dataTransfer: { types: ['application/cliptale-asset'], dropEffect: '' },
      });
      expect(screen.getByText(/drop to create a new track/i)).toBeDefined();

      fireEvent.dragLeave(emptyList);
      expect(screen.getByText(/drag a media file here to get started/i)).toBeDefined();
    });

    it('does not activate drop state when dragged item is not a cliptale-asset', () => {
      render(<TrackList tracks={[]} {...defaultProps} onEmptyAreaDrop={vi.fn()} />);
      const emptyList = screen.getByRole('list', { name: 'Track list' });

      fireEvent.dragOver(emptyList, {
        dataTransfer: { types: ['text/plain'], dropEffect: '' },
      });

      // Text should not change — unrecognised MIME type is ignored
      expect(screen.getByText(/drag a media file here to get started/i)).toBeDefined();
    });

    it('calls onEmptyAreaDrop with the dropped asset when a valid asset is dropped', () => {
      const onEmptyAreaDrop = vi.fn();
      render(<TrackList tracks={[]} {...defaultProps} onEmptyAreaDrop={onEmptyAreaDrop} />);

      const emptyList = screen.getByRole('list', { name: 'Track list' });
      const asset = makeAsset();

      fireEvent.dragOver(emptyList, {
        dataTransfer: {
          types: ['application/cliptale-asset'],
          dropEffect: '',
        },
      });
      fireEvent.drop(emptyList, {
        dataTransfer: {
          getData: (_type: string) => JSON.stringify(asset),
        },
      });

      expect(onEmptyAreaDrop).toHaveBeenCalledOnce();
      expect(onEmptyAreaDrop).toHaveBeenCalledWith(asset, 0);
    });

    it('does not call onEmptyAreaDrop when onEmptyAreaDrop is not provided', () => {
      const onEmptyAreaDrop = vi.fn();
      render(<TrackList tracks={[]} {...defaultProps} />);

      const emptyList = screen.getByRole('list', { name: 'Track list' });
      const asset = makeAsset();

      fireEvent.drop(emptyList, {
        dataTransfer: {
          getData: (_type: string) => JSON.stringify(asset),
        },
      });

      expect(onEmptyAreaDrop).not.toHaveBeenCalled();
    });

    it('does not call onEmptyAreaDrop when dropped data is invalid JSON', () => {
      const onEmptyAreaDrop = vi.fn();
      render(<TrackList tracks={[]} {...defaultProps} onEmptyAreaDrop={onEmptyAreaDrop} />);

      const emptyList = screen.getByRole('list', { name: 'Track list' });

      fireEvent.drop(emptyList, {
        dataTransfer: {
          getData: (_type: string) => 'not-valid-json{{{',
        },
      });

      expect(onEmptyAreaDrop).not.toHaveBeenCalled();
    });
  });

  describe('track reordering', () => {
    it('renders drag handles on each track header', () => {
      const tracks = makeTracks(2);
      render(<TrackList tracks={tracks} {...defaultProps} />);
      const handles = screen.getAllByLabelText('Drag to reorder track');
      expect(handles).toHaveLength(2);
    });

    it('calls onReorderTracks when a track is dropped onto another track', () => {
      const onReorderTracks = vi.fn();
      const tracks: Track[] = [
        makeTrack(1, 'video'),
        makeTrack(2, 'audio'),
      ];
      render(<TrackList tracks={tracks} {...defaultProps} onReorderTracks={onReorderTracks} />);

      // Simulate drag start on first track handle
      const handles = screen.getAllByLabelText('Drag to reorder track');
      fireEvent.dragStart(handles[0]!, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      // Drag over second track header
      const headers = screen.getAllByLabelText(/^Track: Track/);
      fireEvent.dragOver(headers[1]!, {
        dataTransfer: { types: ['application/cliptale-track'], dropEffect: '' },
      });

      // Drop on second track header
      fireEvent.drop(headers[1]!, {
        dataTransfer: { types: ['application/cliptale-track'] },
      });

      expect(onReorderTracks).toHaveBeenCalledOnce();
      expect(onReorderTracks).toHaveBeenCalledWith(['track-2', 'track-1']);
    });

    it('does not call onReorderTracks when a track is dropped onto itself', () => {
      const onReorderTracks = vi.fn();
      const tracks = makeTracks(2);
      render(<TrackList tracks={tracks} {...defaultProps} onReorderTracks={onReorderTracks} />);

      const handles = screen.getAllByLabelText('Drag to reorder track');
      fireEvent.dragStart(handles[0]!, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      const headers = screen.getAllByLabelText(/^Track: Track/);
      fireEvent.dragOver(headers[0]!, {
        dataTransfer: { types: ['application/cliptale-track'], dropEffect: '' },
      });
      fireEvent.drop(headers[0]!, {
        dataTransfer: { types: ['application/cliptale-track'] },
      });

      expect(onReorderTracks).not.toHaveBeenCalled();
    });

    it('does not call onReorderTracks when no onReorderTracks prop is provided', () => {
      const tracks = makeTracks(2);
      // Should not throw even without the prop
      expect(() => {
        render(<TrackList tracks={tracks} {...defaultProps} />);
        const handles = screen.getAllByLabelText('Drag to reorder track');
        fireEvent.dragStart(handles[0]!, {
          dataTransfer: { setData: vi.fn(), effectAllowed: '' },
        });
        const headers = screen.getAllByLabelText(/^Track: Track/);
        fireEvent.drop(headers[1]!, {
          dataTransfer: { types: ['application/cliptale-track'] },
        });
      }).not.toThrow();
    });
  });
});
