import { useCallback, useRef, useState } from 'react';
import type React from 'react';

import { TIMELINE_PANEL_HEIGHT } from '@/features/timeline/components/timelinePanelStyles';

/** Minimum timeline panel height in pixels. */
export const MIN_TIMELINE_HEIGHT = 80;

/** Maximum timeline panel height in pixels. */
export const MAX_TIMELINE_HEIGHT = 600;

/** Return type of the useTimelineResize hook. */
export type UseTimelineResizeResult = {
  /** Current timeline panel height in pixels. */
  timelineHeight: number;
  /** Pointer-down handler — initiates drag; call `setPointerCapture` internally. */
  onResizePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Pointer-move handler — updates height while dragging. */
  onResizePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Pointer-up handler — ends drag; releases pointer capture. */
  onResizePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
};

/**
 * Manages the resizable timeline panel height for the desktop layout.
 *
 * Returns the current `timelineHeight` and three pointer event handlers to
 * spread on the resize handle element. Uses pointer capture so that dragging
 * remains stable even when the pointer moves outside the handle element.
 *
 * Dragging the handle **upward** increases the timeline height (and shrinks
 * the preview area above it); dragging **downward** decreases it.
 */
export function useTimelineResize(): UseTimelineResizeResult {
  const [timelineHeight, setTimelineHeight] = useState(TIMELINE_PANEL_HEIGHT);

  // Mirror current height into a ref so the pointer-down handler always
  // captures the latest value without needing it as a dep (keeps callbacks stable).
  const heightRef = useRef(timelineHeight);
  heightRef.current = timelineHeight;

  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startHeight: heightRef.current };
  }, []);

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = dragState.current.startY - e.clientY; // upward drag = positive delta = taller
    const next = Math.max(MIN_TIMELINE_HEIGHT, Math.min(MAX_TIMELINE_HEIGHT, dragState.current.startHeight + delta));
    setTimelineHeight(next);
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
  }, []);

  return { timelineHeight, onResizePointerDown, onResizePointerMove, onResizePointerUp };
}
