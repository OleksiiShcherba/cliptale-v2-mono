/**
 * ScrollbarStrip — 8px horizontal scrollbar below the timeline clip lane.
 *
 * The thumb width and position are derived proportionally from the visible
 * lane width vs the total content width. Thumb drag uses pointer capture so
 * scrolling continues when the pointer moves outside the thumb element.
 * When the content fits entirely in the lane the thumb fills the strip and
 * pointer events are disabled.
 */

import React from 'react';
import type { MutableRefObject } from 'react';

import { useScrollbarThumbDrag } from '@/features/timeline/hooks/useScrollbarThumbDrag';

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Height of the scrollbar strip in pixels. Import this in TimelinePanel to
 *  keep `TRACK_LIST_HEIGHT` consistent. */
export const SCROLLBAR_HEIGHT = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrollbarStripProps {
  /** Current horizontal scroll offset in pixels. */
  scrollOffsetX: number;
  /** Visible clip lane width in pixels (panel width minus track header). */
  laneWidth: number;
  /** Full timeline content width: `durationFrames * pxPerFrame`. */
  totalContentWidth: number;
  /** Ref to `scrollOffsetX` kept current on every parent render. */
  scrollOffsetXRef: MutableRefObject<number>;
  /** Left spacer width to align the strip with the clip lane. */
  headerWidth: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Horizontal scrollbar strip aligned with the clip lane. */
export function ScrollbarStrip({
  scrollOffsetX,
  laneWidth,
  totalContentWidth,
  scrollOffsetXRef,
  headerWidth,
}: ScrollbarStripProps): React.ReactElement {
  const isOverflow = totalContentWidth > laneWidth;
  const thumbWidth = isOverflow
    ? Math.max(16, (laneWidth / totalContentWidth) * laneWidth)
    : laneWidth;
  const thumbLeft = isOverflow
    ? Math.min((scrollOffsetX / totalContentWidth) * laneWidth, laneWidth - thumbWidth)
    : 0;

  const { handleThumbPointerDown, handleThumbPointerMove, handleThumbPointerUp } =
    useScrollbarThumbDrag(scrollOffsetXRef, laneWidth, totalContentWidth);

  return (
    <div style={styles.row}>
      <div style={{ width: headerWidth, flexShrink: 0 }} />
      <div style={styles.track}>
        <div
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(scrollOffsetX)}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(totalContentWidth - laneWidth))}
          style={{
            ...styles.thumb,
            width: thumbWidth,
            left: thumbLeft,
            cursor: isOverflow ? 'grab' : 'default',
            pointerEvents: isOverflow ? 'auto' : 'none',
          }}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerUp}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BORDER = '#252535';

const styles: Record<string, React.CSSProperties> = {
  row: {
    height: SCROLLBAR_HEIGHT,
    flexShrink: 0,
    display: 'flex',
    background: '#0D0D14',
  },
  track: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#1E1E2E',
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: BORDER,
    borderRadius: 4,
  },
};
