/**
 * Internal types and helpers for useClipDrag.
 * Extracted here to keep useClipDrag.ts under the 300-line file limit.
 */

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
}
