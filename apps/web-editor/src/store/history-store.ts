import { useSyncExternalStore } from 'react';
import type { Patch } from 'immer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PatchEntry = {
  patches: Patch[];
  inversePatches: Patch[];
};

type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

// ---------------------------------------------------------------------------
// Internal store state — module-level singleton so all subscribers share it.
// ---------------------------------------------------------------------------

/** Stack of applied operations. Each entry holds forward + inverse patches. */
let undoStack: PatchEntry[] = [];

/**
 * Stack of undone operations, available for redo.
 * Cleared whenever a new operation is pushed (i.e. `pushPatches` is called).
 */
let redoStack: PatchEntry[] = [];

/**
 * Accumulated forward patches since the last `drainPatches()` call.
 * Used by `useAutosave` to collect the diff to send to the API.
 */
let accumulatedPatches: Patch[] = [];

/**
 * Accumulated inverse patches since the last `drainPatches()` call.
 */
let accumulatedInversePatches: Patch[] = [];

let snapshot: HistoryState = { canUndo: false, canRedo: false };
const listeners = new Set<() => void>();

function buildSnapshot(): HistoryState {
  return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}

function notifyListeners(): void {
  snapshot = buildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

// ---------------------------------------------------------------------------
// Internal — called only by project-store
// ---------------------------------------------------------------------------

/**
 * Pushes a new forward/inverse patch pair onto the undo stack and appends
 * forward patches to the accumulated drain buffer.
 *
 * Clears the redo stack because a new operation supersedes any undone future.
 *
 * Called exclusively by `project-store.setProject`.
 */
export function pushPatches(patches: Patch[], inversePatches: Patch[]): void {
  undoStack.push({ patches, inversePatches });
  redoStack = [];
  accumulatedPatches = accumulatedPatches.concat(patches);
  accumulatedInversePatches = accumulatedInversePatches.concat(inversePatches);
  notifyListeners();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the current history state snapshot. */
export function getSnapshot(): HistoryState {
  return snapshot;
}

/** Subscribes to history state changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the last undo-stack entry (inverse patches) to allow the caller to
 * apply them to the project document, and pops the entry off the undo stack.
 *
 * The caller (`useUndoRedo` hook or similar) is responsible for calling
 * `setProject(applyPatches(current, inversePatchesToApply))` after consuming
 * the returned entry so that the document is actually reverted.
 *
 * Returns `null` when there is nothing to undo.
 */
export function undo(): PatchEntry | null {
  const entry = undoStack.pop();
  if (!entry) return null;
  redoStack.push(entry);
  notifyListeners();
  return entry;
}

/**
 * Returns the last redo-stack entry (forward patches) and moves it back to
 * the undo stack.
 *
 * Returns `null` when there is nothing to redo.
 */
export function redo(): PatchEntry | null {
  const entry = redoStack.pop();
  if (!entry) return null;
  undoStack.push(entry);
  notifyListeners();
  return entry;
}

/**
 * Returns all accumulated forward and inverse patches collected since the last
 * call to `drainPatches`, then clears the internal accumulator.
 *
 * Used by `useAutosave` to obtain the diff payload to POST to the API.
 */
export function drainPatches(): { patches: Patch[]; inversePatches: Patch[] } {
  const drained = {
    patches: accumulatedPatches,
    inversePatches: accumulatedInversePatches,
  };
  accumulatedPatches = [];
  accumulatedInversePatches = [];
  return drained;
}

/** Whether there are patches accumulated since the last drain. */
export function hasPendingPatches(): boolean {
  return accumulatedPatches.length > 0;
}

/**
 * Resets all internal state to the initial empty state.
 *
 * Call this when the active project changes so that accumulated patches from
 * the departing project cannot be drained into the incoming project's first
 * autosave. Also resets the undo/redo stacks because they reference the old
 * project document's patch history.
 */
export function resetHistoryStore(): void {
  undoStack = [];
  redoStack = [];
  accumulatedPatches = [];
  accumulatedInversePatches = [];
  snapshot = { canUndo: false, canRedo: false };
  notifyListeners();
}

/**
 * Alias kept for backward compatibility with existing test files that call
 * `_resetForTesting()` directly. New code should call `resetHistoryStore()`.
 *
 * @internal
 */
export function _resetForTesting(): void {
  resetHistoryStore();
}

/**
 * React hook that subscribes to history state changes.
 * Returns `{ canUndo, canRedo }`.
 */
export function useHistoryStore(): HistoryState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
