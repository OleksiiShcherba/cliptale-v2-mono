/**
 * Internal types and helpers for useClipDrag.
 * Extracted here to keep useClipDrag.ts under the 300-line file limit.
 */

import type { Clip } from '@ai-video-editor/project-schema';

import { getTrackListBounds } from '@/store/timeline-refs';

/** Height of each track row — must match `TRACK_ROW_HEIGHT` in `TrackHeader.tsx`. */
export const DRAG_TRACK_ROW_HEIGHT = 48;

/** Snapshot of one clip's state at drag-start. */
export type ClipDragOrigin = {
  clipId: string;
  originalStartFrame: number;
  originalTrackId: string;
  /** Offset from the anchor clip's start to this clip's start (for multi-drag). */
  relativeOffset: number;
}

/** Runtime drag state held in a ref (not state — avoids extra renders). */
export type DragState = {
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
  /**
   * The track ID where dragged clips will land on drop.
   * Null when the pointer is outside the track list bounds.
   */
  targetTrackId: string | null;
  /**
   * Full clip snapshots for all dragged clips — needed by target-track ClipLane
   * to render ghost blocks for cross-track drags.
   */
  draggingClipSnapshots: ReadonlyArray<Clip & { layer?: number }>;
}

/**
 * Resolves the target track ID from the current pointer Y position using the
 * track list bounds registered in timeline-refs. Returns null when the pointer
 * is outside the track list.
 */
export function resolveTargetTrackId(clientY: number): string | null {
  const bounds = getTrackListBounds();
  if (!bounds) return null;

  const relativeY = clientY - bounds.topY;
  if (relativeY < 0) return null;

  const trackIndex = Math.floor(relativeY / DRAG_TRACK_ROW_HEIGHT);
  return bounds.trackIds[trackIndex] ?? null;
}
