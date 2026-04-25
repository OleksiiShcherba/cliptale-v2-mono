/**
 * Pure math helpers for clip trim frame resolution.
 * Extracted from useClipTrim to keep the hook under the 300-line limit.
 */

import { getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';
import type { useSnapping } from './useSnapping';

export type TrimEdge = 'left' | 'right';

export type TrimState = {
  clipId: string;
  edge: TrimEdge;
  /** `startFrame` of the clip at trim-start. */
  originalStartFrame: number;
  /** `durationFrames` of the clip at trim-start. */
  originalDurationFrames: number;
  /** `trimInFrame` of the clip at trim-start. */
  originalTrimInFrame: number;
  /** `trimOutFrame` of the clip at trim-start (undefined if unset). */
  originalTrimOutFrame: number | undefined;
  /** Pointer X position at trim-start (in pixels). */
  startPointerX: number;
  /**
   * Total frames available in the source asset.
   * Used to cap trim-out so trim does not exceed the asset boundary.
   * Optional — when absent only the 1-frame minimum is enforced.
   */
  assetDurationFrames?: number;
  cancelled: boolean;
};

type SnapFn = ReturnType<typeof useSnapping>['snap'];

export type ResolvedTrimFrames = {
  newStartFrame: number;
  newDurationFrames: number;
  newTrimInFrame: number;
  newTrimOutFrame: number | undefined;
  snapResult: ReturnType<SnapFn>;
};

/**
 * Given the current pointer X and a TrimState snapshot, resolves the new
 * startFrame, durationFrames, trimInFrame, and trimOutFrame for the clip.
 * Pure computation — no side effects.
 */
export function resolveClipTrimFrames(
  ts: TrimState,
  currentPointerX: number,
  snap: SnapFn,
): ResolvedTrimFrames {
  const pxPerFrame = getEphemeralSnapshot().pxPerFrame;
  const deltaFrames = (currentPointerX - ts.startPointerX) / pxPerFrame;

  if (ts.edge === 'left') {
    const rawNewLeft = ts.originalStartFrame + deltaFrames;
    const snapResult = snap(Math.max(0, rawNewLeft));
    const snappedLeft = snapResult.frame;

    const leftDelta = snappedLeft - ts.originalStartFrame;
    const newTrimInFrame = Math.max(0, ts.originalTrimInFrame + leftDelta);
    const newDurationFrames = Math.max(1, ts.originalDurationFrames - leftDelta);
    const clampedLeft = ts.originalStartFrame + ts.originalDurationFrames - newDurationFrames;

    return {
      newStartFrame: Math.round(Math.max(0, clampedLeft)),
      newDurationFrames: Math.round(newDurationFrames),
      newTrimInFrame: Math.round(newTrimInFrame),
      newTrimOutFrame: ts.originalTrimOutFrame !== undefined ? Math.round(ts.originalTrimOutFrame) : undefined,
      snapResult,
    };
  } else {
    const originalRightEdge = ts.originalStartFrame + ts.originalDurationFrames;
    const rawNewRight = originalRightEdge + deltaFrames;
    const snapResult = snap(Math.max(ts.originalStartFrame + 1, rawNewRight));
    const snappedRight = snapResult.frame;

    const newDurationFrames = Math.max(1, snappedRight - ts.originalStartFrame);
    const totalSourceFrames = ts.assetDurationFrames;
    let newTrimOutFrame: number | undefined;
    if (totalSourceFrames !== undefined) {
      const rawTrimOut = ts.originalTrimInFrame + newDurationFrames;
      newTrimOutFrame = Math.min(totalSourceFrames, rawTrimOut);
    } else {
      newTrimOutFrame = ts.originalTrimOutFrame;
    }

    return {
      newStartFrame: ts.originalStartFrame,
      newDurationFrames: Math.round(newDurationFrames),
      newTrimInFrame: ts.originalTrimInFrame,
      newTrimOutFrame: newTrimOutFrame !== undefined ? Math.round(newTrimOutFrame) : undefined,
      snapResult,
    };
  }
}
