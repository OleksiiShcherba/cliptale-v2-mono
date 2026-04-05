/**
 * useScrollbarThumbDrag — pointer-capture-based horizontal scrollbar drag.
 *
 * Tracks a thumb drag on the timeline scrollbar strip. On pointerdown the
 * pointer is captured so scroll continues when the pointer leaves the thumb.
 * On pointermove the scroll offset is updated in real time via `setScrollOffsetX`.
 * Refs keep geometry fresh without recreating callbacks (same pattern as the
 * wheel-handler in TimelinePanel).
 */

import { useCallback, useRef } from 'react';
import type React from 'react';

import { setScrollOffsetX } from '@/store/ephemeral-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Drag state held in a ref — avoids extra renders during thumb drag. */
type ThumbDragState = {
  startX: number;
  startOffset: number;
};

export type UseScrollbarThumbDragReturn = {
  handleThumbPointerDown: React.PointerEventHandler<HTMLDivElement>;
  handleThumbPointerMove: React.PointerEventHandler<HTMLDivElement>;
  handleThumbPointerUp: React.PointerEventHandler<HTMLDivElement>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages thumb drag for the timeline horizontal scrollbar.
 *
 * @param scrollOffsetXRef - Ref to the current scroll offset (kept fresh by
 *   the caller on every render so pointerdown always reads the latest value).
 * @param laneWidth - Visible clip lane width in pixels.
 * @param totalContentWidth - Full timeline content width (`durationFrames * pxPerFrame`).
 */
export function useScrollbarThumbDrag(
  scrollOffsetXRef: React.MutableRefObject<number>,
  laneWidth: number,
  totalContentWidth: number,
): UseScrollbarThumbDragReturn {
  const thumbDragRef = useRef<ThumbDragState | null>(null);

  // Refs are updated on every call (every render of the parent) so that the
  // stable callbacks below always read current geometry values.
  const laneWidthRef = useRef(laneWidth);
  laneWidthRef.current = laneWidth;
  const totalContentWidthRef = useRef(totalContentWidth);
  totalContentWidthRef.current = totalContentWidth;

  const handleThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      thumbDragRef.current = { startX: e.clientX, startOffset: scrollOffsetXRef.current };
    },
    // scrollOffsetXRef is a stable ref object — no dependency needed.
    [],
  );

  const handleThumbPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!thumbDragRef.current) return;
      const ratio = totalContentWidthRef.current / laneWidthRef.current;
      const dx = e.clientX - thumbDragRef.current.startX;
      const newOffset = Math.max(0, thumbDragRef.current.startOffset + dx * ratio);
      setScrollOffsetX(newOffset);
    },
    // All geometry is read from refs — no deps needed.
    [],
  );

  const handleThumbPointerUp = useCallback(() => {
    thumbDragRef.current = null;
  }, []);

  return { handleThumbPointerDown, handleThumbPointerMove, handleThumbPointerUp };
}
