import React from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

import { TRACK_ROW_HEIGHT } from './TrackHeader';
import { ClipBlock } from './ClipBlock';
import type { ClipAssetData } from './ClipBlock';
import type { ClipDragInfo } from '../hooks/useClipDrag';

interface ClipLaneGhostsProps {
  /** Clips that belong to this track (used for same-track ghost rendering). */
  clips: ReadonlyArray<Clip & { layer?: number }>;
  pxPerFrame: number;
  scrollOffsetX: number;
  dragInfo: ClipDragInfo;
  assetDataMap?: Readonly<Record<string, ClipAssetData>>;
}

/**
 * Renders ghost blocks during a clip drag — same-track only.
 * Clips always stay on their original track; cross-track drag is disabled.
 *
 * Separated from ClipLane to keep that component under the 300-line limit.
 */
export function ClipLaneGhosts({
  clips,
  pxPerFrame,
  scrollOffsetX,
  dragInfo,
  assetDataMap,
}: ClipLaneGhostsProps): React.ReactElement {
  const ghosts = clips.map((clip) => {
    const ghostLeftPx = dragInfo.ghostPositions.get(clip.id);
    if (ghostLeftPx === undefined) return null;

    const fileId = 'fileId' in clip ? (clip as { fileId: string }).fileId : undefined;
    const assetData = fileId && assetDataMap ? assetDataMap[fileId] : undefined;

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

  return <>{ghosts}</>;
}
