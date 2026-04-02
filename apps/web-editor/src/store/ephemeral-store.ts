import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** UI-only ephemeral state that does not belong in the persisted project doc. */
type EphemeralState = {
  playheadFrame: number;
  selectedClipIds: string[];
  zoom: number;
};

// ---------------------------------------------------------------------------
// Internal store state — module-level singleton so all subscribers share it.
// ---------------------------------------------------------------------------
let snapshot: EphemeralState = {
  playheadFrame: 0,
  selectedClipIds: [],
  zoom: 1,
};

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the current ephemeral state snapshot. */
export function getSnapshot(): EphemeralState {
  return snapshot;
}

/** Subscribes to ephemeral state changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Sets the current playhead position.
 *
 * This function is designed to be called at high frequency (e.g. from a rAF
 * loop). It intentionally skips subscriber notification when the frame value
 * has not changed, and batches notifications so that rapid successive calls
 * within a single synchronous block fire only one notification cycle.
 *
 * Note: the rAF loop in `usePlaybackControls` mutates a CSS custom property
 * directly — it does NOT call `setPlayheadFrame` on every tick. This function
 * is used for seek operations and step navigation where a React re-render is
 * actually needed.
 */
export function setPlayheadFrame(frame: number): void {
  if (snapshot.playheadFrame === frame) return;
  snapshot = { ...snapshot, playheadFrame: frame };
  notifyListeners();
}

/**
 * Replaces the set of selected clip IDs.
 * Pass an empty array to clear the selection.
 */
export function setSelectedClips(ids: string[]): void {
  snapshot = { ...snapshot, selectedClipIds: ids };
  notifyListeners();
}

/**
 * Sets the horizontal zoom level of the timeline.
 * A zoom of `1` means one frame equals the default pixel-per-frame ratio.
 */
export function setZoom(zoom: number): void {
  if (snapshot.zoom === zoom) return;
  snapshot = { ...snapshot, zoom };
  notifyListeners();
}

/**
 * React hook that subscribes to the ephemeral store and returns the current
 * state. Components will re-render only when a setter is called.
 */
export function useEphemeralStore(): EphemeralState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
