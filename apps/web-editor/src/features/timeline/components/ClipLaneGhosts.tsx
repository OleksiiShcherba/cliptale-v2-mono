import React from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

import { TRACK_ROW_HEIGHT } from './TrackHeader';
import { ClipBlock } from './ClipBlock';
import type { ClipAssetData } from './ClipBlock';
import type { ClipDragInfo } from '../hooks/useClipDrag';

interface ClipLaneGhostsProps {
  trackId: string;
  /** Clips that belong to this track (used for same-track ghost rendering). */
  clips: ReadonlyArray<Clip & { layer?: number }>;
  pxPerFrame: number;
  scrollOffsetX: number;
  dragInfo: ClipDragInfo;
  assetDataMap?: Readonly<Record<string, ClipAssetData>>;
}

/**
 * Renders ghost blocks during a clip drag:
 * - Same-track ghosts: projected positions for clips being dragged within this track.
 * - Cross-track ghosts: clips dragged from another track that will land on this one.
 *
 * Separated from ClipLane to keep that component under the 300-line limit.
 */
export function ClipLaneGhosts({
  trackId,
  clips,
  pxPerFrame,
  scrollOffsetX,
  dragInfo,
  assetDataMap,
}: ClipLaneGhostsProps): React.ReactElement {
  // Same-track ghost blocks — rendered at projected positions
  const sameTrackGhosts = clips.map((clip) => {
    const ghostLeftPx = dragInfo.ghostPositions.get(clip.id);
    if (ghostLeftPx === undefined) return null;

    // If being dragged to a different track, don't render ghost here.
    if (dragInfo.targetTrackId !== null && dragInfo.targetTrackId !== trackId) return null;

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
        scrollOffsetX={scrollOffsetX}
        onClick={() => {/* ghost is non-interactive */}}
        ghostLeft={ghostLeftPx * pxPerFrame}
      />
    );
  });

  // Cross-track ghost blocks — clips dragged from another track to this one
  const crossTrackGhostClips = dragInfo.targetTrackId === trackId
    ? dragInfo.draggingClipSnapshots.filter(c => c.trackId !== trackId)
    : [];

  const crossTrackGhosts = crossTrackGhostClips.map((clip) => {
    const ghostLeftPx = dragInfo.ghostPositions.get(clip.id);
    if (ghostLeftPx === undefined) return null;

    const assetId = 'assetId' in clip ? (clip as { assetId: string }).assetId : undefined;
    const assetData = assetId && assetDataMap ? assetDataMap[assetId] : undefined;

    return (
      <ClipBlock
        key={`cross-ghost-${clip.id}`}
        clip={clip}
        pxPerFrame={pxPerFrame}
        isSelected={false}
        isLocked={false}
        assetData={assetData}
        laneHeight={TRACK_ROW_HEIGHT}
        scrollOffsetX={scrollOffsetX}
        onClick={() => {/* ghost is non-interactive */}}
        ghostLeft={ghostLeftPx * pxPerFrame}
      />
    );
  });

  return <>{sameTrackGhosts}{crossTrackGhosts}</>;
}
