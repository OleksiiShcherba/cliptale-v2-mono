import React, { useCallback, useState } from 'react';

import type { Clip, Track } from '@ai-video-editor/project-schema';
import { setSelectedClips, getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';
import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';

import { ClipBlock } from './ClipBlock';
import type { ClipAssetData } from './ClipBlock';
import { TRACK_ROW_HEIGHT } from './TrackHeader';
import { ClipContextMenu } from './ClipContextMenu';
import type { ClipDragInfo } from '../hooks/useClipDrag';
import type { TrimDragInfo } from '../hooks/useClipTrim';

// Design tokens mapped from track type
const TRACK_TYPE_COLORS: Record<Track['type'], string> = {
  video:        '#7C3AED',
  audio:        '#4C1D95',
  caption:      '#10B981',
  overlay:      '#F59E0B',
};

const LANE_BG = '#0D0D14';

/** Color of the snap indicator line. */
const SNAP_INDICATOR_COLOR = '#EF4444';

/** State for the open context menu. */
interface ContextMenuState {
  clipId: string;
  x: number;
  y: number;
}

interface ClipLaneProps {
  track: Track;
  /** Clips that belong to this track. */
  clips: ReadonlyArray<Clip & { layer?: number }>;
  /** Pixels per frame — used to position and size clip blocks. */
  pxPerFrame: number;
  /** Set of currently selected clip IDs. */
  selectedClipIds: ReadonlySet<string>;
  /** Width of the scrollable lane area in pixels. */
  width: number;
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
}

/**
 * Renders the clip lane for a single track.
 * Manages context menu state (right-click → split/delete/duplicate).
 * Handles drag, trim, selection, and ghost rendering.
 */
export function ClipLane({
  track,
  clips,
  pxPerFrame,
  selectedClipIds,
  width,
  assetDataMap,
  dragInfo,
  onClipPointerDown,
  trimInfo,
  getTrimCursor,
  onTrimPointerDown,
}: ClipLaneProps): React.ReactElement {
  const trackColor = TRACK_TYPE_COLORS[track.type];

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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

  /**
   * Combined pointer-down handler: trim takes priority over drag.
   */
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

  /** Opens the context menu at the pointer position. */
  const handleClipContextMenu = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      setContextMenu({ clipId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  /** Determines if the playhead is overlapping the given clip. */
  const isPlayheadOverlapping = useCallback(
    (clip: Clip): boolean => {
      const { playheadFrame } = getEphemeralSnapshot();
      return (
        playheadFrame >= clip.startFrame &&
        playheadFrame < clip.startFrame + clip.durationFrames
      );
    },
    [],
  );

  /** Handles context menu action dispatches. */
  const handleContextMenuAction = useCallback(
    (action: 'split' | 'delete' | 'duplicate') => {
      if (!contextMenu) return;
      const { clipId } = contextMenu;

      const project = getProjectSnapshot();
      const clip = (project.clips ?? []).find((c) => c.id === clipId);
      if (!clip) return;

      if (action === 'delete') {
        const updatedClips = (project.clips ?? []).filter((c) => c.id !== clipId);
        setProject({ ...project, clips: updatedClips });
        return;
      }

      if (action === 'duplicate') {
        // Insert a copy starting immediately after the original.
        const duplicateClip: Clip = {
          ...clip,
          id: crypto.randomUUID(),
          startFrame: clip.startFrame + clip.durationFrames,
        };
        const updatedClips = [...(project.clips ?? []), duplicateClip];
        setProject({ ...project, clips: updatedClips });
        return;
      }

      if (action === 'split') {
        const { playheadFrame } = getEphemeralSnapshot();
        if (!isPlayheadOverlapping(clip)) return;

        const splitOffset = playheadFrame - clip.startFrame;

        // First clip: trim out at split point.
        const firstClip: Clip = {
          ...clip,
          durationFrames: splitOffset,
          ...(clip.type !== 'text-overlay'
            ? { trimOutFrame: (clip.type === 'video' || clip.type === 'audio')
                ? (clip.trimInFrame ?? 0) + splitOffset
                : undefined }
            : {}),
        };

        // Second clip: starts at playhead, trimInFrame at split offset.
        const secondClip: Clip = {
          ...clip,
          id: crypto.randomUUID(),
          startFrame: playheadFrame,
          durationFrames: clip.durationFrames - splitOffset,
          ...(clip.type !== 'text-overlay'
            ? { trimInFrame: (clip.type === 'video' || clip.type === 'audio')
                ? (clip.trimInFrame ?? 0) + splitOffset
                : 0 }
            : {}),
        };

        const updatedClips = (project.clips ?? []).flatMap((c) =>
          c.id === clipId ? [firstClip, secondClip] : [c],
        );
        setProject({ ...project, clips: updatedClips });
      }
    },
    [contextMenu, isPlayheadOverlapping],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Determine active snap indicator from either drag or trim.
  const activeSnap: { isSnapping: boolean; snapIndicatorPx: number | null } | null =
    dragInfo?.isSnapping ? dragInfo :
    trimInfo?.isSnapping ? trimInfo :
    null;

  // Determine if canSplit for open context menu.
  const canSplit = contextMenu
    ? (() => {
        const project = getProjectSnapshot();
        const clip = (project.clips ?? []).find((c) => c.id === contextMenu.clipId);
        return clip ? isPlayheadOverlapping(clip) : false;
      })()
    : false;

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
    >
      {clips.map((clip) => {
        const assetId = 'assetId' in clip ? (clip as { assetId: string }).assetId : undefined;
        const assetData = assetId && assetDataMap ? assetDataMap[assetId] : undefined;
        const isDragging = dragInfo?.draggingClipIds.has(clip.id) ?? false;

        // During trim: render the trimmed clip at its ghost dimensions.
        const isTrimming = trimInfo?.clipId === clip.id;
        const ghostLeft = isTrimming
          ? trimInfo!.ghostStartFrame * pxPerFrame
          : undefined;
        const ghostWidth = isTrimming
          ? Math.max(2, trimInfo!.ghostDurationFrames * pxPerFrame)
          : undefined;

        return (
          <ClipBlock
            key={clip.id}
            clip={clip}
            pxPerFrame={pxPerFrame}
            isSelected={selectedClipIds.has(clip.id)}
            isLocked={track.locked}
            assetData={assetData}
            laneHeight={TRACK_ROW_HEIGHT}
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

      {/* Ghost blocks during drag — rendered at projected positions */}
      {dragInfo &&
        clips.map((clip) => {
          const ghostLeftPx = dragInfo.ghostPositions.get(clip.id);
          if (ghostLeftPx === undefined) return null;

          const assetId = 'assetId' in clip ? (clip as { assetId: string }).assetId : undefined;
          const assetData = assetId && assetDataMap ? assetDataMap[assetId] : undefined;

          return (
            <ClipBlock
              key={`ghost-${clip.id}`}
              clip={clip}
              pxPerFrame={pxPerFrame}
              isSelected={false}
              isLocked={false}
              assetData={assetData}
              laneHeight={TRACK_ROW_HEIGHT}
              onClick={() => {/* ghost is non-interactive */}}
              ghostLeft={ghostLeftPx * pxPerFrame}
            />
          );
        })}

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
