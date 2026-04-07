import { useEffect, useRef } from 'react';
import type { FixedSizeList } from 'react-window';

import { setScrollOffsetX } from '@/store/ephemeral-store';

import { TRACK_HEADER_WIDTH } from '@/features/timeline/components/TrackHeader';

/**
 * Attaches non-passive wheel event listeners to the ruler and track-list wrapper
 * elements so that `preventDefault()` can be called to suppress browser scroll.
 *
 * - When the pointer is over the track header column (x < TRACK_HEADER_WIDTH) and
 *   only vertical delta is present, the event is forwarded to the `FixedSizeList`
 *   for vertical track scrolling.
 * - All other wheel events scroll the timeline horizontally via the ephemeral store.
 */
export function useTimelineWheel(refs: {
  rulerWrapperRef: React.RefObject<HTMLDivElement | null>;
  trackListWrapperRef: React.RefObject<HTMLDivElement | null>;
  trackListRef: React.RefObject<FixedSizeList | null>;
  scrollOffsetXRef: React.RefObject<number>;
  totalContentWidthRef: React.RefObject<number>;
  laneWidthRef: React.RefObject<number>;
}): void {
  const trackListScrollTopRef = useRef(0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const target = e.target as Element | null;
      const wrapper = refs.trackListWrapperRef.current;

      const isOverHeader =
        wrapper !== null &&
        target !== null &&
        wrapper.contains(target) &&
        (() => {
          const wrapperRect = wrapper.getBoundingClientRect();
          return e.clientX - wrapperRect.left < TRACK_HEADER_WIDTH;
        })();

      if (isOverHeader && e.deltaY !== 0 && e.deltaX === 0) {
        const list = refs.trackListRef.current;
        if (list) {
          const newScrollTop = Math.max(0, trackListScrollTopRef.current + e.deltaY);
          list.scrollTo(newScrollTop);
          trackListScrollTopRef.current = newScrollTop;
        }
        return;
      }

      const newOffset = refs.scrollOffsetXRef.current + e.deltaX + e.deltaY;
      const maxOffset = Math.max(0, refs.totalContentWidthRef.current - refs.laneWidthRef.current);
      setScrollOffsetX(Math.max(0, Math.min(newOffset, maxOffset)));
    };

    const ruler = refs.rulerWrapperRef.current;
    const trackList = refs.trackListWrapperRef.current;
    ruler?.addEventListener('wheel', handleWheel, { passive: false });
    trackList?.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      ruler?.removeEventListener('wheel', handleWheel);
      trackList?.removeEventListener('wheel', handleWheel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — all values read via stable refs
}
