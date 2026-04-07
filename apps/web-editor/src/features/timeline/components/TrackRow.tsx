import React from 'react';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

import { TrackHeader } from './TrackHeader';
import { ClipLane } from './ClipLane';
import type { ClipAssetData } from './ClipBlock';
import type { ClipDragInfo } from '@/features/timeline/hooks/useClipDrag';
import type { TrimDragInfo } from '@/features/timeline/hooks/useClipTrim';

/** Shared data passed to every virtualized row via react-window `itemData`. */
export type TrackRowData = {
  projectId: string;
  tracks: Track[];
  clips: ReadonlyArray<Clip & { layer?: number }>;
  pxPerFrame: number;
  selectedClipIds: ReadonlySet<string>;
  laneWidth: number;
  /** Horizontal scroll offset forwarded to each ClipLane. */
  scrollOffsetX: number;
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
  /** Called when an asset is dropped from the browser onto a specific track lane. */
  onAssetDrop: (asset: Asset, trackId: string, startFrame: number) => void;
  /** Called when the delete button is clicked on a track header. */
  onDeleteTrack?: (trackId: string) => void;
  // Track reorder handlers
  draggingTrackId: string | null;
  overTargetTrackId: string | null;
  onTrackDragStart: (trackId: string) => void;
  onTrackDragOver: (trackId: string) => void;
  onTrackDragLeave: (trackId: string) => void;
  onTrackDrop: (trackId: string) => void;
  onTrackDragEnd: () => void;
};

/** Props provided by react-window `FixedSizeList` to each row renderer. */
interface TrackRowProps {
  index: number;
  style: React.CSSProperties;
  data: TrackRowData;
}

/**
 * Renders a single row inside the virtualized list:
 * a `TrackHeader` on the left and a `ClipLane` on the right.
 */
export function TrackRow({ index, style, data }: TrackRowProps): React.ReactElement {
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
        isDragging={data.draggingTrackId === track.id}
        isDropTarget={data.overTargetTrackId === track.id}
        onDragStart={data.onTrackDragStart}
        onDragOver={data.onTrackDragOver}
        onDragLeave={data.onTrackDragLeave}
        onDrop={data.onTrackDrop}
        onDragEnd={data.onTrackDragEnd}
        onDelete={data.onDeleteTrack}
      />
      <ClipLane
        projectId={data.projectId}
        track={track}
        clips={trackClips}
        pxPerFrame={data.pxPerFrame}
        selectedClipIds={data.selectedClipIds}
        width={data.laneWidth}
        scrollOffsetX={data.scrollOffsetX}
        assetDataMap={data.assetDataMap}
        dragInfo={data.dragInfo}
        onClipPointerDown={data.onClipPointerDown}
        trimInfo={data.trimInfo}
        getTrimCursor={data.getTrimCursor}
        onTrimPointerDown={data.onTrimPointerDown}
        onAssetDrop={(asset, startFrame) => data.onAssetDrop(asset, track.id, startFrame)}
      />
    </div>
  );
}
