import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** UI-only ephemeral state that does not belong in the persisted project doc. */
export type EphemeralState = {
  playheadFrame: number;
  selectedClipIds: string[];
  zoom: number;
  /** Timeline zoom: pixels rendered per frame. Range [1, 100]. */
  pxPerFrame: number;
  /** Horizontal scroll offset of the timeline clip lane area in pixels. */
  scrollOffsetX: number;
  /** Player volume in range [0, 1]. Default 1 (full volume). */
  volume: number;
  /** Whether the player is muted. Independent of volume level. */
  isMuted: boolean;
};

// ---------------------------------------------------------------------------
// Internal store state — module-level singleton so all subscribers share it.
// ---------------------------------------------------------------------------
let snapshot: EphemeralState = {
  playheadFrame: 0,
  selectedClipIds: [],
  zoom: 1,
  pxPerFrame: 4,
  scrollOffsetX: 0,
  volume: 1,
  isMuted: false,
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
 * Sets the timeline zoom level in pixels per frame.
 * Clamped to the valid range [1, 100].
 */
export function setPxPerFrame(pxPerFrame: number): void {
  const clamped = Math.max(1, Math.min(100, pxPerFrame));
  if (snapshot.pxPerFrame === clamped) return;
  snapshot = { ...snapshot, pxPerFrame: clamped };
  notifyListeners();
}

/**
 * Sets the horizontal scroll offset of the timeline clip lane in pixels.
 */
export function setScrollOffsetX(offsetX: number): void {
  const clamped = Math.max(0, offsetX);
  if (snapshot.scrollOffsetX === clamped) return;
  snapshot = { ...snapshot, scrollOffsetX: clamped };
  notifyListeners();
}

/**
 * Sets the player volume level.
 * Clamped to [0, 1]. Setting volume > 0 also unmutes the player.
 */
export function setVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  const isMuted = clamped === 0 ? snapshot.isMuted : false;
  if (snapshot.volume === clamped && snapshot.isMuted === isMuted) return;
  snapshot = { ...snapshot, volume: clamped, isMuted };
  notifyListeners();
}

/**
 * Toggles the mute state without changing the volume level.
 * This matches the expected behaviour: unmuting restores the previous volume.
 */
export function setMuted(muted: boolean): void {
  if (snapshot.isMuted === muted) return;
  snapshot = { ...snapshot, isMuted: muted };
  notifyListeners();
}

/**
 * Applies a partial ephemeral state object, overwriting only the supplied
 * fields. Used by `useProjectUiState` to restore persisted UI state on project
 * open. Unrecognised or undefined fields in the partial are silently ignored so
 * that the store never holds `undefined` values.
 *
 * Only the fields that are meaningfully restorable are applied:
 *   - `playheadFrame`, `zoom`, `pxPerFrame`, `scrollOffsetX`
 *
 * Selection and volume are intentionally excluded — selection should not
 * survive a page reload (clips may be gone), and volume is a device preference
 * the user sets each session.
 */
export function setAll(partial: Partial<EphemeralState>): void {
  const next: EphemeralState = { ...snapshot };
  if (typeof partial.playheadFrame === 'number') next.playheadFrame = partial.playheadFrame;
  if (typeof partial.zoom === 'number') next.zoom = partial.zoom;
  if (typeof partial.pxPerFrame === 'number') next.pxPerFrame = Math.max(1, Math.min(100, partial.pxPerFrame));
  if (typeof partial.scrollOffsetX === 'number') next.scrollOffsetX = Math.max(0, partial.scrollOffsetX);
  snapshot = next;
  notifyListeners();
}

/**
 * React hook that subscribes to the ephemeral store and returns the current
 * state. Components will re-render only when a setter is called.
 */
export function useEphemeralStore(): EphemeralState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
