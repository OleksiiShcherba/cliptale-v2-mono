/**
 * useClipDrag — Pointer-event-based clip drag (move) interaction.
 *
 * When the user presses down on a ClipBlock:
 * 1. The pointer is captured on the element (`setPointerCapture`).
 * 2. A ghost position is tracked as the pointer moves.
 * 3. On pointerup: Immer mutation applied to the project doc + PATCH API call.
 * 4. Pressing Escape during drag cancels and restores original positions.
 *
 * Multi-clip drag: when multiple clips are selected, all selected clips move
 * together maintaining their relative `startFrame` offsets.
 */

import { useCallback, useRef, useState } from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';
import { getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';

import { patchClip } from '../api';
import { useSnapping } from './useSnapping';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Snapshot of one clip's state at drag-start. */
type ClipDragOrigin = {
  clipId: string;
  originalStartFrame: number;
  /** Offset from the anchor clip's start to this clip's start (for multi-drag). */
  relativeOffset: number;
}

/** Runtime drag state held in a ref (not state — avoids extra renders). */
type DragState = {
  /** Clip ID that received the initial pointerdown. */
  anchorClipId: string;
  /** All clips being moved (includes anchor). */
  origins: ClipDragOrigin[];
  /** Frame position of the pointer at drag-start. */
  startPointerFrame: number;
  /** Whether the drag has been cancelled via Escape. */
  cancelled: boolean;
}

/** Publicly returned drag state for rendering ghost clips. */
export type ClipDragInfo = {
  /** IDs of clips currently being dragged. */
  draggingClipIds: Set<string>;
  /** Map from clipId → projected new startFrame during drag. */
  ghostPositions: Map<string, number>;
  /** Whether a snap is currently active. */
  isSnapping: boolean;
  /** Pixel position of the snap indicator line (null when not snapping). */
  snapIndicatorPx: number | null;
}

export type UseClipDragReturn = {
  /** Current drag info for rendering. Null when no drag is in progress. */
  dragInfo: ClipDragInfo | null;
  /**
   * Must be attached to `onPointerDown` on each `ClipBlock`.
   * Initiates the drag sequence.
   */
  onClipPointerDown: (e: React.PointerEvent, clipId: string, isLocked: boolean) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClipDrag(projectId: string): UseClipDragReturn {
  const dragStateRef = useRef<DragState | null>(null);

  // React state for rendering ghost clips — updated only on pointer-move.
  const [dragInfo, setDragInfo] = useState<ClipDragInfo | null>(null);

  // We need access to snapping — the hook must be called unconditionally,
  // so we read current clips/playhead via snapshot and recompute on each move.
  const { snap } = useSnapping({
    clips: (getProjectSnapshot().clips ?? []) as ReadonlyArray<Clip>,
    draggingClipIds: dragInfo?.draggingClipIds ?? new Set<string>(),
    playheadFrame: getEphemeralSnapshot().playheadFrame,
    pxPerFrame: getEphemeralSnapshot().pxPerFrame,
  });

  /** Resolves the projected startFrame for the anchor clip given current pointer frame. */
  const resolvePositions = useCallback(
    (
      ds: DragState,
      currentPointerFrame: number,
    ): { positions: Map<string, number>; snapResult: ReturnType<typeof snap> } => {
      const rawAnchorFrame =
        ds.origins.find((o) => o.clipId === ds.anchorClipId)!.originalStartFrame +
        (currentPointerFrame - ds.startPointerFrame);

      const snapResult = snap(Math.max(0, rawAnchorFrame));
      const snappedAnchorFrame = snapResult.frame;
      const delta = snappedAnchorFrame - ds.origins.find((o) => o.clipId === ds.anchorClipId)!.originalStartFrame;

      const positions = new Map<string, number>();
      for (const origin of ds.origins) {
        positions.set(origin.clipId, Math.round(Math.max(0, origin.originalStartFrame + delta)));
      }

      return { positions, snapResult };
    },
    [snap],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds || ds.cancelled) return;

      const pxPerFrame = getEphemeralSnapshot().pxPerFrame;
      const currentPointerFrame = e.clientX / pxPerFrame;

      const { positions, snapResult } = resolvePositions(ds, currentPointerFrame);

      setDragInfo({
        draggingClipIds: new Set(ds.origins.map((o) => o.clipId)),
        ghostPositions: positions,
        isSnapping: snapResult.isSnapping,
        snapIndicatorPx: snapResult.snapPx,
      });
    },
    [resolvePositions],
  );

  const commitDrag = useCallback(
    async (ds: DragState, positions: Map<string, number>) => {
      const project = getProjectSnapshot();
      const updatedClips = (project.clips ?? []).map((clip) => {
        const newStart = positions.get(clip.id);
        if (newStart !== undefined) {
          return { ...clip, startFrame: newStart };
        }
        return clip;
      });

      const updatedProject = { ...project, clips: updatedClips };
      setProject(updatedProject);

      // Fire PATCH for each moved clip (do not await all — fire in parallel).
      await Promise.allSettled(
        ds.origins.map((origin) => {
          const newStart = positions.get(origin.clipId);
          if (newStart !== undefined && newStart !== origin.originalStartFrame) {
            return patchClip(projectId, origin.clipId, { startFrame: newStart });
          }
          return Promise.resolve();
        }),
      );
    },
    [projectId],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;

      (e.target as Element).releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyDown);

      if (!ds.cancelled) {
        const pxPerFrame = getEphemeralSnapshot().pxPerFrame;
        const currentPointerFrame = e.clientX / pxPerFrame;
        const { positions } = resolvePositions(ds, currentPointerFrame);
        void commitDrag(ds, positions);
      }

      dragStateRef.current = null;
      setDragInfo(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handlePointerMove, resolvePositions, commitDrag],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const ds = dragStateRef.current;
      if (!ds) return;

      ds.cancelled = true;

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyDown);

      dragStateRef.current = null;
      setDragInfo(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handlePointerMove, handlePointerUp],
  );

  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clipId: string, isLocked: boolean) => {
      if (isLocked) return;
      if (e.button !== 0) return; // left button only

      e.preventDefault();
      e.stopPropagation();

      const pxPerFrame = getEphemeralSnapshot().pxPerFrame;
      const selectedClipIds = getEphemeralSnapshot().selectedClipIds;
      const allClips = (getProjectSnapshot().clips ?? []) as Clip[];

      // Determine which clips to move: if the target is part of a multi-select,
      // move all selected clips; otherwise move only the target clip.
      const clipIdsToMove: string[] =
        selectedClipIds.includes(clipId) && selectedClipIds.length > 1
          ? selectedClipIds
          : [clipId];

      const anchorClip = allClips.find((c) => c.id === clipId);
      if (!anchorClip) return;

      const origins: ClipDragOrigin[] = clipIdsToMove
        .map((id) => {
          const c = allClips.find((clip) => clip.id === id);
          if (!c) return null;
          return {
            clipId: id,
            originalStartFrame: c.startFrame,
            relativeOffset: c.startFrame - anchorClip.startFrame,
          };
        })
        .filter((o): o is ClipDragOrigin => o !== null);

      const startPointerFrame = e.clientX / pxPerFrame;

      dragStateRef.current = {
        anchorClipId: clipId,
        origins,
        startPointerFrame,
        cancelled: false,
      };

      setDragInfo({
        draggingClipIds: new Set(clipIdsToMove),
        ghostPositions: new Map(origins.map((o) => [o.clipId, o.originalStartFrame])),
        isSnapping: false,
        snapIndicatorPx: null,
      });

      // Capture pointer on the DOM element for reliable tracking.
      (e.target as Element).setPointerCapture(e.pointerId);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('keydown', handleKeyDown);
    },
    [handlePointerMove, handlePointerUp, handleKeyDown],
  );

  return { dragInfo, onClipPointerDown };
}
