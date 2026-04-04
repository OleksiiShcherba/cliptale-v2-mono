import React from 'react';
import { FixedSizeList } from 'react-window';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import { TrackHeader, TRACK_ROW_HEIGHT } from './TrackHeader';
import { ClipLane } from './ClipLane';
import type { ClipAssetData } from './ClipBlock';
import type { ClipDragInfo } from '../hooks/useClipDrag';
import type { TrimDragInfo } from '../hooks/useClipTrim';

// Design tokens
const BORDER = '#252535';

/** Width of the track header column in pixels (matches TrackHeader). */
export const TRACK_HEADER_WIDTH = 160;

interface TrackRowData {
  tracks: Track[];
  clips: ReadonlyArray<Clip & { layer?: number }>;
  pxPerFrame: number;
  selectedClipIds: ReadonlySet<string>;
  laneWidth: number;
  assetDataMap: Readonly<Record<string, ClipAssetData>>;
  dragInfo: ClipDragInfo | null;
  onClipPointerDown: (e: React.PointerEvent, clipId: string, isLocked: boolean) => void;
  trimInfo: TrimDragInfo | null;
  getTrimCursor: (
    e: React.MouseEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
  ) => 'ew-resize' | null;
  onTrimPointerDown: (
    e: React.PointerEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
    assetDurationFrames?: number,
  ) => boolean;
  onRename: (trackId: string, newName: string) => void;
  onToggleMute: (trackId: string) => void;
  onToggleLock: (trackId: string) => void;
}

interface TrackRowProps {
  index: number;
  style: React.CSSProperties;
  data: TrackRowData;
}

/**
 * Renders a single row inside the virtualized list:
 * a `TrackHeader` on the left and a `ClipLane` on the right.
 */
function TrackRow({ index, style, data }: TrackRowProps): React.ReactElement {
  const track = data.tracks[index]!;

  // Filter clips belonging to this track.
  const trackClips = data.clips.filter((c) => c.trackId === track.id);

  return (
    <div style={{ ...style, display: 'flex' }} role="row" aria-label={`Track row: ${track.name}`}>
      <TrackHeader
        track={track}
        onRename={data.onRename}
        onToggleMute={data.onToggleMute}
        onToggleLock={data.onToggleLock}
      />
      <ClipLane
        track={track}
        clips={trackClips}
        pxPerFrame={data.pxPerFrame}
        selectedClipIds={data.selectedClipIds}
        width={data.laneWidth}
        assetDataMap={data.assetDataMap}
        dragInfo={data.dragInfo}
        onClipPointerDown={data.onClipPointerDown}
        trimInfo={data.trimInfo}
        getTrimCursor={data.getTrimCursor}
        onTrimPointerDown={data.onTrimPointerDown}
      />
    </div>
  );
}

interface TrackListProps {
  tracks: Track[];
  /** All project clips (filtered per-track inside TrackRow). */
  clips: ReadonlyArray<Clip & { layer?: number }>;
  /** Pixels per frame for clip positioning. */
  pxPerFrame: number;
  /** Currently selected clip IDs. */
  selectedClipIds: ReadonlySet<string>;
  /** Width available for the clip lane area (total width minus header width). */
  laneWidth: number;
  /** Height of the visible list viewport in pixels. */
  height: number;
  /** Optional asset lookup map for thumbnail/waveform. */
  assetDataMap?: Readonly<Record<string, ClipAssetData>>;
  /** Current drag state — null when no drag is in progress. */
  dragInfo: ClipDragInfo | null;
  /** Pointer-down handler from `useClipDrag`. */
  onClipPointerDown: (e: React.PointerEvent, clipId: string, isLocked: boolean) => void;
  /** Current trim state — null when no trim is in progress. */
  trimInfo: TrimDragInfo | null;
  /** Cursor detection callback from `useClipTrim`. */
  getTrimCursor: (
    e: React.MouseEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
  ) => 'ew-resize' | null;
  /** Pointer-down handler from `useClipTrim`. */
  onTrimPointerDown: (
    e: React.PointerEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
    assetDurationFrames?: number,
  ) => boolean;
  /** Called when a track is renamed via inline edit. */
  onRename: (trackId: string, newName: string) => void;
  /** Called when the mute button is toggled. */
  onToggleMute: (trackId: string) => void;
  /** Called when the lock button is toggled. */
  onToggleLock: (trackId: string) => void;
}

/**
 * Virtualized list of all timeline tracks using `react-window FixedSizeList`.
 * Renders only the visible rows, allowing 100+ tracks without jank.
 *
 * Each row contains a `TrackHeader` (left, fixed width) and a `ClipLane` (right,
 * scrollable content area with absolutely-positioned `ClipBlock`s).
 */
export function TrackList({
  tracks,
  clips,
  pxPerFrame,
  selectedClipIds,
  laneWidth,
  height,
  assetDataMap = {},
  dragInfo,
  onClipPointerDown,
  trimInfo,
  getTrimCursor,
  onTrimPointerDown,
  onRename,
  onToggleMute,
  onToggleLock,
}: TrackListProps): React.ReactElement {
  const totalWidth = TRACK_HEADER_WIDTH + laneWidth;

  const itemData: TrackRowData = {
    tracks,
    clips,
    pxPerFrame,
    selectedClipIds,
    laneWidth,
    assetDataMap,
    dragInfo,
    onClipPointerDown,
    trimInfo,
    getTrimCursor,
    onTrimPointerDown,
    onRename,
    onToggleMute,
    onToggleLock,
  };

  if (tracks.length === 0) {
    return (
      <div style={{ ...styles.emptyState, height }} role="list" aria-label="Track list">
        <span style={styles.emptyText}>No tracks — add a track to get started</span>
      </div>
    );
  }

  return (
    <div
      style={{ ...styles.container, width: totalWidth }}
      role="list"
      aria-label="Timeline tracks"
    >
      {/* Column headers (visually hidden for layout — TRACKS label is hidden in zero-height div) */}
      <div style={styles.headerColumn} aria-hidden="true">
        <div style={styles.headerLabel}>TRACKS</div>
      </div>

      <FixedSizeList
        height={height}
        itemCount={tracks.length}
        itemSize={TRACK_ROW_HEIGHT}
        width={totalWidth}
        overscanCount={5}
        itemData={itemData}
      >
        {TrackRow}
      </FixedSizeList>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  headerColumn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: TRACK_HEADER_WIDTH,
    zIndex: 1,
    pointerEvents: 'none',
  },
  headerLabel: {
    height: 0,
    overflow: 'hidden',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0D0D14',
    borderTop: `1px solid ${BORDER}`,
  },
  emptyText: {
    color: '#8A8AA0',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
  },
};
