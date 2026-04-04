/**
 * Snapping hook for timeline drag and trim interactions.
 *
 * Provides a `snap` function that takes a raw frame position and returns the
 * nearest snapped frame within `SNAP_THRESHOLD_PX` pixels. Snap targets are:
 * - Frame 0 (start of timeline)
 * - The playhead frame
 * - Left and right edges of every other clip
 *
 * If no snap target is within the threshold, the original frame is returned.
 */

import { useMemo } from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

/** Pixel distance within which snapping activates. */
export const SNAP_THRESHOLD_PX = 5;

export interface SnapResult {
  /** The snapped frame value (may equal the input frame if no snap occurred). */
  frame: number;
  /** Whether snapping is active (a snap target was found within the threshold). */
  isSnapping: boolean;
  /** The pixel position of the active snap target (for drawing indicator). */
  snapPx: number | null;
}

interface UseSnappingParams {
  /** All clips in the project (used to compute clip-edge snap targets). */
  clips: ReadonlyArray<Clip>;
  /** IDs of clips currently being dragged — excluded from snap targets. */
  draggingClipIds: ReadonlySet<string>;
  /** Current playhead frame. */
  playheadFrame: number;
  /** Pixels per frame (current zoom). */
  pxPerFrame: number;
}

interface UseSnappingReturn {
  /**
   * Attempts to snap a raw frame value to the nearest snap target.
   * Returns the snapped frame, isSnapping flag, and snap pixel position.
   */
  snap: (rawFrame: number) => SnapResult;
}

/**
 * React hook that returns a `snap` function for timeline drag/trim operations.
 * Re-computes the snap target list only when its inputs change.
 */
export function useSnapping({
  clips,
  draggingClipIds,
  playheadFrame,
  pxPerFrame,
}: UseSnappingParams): UseSnappingReturn {
  // Build sorted list of snap target frames once per dependency change.
  const snapTargetFrames: number[] = useMemo(() => {
    const targets = new Set<number>();

    // Frame 0 is always a snap target.
    targets.add(0);

    // Playhead position.
    targets.add(playheadFrame);

    // Left and right edges of every non-dragging clip.
    for (const clip of clips) {
      if (draggingClipIds.has(clip.id)) continue;
      targets.add(clip.startFrame);
      targets.add(clip.startFrame + clip.durationFrames);
    }

    return Array.from(targets).sort((a, b) => a - b);
  }, [clips, draggingClipIds, playheadFrame]);

  const snap = useMemo(
    () =>
      (rawFrame: number): SnapResult => {
        const thresholdFrames = SNAP_THRESHOLD_PX / pxPerFrame;
        let bestFrame = rawFrame;
        let bestDelta = Infinity;

        for (const target of snapTargetFrames) {
          const delta = Math.abs(target - rawFrame);
          if (delta < bestDelta) {
            bestDelta = delta;
            bestFrame = target;
          }
        }

        const isSnapping = bestDelta <= thresholdFrames;
        return {
          frame: isSnapping ? bestFrame : rawFrame,
          isSnapping,
          snapPx: isSnapping ? bestFrame * pxPerFrame : null,
        };
      },
    [snapTargetFrames, pxPerFrame],
  );

  return { snap };
}
