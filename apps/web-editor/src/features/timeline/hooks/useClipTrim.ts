/**
 * useClipTrim — Pointer-event-based clip trim interaction.
 *
 * Hovering within TRIM_HANDLE_PX (8px) of a clip's left or right edge shows
 * the `ew-resize` cursor. Dragging the:
 *
 * - Left edge: adjusts `startFrame` (timeline position) and `trimInFrame`
 *   simultaneously — the clip moves in the timeline but the in-point into the
 *   source asset changes.
 * - Right edge: adjusts `trimOutFrame` and `durationFrames` — the clip stays
 *   anchored at its start; only its duration and out-point change.
 *
 * Constraints:
 * - Duration cannot drop below 1 frame.
 * - trimInFrame cannot become negative (no trim before asset start).
 * - If asset duration is known (via `assetDurationFrames`), trim is capped at
 *   the asset boundary; otherwise only the 1-frame minimum is enforced.
 *
 * Snapping uses the same `useSnapping` hook as `useClipDrag`.
 * PATCH is called on `pointerup`, not during drag.
 */

import { useCallback, useRef, useState } from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';
import { getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';

import { patchClip } from '../api';
import { useSnapping } from './useSnapping';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixel distance from a clip edge within which the trim cursor activates. */
export const TRIM_HANDLE_PX = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrimEdge = 'left' | 'right';

interface TrimState {
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
}

export interface TrimDragInfo {
  clipId: string;
  edge: TrimEdge;
  /** Projected new startFrame during a left-edge trim. */
  ghostStartFrame: number;
  /** Projected new durationFrames during any trim. */
  ghostDurationFrames: number;
  /** Whether a snap is currently active. */
  isSnapping: boolean;
  /** Pixel position of the snap indicator line (null when not snapping). */
  snapIndicatorPx: number | null;
}

export interface UseClipTrimReturn {
  /** Current trim info for rendering. Null when no trim is in progress. */
  trimInfo: TrimDragInfo | null;
  /**
   * Called on `onPointerMove` on a `ClipBlock` to detect edge proximity and
   * update the cursor. Returns the cursor value to apply.
   */
  getTrimCursor: (
    e: React.MouseEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
  ) => 'ew-resize' | null;
  /**
   * Called on `onPointerDown` on a `ClipBlock` when the pointer is over a
   * trim handle. Returns true if a trim was initiated (caller should suppress
   * drag from starting).
   */
  onTrimPointerDown: (
    e: React.PointerEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
    assetDurationFrames?: number,
  ) => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClipTrim(projectId: string): UseClipTrimReturn {
  const trimStateRef = useRef<TrimState | null>(null);
  const [trimInfo, setTrimInfo] = useState<TrimDragInfo | null>(null);

  const { snap } = useSnapping({
    clips: (getProjectSnapshot().clips ?? []) as ReadonlyArray<Clip>,
    draggingClipIds: trimInfo ? new Set([trimInfo.clipId]) : new Set<string>(),
    playheadFrame: getEphemeralSnapshot().playheadFrame,
    pxPerFrame: getEphemeralSnapshot().pxPerFrame,
  });

  /** Resolves the new startFrame and durationFrames for the current pointer position. */
  const resolveTrimedFrames = useCallback(
    (
      ts: TrimState,
      currentPointerX: number,
    ): {
      newStartFrame: number;
      newDurationFrames: number;
      newTrimInFrame: number;
      newTrimOutFrame: number | undefined;
      snapResult: ReturnType<typeof snap>;
    } => {
      const pxPerFrame = getEphemeralSnapshot().pxPerFrame;
      const deltaFrames = (currentPointerX - ts.startPointerX) / pxPerFrame;

      if (ts.edge === 'left') {
        // Left-edge trim: startFrame shifts right (trim in) or left (trim out).
        // The raw new left-edge frame (raw, before snapping).
        const rawNewLeft = ts.originalStartFrame + deltaFrames;
        const snapResult = snap(Math.max(0, rawNewLeft));
        const snappedLeft = snapResult.frame;

        const leftDelta = snappedLeft - ts.originalStartFrame;
        const newTrimInFrame = Math.max(0, ts.originalTrimInFrame + leftDelta);
        // Duration shrinks/grows as start moves right/left.
        const newDurationFrames = Math.max(1, ts.originalDurationFrames - leftDelta);
        // Clamp left edge to not exceed the right edge (keep at least 1 frame).
        const clampedLeft = ts.originalStartFrame + ts.originalDurationFrames - newDurationFrames;

        return {
          newStartFrame: Math.max(0, clampedLeft),
          newDurationFrames,
          newTrimInFrame,
          newTrimOutFrame: ts.originalTrimOutFrame,
          snapResult,
        };
      } else {
        // Right-edge trim: the right edge moves; startFrame stays fixed.
        const originalRightEdge = ts.originalStartFrame + ts.originalDurationFrames;
        const rawNewRight = originalRightEdge + deltaFrames;
        const snapResult = snap(Math.max(ts.originalStartFrame + 1, rawNewRight));
        const snappedRight = snapResult.frame;

        const newDurationFrames = Math.max(1, snappedRight - ts.originalStartFrame);
        // trimOutFrame = total source frames trimmed from the right.
        const totalSourceFrames = ts.assetDurationFrames;
        let newTrimOutFrame: number | undefined;
        if (totalSourceFrames !== undefined) {
          const rawTrimOut = ts.originalTrimInFrame + newDurationFrames;
          // Cap at asset boundary
          newTrimOutFrame = Math.min(totalSourceFrames, rawTrimOut);
        } else {
          newTrimOutFrame = ts.originalTrimOutFrame;
        }

        return {
          newStartFrame: ts.originalStartFrame,
          newDurationFrames,
          newTrimInFrame: ts.originalTrimInFrame,
          newTrimOutFrame,
          snapResult,
        };
      }
    },
    [snap],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const ts = trimStateRef.current;
      if (!ts || ts.cancelled) return;

      const {
        newStartFrame,
        newDurationFrames,
        snapResult,
      } = resolveTrimedFrames(ts, e.clientX);

      setTrimInfo({
        clipId: ts.clipId,
        edge: ts.edge,
        ghostStartFrame: newStartFrame,
        ghostDurationFrames: newDurationFrames,
        isSnapping: snapResult.isSnapping,
        snapIndicatorPx: snapResult.snapPx,
      });
    },
    [resolveTrimedFrames],
  );

  const commitTrim = useCallback(
    async (ts: TrimState, pointerX: number) => {
      const {
        newStartFrame,
        newDurationFrames,
        newTrimInFrame,
        newTrimOutFrame,
      } = resolveTrimedFrames(ts, pointerX);

      const project = getProjectSnapshot();
      const updatedClips = (project.clips ?? []).map((clip) => {
        if (clip.id !== ts.clipId) return clip;
        return {
          ...clip,
          startFrame: newStartFrame,
          durationFrames: newDurationFrames,
          ...(clip.type !== 'text-overlay'
            ? { trimInFrame: newTrimInFrame, trimOutFrame: newTrimOutFrame }
            : {}),
        };
      });

      const updatedProject = { ...project, clips: updatedClips };
      setProject(updatedProject);

      await patchClip(projectId, ts.clipId, {
        startFrame: newStartFrame,
        durationFrames: newDurationFrames,
        ...(ts.edge === 'left'
          ? { trimInFrames: newTrimInFrame }
          : { trimOutFrames: newTrimOutFrame }),
      });
    },
    [projectId, resolveTrimedFrames],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const ts = trimStateRef.current;
      if (!ts) return;

      (e.target as Element).releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyDown);

      if (!ts.cancelled) {
        void commitTrim(ts, e.clientX);
      }

      trimStateRef.current = null;
      setTrimInfo(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handlePointerMove, commitTrim],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const ts = trimStateRef.current;
      if (!ts) return;

      ts.cancelled = true;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyDown);

      trimStateRef.current = null;
      setTrimInfo(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handlePointerMove, handlePointerUp],
  );

  /**
   * Detects whether the pointer is within `TRIM_HANDLE_PX` of a clip edge.
   * Returns `'ew-resize'` if so, `null` otherwise.
   */
  const getTrimCursor = useCallback(
    (
      e: React.MouseEvent,
      _clipId: string,
      clipWidth: number,
      isLocked: boolean,
    ): 'ew-resize' | null => {
      if (isLocked) return null;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetX = e.clientX - rect.left;

      if (offsetX <= TRIM_HANDLE_PX || offsetX >= clipWidth - TRIM_HANDLE_PX) {
        return 'ew-resize';
      }
      return null;
    },
    [],
  );

  /**
   * Checks if pointer is on a trim handle and initiates trim if so.
   * Returns `true` if trim was started (caller should not start a drag).
   */
  const onTrimPointerDown = useCallback(
    (
      e: React.PointerEvent,
      clipId: string,
      clipWidth: number,
      isLocked: boolean,
      assetDurationFrames?: number,
    ): boolean => {
      if (isLocked || e.button !== 0) return false;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetX = e.clientX - rect.left;

      let edge: TrimEdge | null = null;
      if (offsetX <= TRIM_HANDLE_PX) edge = 'left';
      else if (offsetX >= clipWidth - TRIM_HANDLE_PX) edge = 'right';

      if (!edge) return false;

      e.preventDefault();
      e.stopPropagation();

      const allClips = (getProjectSnapshot().clips ?? []) as Clip[];
      const clip = allClips.find((c) => c.id === clipId);
      if (!clip) return false;

      trimStateRef.current = {
        clipId,
        edge,
        originalStartFrame: clip.startFrame,
        originalDurationFrames: clip.durationFrames,
        originalTrimInFrame:
          clip.type !== 'text-overlay' ? (clip.trimInFrame ?? 0) : 0,
        originalTrimOutFrame:
          clip.type !== 'text-overlay' ? clip.trimOutFrame : undefined,
        startPointerX: e.clientX,
        assetDurationFrames,
        cancelled: false,
      };

      setTrimInfo({
        clipId,
        edge,
        ghostStartFrame: clip.startFrame,
        ghostDurationFrames: clip.durationFrames,
        isSnapping: false,
        snapIndicatorPx: null,
      });

      (e.target as Element).setPointerCapture(e.pointerId);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('keydown', handleKeyDown);

      return true;
    },
    [handlePointerMove, handlePointerUp, handleKeyDown],
  );

  return { trimInfo, getTrimCursor, onTrimPointerDown };
}
