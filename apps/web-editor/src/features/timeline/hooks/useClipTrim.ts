/**
 * useClipTrim — Pointer-event-based clip trim interaction.
 * Left-edge drag adjusts startFrame + trimInFrame; right-edge adjusts trimOutFrame + durationFrames.
 * PATCH is called on pointerup. Escape cancels. Snap via useSnapping.
 */

import { useCallback, useRef, useState } from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';
import { getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';

import { patchClip } from '../api';
import { useSnapping } from './useSnapping';
import { resolveClipTrimFrames } from './clipTrimMath';
import type { TrimState } from './clipTrimMath';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixel distance from a clip edge within which the trim cursor activates. */
export const TRIM_HANDLE_PX = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrimDragInfo = {
  clipId: string;
  edge: 'left' | 'right';
  /** Projected new startFrame during a left-edge trim. */
  ghostStartFrame: number;
  /** Projected new durationFrames during any trim. */
  ghostDurationFrames: number;
  /** Whether a snap is currently active. */
  isSnapping: boolean;
  /** Pixel position of the snap indicator line (null when not snapping). */
  snapIndicatorPx: number | null;
};

export type UseClipTrimReturn = {
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
};

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

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const ts = trimStateRef.current;
      if (!ts || ts.cancelled) return;

      const { newStartFrame, newDurationFrames, snapResult } =
        resolveClipTrimFrames(ts, e.clientX, snap);

      setTrimInfo({
        clipId: ts.clipId,
        edge: ts.edge,
        ghostStartFrame: newStartFrame,
        ghostDurationFrames: newDurationFrames,
        isSnapping: snapResult.isSnapping,
        snapIndicatorPx: snapResult.snapPx,
      });
    },
    [snap],
  );

  const commitTrim = useCallback(
    async (ts: TrimState, pointerX: number) => {
      const { newStartFrame, newDurationFrames, newTrimInFrame, newTrimOutFrame } =
        resolveClipTrimFrames(ts, pointerX, snap);

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

      setProject({ ...project, clips: updatedClips });

      await patchClip(projectId, ts.clipId, {
        startFrame: newStartFrame,
        durationFrames: newDurationFrames,
        ...(ts.edge === 'left'
          ? { trimInFrames: newTrimInFrame }
          : { trimOutFrames: newTrimOutFrame }),
      });
    },
    [projectId, snap],
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

      let edge: 'left' | 'right' | null = null;
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
