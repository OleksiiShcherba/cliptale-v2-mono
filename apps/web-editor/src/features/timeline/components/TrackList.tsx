import React, { useCallback, useRef, useState } from 'react';
import { FixedSizeList } from 'react-window';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

import { TRACK_HEADER_WIDTH, TRACK_ROW_HEIGHT } from './TrackHeader';
import type { ClipAssetData } from './ClipBlock';
import type { ClipDragInfo } from '../hooks/useClipDrag';
import type { TrimDragInfo } from '../hooks/useClipTrim';
import { useTrackReorder } from '../hooks/useTrackReorder';
import { TrackRow } from './TrackRow';
import type { TrackRowData } from './TrackRow';
import { styles } from './trackListStyles';

// Re-export so consumers (TimelinePanel) can import from a single entry point.
export { TRACK_HEADER_WIDTH };

interface TrackListProps {
  projectId: string;
  tracks: Track[];
  /** All project clips (filtered per-track inside TrackRow). */
  clips: ReadonlyArray<Clip & { layer?: number }>;
  /** Pixels per frame for clip positioning. */
  pxPerFrame: number;
  /** Currently selected clip IDs. */
  selectedClipIds: ReadonlySet<string>;
  /** Width available for the clip lane area (total width minus header width). */
  laneWidth: number;
  /** Horizontal scroll offset of the clip lane in pixels. Forwarded to ClipLane. */
  scrollOffsetX: number;
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
  /** Called when an asset is dropped from the browser onto a specific track lane. */
  onAssetDrop: (asset: Asset, trackId: string, startFrame: number) => void;
  /**
   * Called when an asset is dropped onto the empty-timeline area (no tracks exist).
   * The callee is responsible for creating a track and clip from the asset.
   */
  onEmptyAreaDrop?: (asset: Asset, startFrame: number) => void;
  /**
   * Called when the user drags a track header to reorder the track list.
   * Receives the new ordered array of track IDs.
   */
  onReorderTracks?: (orderedTrackIds: string[]) => void;
  /** Called when the delete button on a track header is clicked. */
  onDeleteTrack?: (trackId: string) => void;
  /**
   * Ref to the FixedSizeList instance so the parent can programmatically
   * scroll the track list vertically (e.g. on wheel events over the header area).
   */
  listRef?: React.RefObject<FixedSizeList | null>;
}

/**
 * Virtualized list of all timeline tracks using `react-window FixedSizeList`.
 * Renders only the visible rows, allowing 100+ tracks without jank.
 *
 * Each row contains a `TrackHeader` (left, fixed width) and a `ClipLane` (right,
 * scrollable content area with absolutely-positioned `ClipBlock`s).
 *
 * Supports drag-and-drop reordering of tracks via the drag handle on each header.
 */
export function TrackList({
  projectId,
  tracks,
  clips,
  pxPerFrame,
  selectedClipIds,
  laneWidth,
  scrollOffsetX,
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
  onAssetDrop,
  onEmptyAreaDrop,
  onReorderTracks,
  onDeleteTrack,
  listRef,
}: TrackListProps): React.ReactElement {
  const [isEmptyDragOver, setIsEmptyDragOver] = useState(false);
  const internalListRef = useRef<FixedSizeList>(null);
  const resolvedListRef = (listRef as React.RefObject<FixedSizeList>) ?? internalListRef;

  const { reorderState, onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop } =
    useTrackReorder();

  const handleTrackDrop = useCallback(
    (targetTrackId: string) => {
      const trackIds = tracks.map((t) => t.id);
      const newOrder = onDrop(trackIds);
      if (newOrder) {
        onReorderTracks?.(newOrder);
      }
    },
    [onDrop, onReorderTracks, tracks],
  );

  const handleEmptyDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/cliptale-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsEmptyDragOver(true);
  }, []);

  const handleEmptyDragLeave = useCallback(() => {
    setIsEmptyDragOver(false);
  }, []);

  const handleEmptyDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsEmptyDragOver(false);
      if (!onEmptyAreaDrop) return;

      const assetJson = e.dataTransfer.getData('application/cliptale-asset');
      if (!assetJson) return;

      let asset: Asset;
      try {
        asset = JSON.parse(assetJson) as Asset;
      } catch {
        return;
      }

      onEmptyAreaDrop(asset, 0);
    },
    [onEmptyAreaDrop],
  );

  const totalWidth = TRACK_HEADER_WIDTH + laneWidth;

  const itemData: TrackRowData = {
    projectId,
    tracks,
    clips,
    pxPerFrame,
    selectedClipIds,
    laneWidth,
    scrollOffsetX,
    assetDataMap,
    dragInfo,
    onClipPointerDown,
    trimInfo,
    getTrimCursor,
    onTrimPointerDown,
    onRename,
    onToggleMute,
    onToggleLock,
    onAssetDrop,
    onDeleteTrack,
    draggingTrackId: reorderState.draggingId,
    overTargetTrackId: reorderState.overTargetId,
    onTrackDragStart: onDragStart,
    onTrackDragOver: onDragOver,
    onTrackDragLeave: onDragLeave,
    onTrackDrop: handleTrackDrop,
    onTrackDragEnd: onDragEnd,
  };

  if (tracks.length === 0) {
    return (
      <div
        style={{
          ...styles.emptyState,
          height,
          ...(isEmptyDragOver ? styles.emptyStateDropActive : {}),
        }}
        role="list"
        aria-label="Track list"
        onDragOver={handleEmptyDragOver}
        onDragLeave={handleEmptyDragLeave}
        onDrop={handleEmptyDrop}
      >
        <span style={styles.emptyText}>
          {isEmptyDragOver ? 'Drop to create a new track' : 'No tracks — drag a media file here to get started'}
        </span>
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
        ref={resolvedListRef}
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
