import React, { useCallback } from 'react';

import type { Clip, Track } from '@ai-video-editor/project-schema';
import type { Asset } from '@/features/asset-manager/types';
import { setSelectedClips, getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';

import { ClipBlock } from './ClipBlock';
import type { ClipAssetData } from './ClipBlock';
import { TRACK_ROW_HEIGHT } from './TrackHeader';
import { ClipContextMenu } from './ClipContextMenu';
import { ClipLaneGhosts } from './ClipLaneGhosts';
import type { ClipDragInfo } from '../hooks/useClipDrag';
import type { TrimDragInfo } from '../hooks/useClipTrim';
import { useAssetDrop } from '../hooks/useAssetDrop';
import { useClipContextMenu } from '../hooks/useClipContextMenu';

// Design tokens mapped from track type
const TRACK_TYPE_COLORS: Record<Track['type'], string> = {
  video:        '#7C3AED',
  audio:        '#4C1D95',
  caption:      '#10B981',
  overlay:      '#F59E0B',
};

const LANE_BG = '#0D0D14';
const SNAP_INDICATOR_COLOR = '#EF4444';
const DROP_TARGET_OVERLAY = 'rgba(124,58,237,0.15)';

interface ClipLaneProps {
  projectId: string;
  track: Track;
  /** Clips that belong to this track. */
  clips: ReadonlyArray<Clip & { layer?: number }>;
  /** Pixels per frame — used to position and size clip blocks. */
  pxPerFrame: number;
  /** Set of currently selected clip IDs. */
  selectedClipIds: ReadonlySet<string>;
  /** Width of the scrollable lane area in pixels. */
  width: number;
  /**
   * Horizontal scroll offset of the clip lane in pixels.
   * Forwarded to each `ClipBlock` so clip positions track the ruler.
   */
  scrollOffsetX: number;
  /** Optional asset lookup map: assetId → ClipAssetData. */
  assetDataMap?: Readonly<Record<string, ClipAssetData>>;
  /** Current drag state from `useClipDrag`. Null when no drag is in progress. */
  dragInfo: ClipDragInfo | null;
  /** Called when a clip's `onPointerDown` fires. */
  onClipPointerDown: (e: React.PointerEvent, clipId: string, isLocked: boolean) => void;
  /** Current trim state from `useClipTrim`. Null when no trim is in progress. */
  trimInfo: TrimDragInfo | null;
  /** Returns `'ew-resize'` if the pointer is within the trim handle zone. */
  getTrimCursor: (
    e: React.MouseEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
  ) => 'ew-resize' | null;
  /** Initiates a trim drag if the pointer is on an edge handle. */
  onTrimPointerDown: (
    e: React.PointerEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
    assetDurationFrames?: number,
  ) => boolean;
  /**
   * Called when an asset is dropped from the asset browser onto this lane.
   * Receives the dragged asset and the computed startFrame based on drop X position.
   */
  onAssetDrop?: (asset: Asset, startFrame: number) => void;
}

/**
 * Renders the clip lane for a single track.
 * Manages context menu state (right-click → split/delete/duplicate).
 * Handles drag, trim, selection, and ghost rendering.
 * Accepts asset drops from the asset browser to create new clips on this track.
 */
export function ClipLane({
  projectId,
  track,
  clips,
  pxPerFrame,
  selectedClipIds,
  width,
  scrollOffsetX,
  assetDataMap,
  dragInfo,
  onClipPointerDown,
  trimInfo,
  getTrimCursor,
  onTrimPointerDown,
  onAssetDrop,
}: ClipLaneProps): React.ReactElement {
  const trackColor = TRACK_TYPE_COLORS[track.type];

  const { contextMenu, canSplit, handleClipContextMenu, handleContextMenuAction, handleContextMenuClose } =
    useClipContextMenu(projectId);

  const { isAssetDragOver, handleDragOver, handleDragLeave, handleDrop } =
    useAssetDrop(onAssetDrop, scrollOffsetX, pxPerFrame);

  /** Click on empty lane area clears selection. */
  const handleLaneClick = useCallback(() => {
    setSelectedClips([]);
  }, []);

  const handleClipClick = useCallback(
    (clipId: string, shiftKey: boolean) => {
      const current = getEphemeralSnapshot().selectedClipIds;
      if (shiftKey) {
        const updated = current.includes(clipId)
          ? current.filter((id) => id !== clipId)
          : [...current, clipId];
        setSelectedClips(updated);
      } else {
        setSelectedClips([clipId]);
      }
    },
    [],
  );

  /** Combined pointer-down handler: trim takes priority over drag. */
  const handleClipPointerDown = useCallback(
    (e: React.PointerEvent, clipId: string, isLocked: boolean) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;
      const clipWidth = Math.max(2, clip.durationFrames * pxPerFrame);

      const trimStarted = onTrimPointerDown(e, clipId, clipWidth, isLocked);
      if (!trimStarted) {
        onClipPointerDown(e, clipId, isLocked);
      }
    },
    [clips, pxPerFrame, onTrimPointerDown, onClipPointerDown],
  );

  const activeSnap: { isSnapping: boolean; snapIndicatorPx: number | null } | null =
    dragInfo?.isSnapping ? dragInfo :
    trimInfo?.isSnapping ? trimInfo :
    null;

  return (
    <div
      style={{
        ...styles.lane,
        width,
        borderLeft: `3px solid ${trackColor}`,
        opacity: track.muted ? 0.5 : 1,
      }}
      aria-label={`Clip lane for track: ${track.name}`}
      data-track-id={track.id}
      data-track-type={track.type}
      onClick={handleLaneClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop target overlay — shows when an asset from the asset browser is dragged over */}
      {isAssetDragOver && (
        <div aria-hidden="true" style={styles.dropTargetOverlay} />
      )}

      {clips.map((clip) => {
        const assetId = 'assetId' in clip ? (clip as { assetId: string }).assetId : undefined;
        const assetData = assetId && assetDataMap ? assetDataMap[assetId] : undefined;
        const isDragging = dragInfo?.draggingClipIds.has(clip.id) ?? false;

        // During trim: render the trimmed clip at its ghost dimensions.
        const isTrimming = trimInfo?.clipId === clip.id;
        const ghostLeft = isTrimming ? trimInfo!.ghostStartFrame * pxPerFrame : undefined;
        const ghostWidth = isTrimming ? Math.max(2, trimInfo!.ghostDurationFrames * pxPerFrame) : undefined;

        return (
          <ClipBlock
            key={clip.id}
            clip={clip}
            pxPerFrame={pxPerFrame}
            isSelected={selectedClipIds.has(clip.id)}
            isLocked={track.locked}
            assetData={assetData}
            laneHeight={TRACK_ROW_HEIGHT}
            scrollOffsetX={scrollOffsetX}
            onClick={handleClipClick}
            onPointerDown={handleClipPointerDown}
            onContextMenu={handleClipContextMenu}
            isDragging={isDragging}
            ghostLeft={ghostLeft}
            ghostWidth={ghostWidth}
            getTrimCursor={getTrimCursor}
          />
        );
      })}

      {/* Ghost blocks during drag — same-track only (clips stay on their original track) */}
      {dragInfo && (
        <ClipLaneGhosts
          clips={clips}
          pxPerFrame={pxPerFrame}
          scrollOffsetX={scrollOffsetX}
          dragInfo={dragInfo}
          assetDataMap={assetDataMap}
        />
      )}

      {/* Snap indicator line */}
      {activeSnap?.isSnapping && activeSnap.snapIndicatorPx !== null && (
        <div
          aria-hidden="true"
          style={{
            ...styles.snapIndicator,
            left: activeSnap.snapIndicatorPx,
          }}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canSplit={canSplit}
          onAction={handleContextMenuAction}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
}

const styles = {
  lane: {
    height: TRACK_ROW_HEIGHT,
    background: LANE_BG,
    position: 'relative' as const,
    overflow: 'hidden',
    borderBottom: '1px solid #252535',
  } as React.CSSProperties,
  dropTargetOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: DROP_TARGET_OVERLAY,
    border: '1px dashed #7C3AED',
    pointerEvents: 'none' as const,
    zIndex: 5,
    borderRadius: 4,
  } as React.CSSProperties,
  snapIndicator: {
    position: 'absolute' as const,
    top: 0,
    width: 1,
    height: '100%',
    background: SNAP_INDICATOR_COLOR,
    pointerEvents: 'none' as const,
    zIndex: 10,
  } as React.CSSProperties,
};
