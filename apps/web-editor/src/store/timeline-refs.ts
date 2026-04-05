/**
 * Module-level bridge used by the rAF playback loop to mutate the timeline
 * playhead needle DOM element directly — without triggering React re-renders.
 *
 * `TimelinePanel` registers a setter on mount and clears it on unmount.
 * `usePlaybackControls` calls the setter on every rAF tick instead of
 * calling `setPlayheadFrame`, which would fire `useSyncExternalStore`
 * subscriber notifications at 60 fps.
 */

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
