/**
 * Module-level bridges used by high-frequency operations to access timeline
 * layout state without triggering React re-renders.
 *
 * Playhead bridge: used by the rAF playback loop to mutate the timeline
 * playhead needle DOM element directly.
 *
 * Track list bounds bridge: used by `useClipDrag` to compute which track
 * the pointer is over during a cross-track drag.
 */

// ---------------------------------------------------------------------------
// Playhead bridge
// ---------------------------------------------------------------------------

let _updater: ((frame: number) => void) | null = null;

/**
 * Called by the rAF loop with the current player frame.
 * No-ops if no `TimelinePanel` is mounted.
 */
export function updateTimelinePlayheadFrame(frame: number): void {
  _updater?.(frame);
}

/** Registered by `TimelinePanel` on mount. */
export function registerTimelinePlayheadUpdater(fn: (frame: number) => void): void {
  _updater = fn;
}

/** Called by `TimelinePanel` on unmount. */
export function unregisterTimelinePlayheadUpdater(): void {
  _updater = null;
}

// ---------------------------------------------------------------------------
// Track list bounds bridge
// ---------------------------------------------------------------------------

/** Bounds and track order used by `useClipDrag` to resolve target track from pointer Y. */
type TrackListBounds = {
  /** Client Y coordinate of the top of the track list container. */
  topY: number;
  /** Ordered array of track IDs matching the visual row order in the timeline. */
  trackIds: readonly string[];
};

let _trackListBounds: TrackListBounds | null = null;

/**
 * Called by `TimelinePanel` whenever the track list container position or
 * the track array changes. Enables `useClipDrag` to compute target track
 * from pointer Y without needing a React ref passed through the tree.
 */
export function registerTrackListBounds(topY: number, trackIds: readonly string[]): void {
  _trackListBounds = { topY, trackIds };
}

/**
 * Returns the most recently registered track list bounds, or null if
 * `TimelinePanel` has not yet mounted.
 */
export function getTrackListBounds(): TrackListBounds | null {
  return _trackListBounds;
}
