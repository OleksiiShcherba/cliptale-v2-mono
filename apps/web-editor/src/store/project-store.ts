import { useSyncExternalStore } from 'react';
import { enablePatches, produceWithPatches } from 'immer';
import type { ProjectDoc } from '@ai-video-editor/project-schema';
import { computeProjectDuration } from '@ai-video-editor/editor-core';

import { pushPatches } from './history-store.js';

// ---------------------------------------------------------------------------
// Default schema and resolution values used when seeding an empty document.
// Extracted here so resetProjectStore can seed consistently with DEV_PROJECT.
// ---------------------------------------------------------------------------
const DEFAULT_SCHEMA_VERSION = 1 as const;
const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

// Immer's Patches plugin must be enabled before produceWithPatches is called.
enablePatches();

// ---------------------------------------------------------------------------
// Dev fixture — seeds the store until the project CRUD epic lands.
// Includes a TextOverlayClip so the preview canvas shows visible content
// instead of a black rectangle when the editor is opened.
// ---------------------------------------------------------------------------
const DEV_PROJECT: ProjectDoc = {
  schemaVersion: DEFAULT_SCHEMA_VERSION,
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Dev Project',
  fps: DEFAULT_FPS,
  durationFrames: 300,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  tracks: [],
  clips: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as ProjectDoc;

// ---------------------------------------------------------------------------
// Internal store state — module-level singleton so all subscribers share it.
// ---------------------------------------------------------------------------
let snapshot: ProjectDoc = DEV_PROJECT;
let currentVersionId: number | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the current project document snapshot. */
export function getSnapshot(): ProjectDoc {
  return snapshot;
}

/** Subscribes to project document changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replaces the stored project document and notifies all subscribers.
 * Internally uses `produceWithPatches` to derive forward and inverse patches,
 * which are pushed into `history-store` for undo/redo and autosave transport.
 *
 * The public signature is unchanged — callers still pass a full `ProjectDoc`.
 */
export function setProject(doc: ProjectDoc): void {
  const derived: ProjectDoc = {
    ...doc,
    durationFrames: computeProjectDuration(doc.clips, doc.fps),
  };
  // Returning a value from the Immer recipe replaces the draft wholesale.
  // This produces a structural-diff patch (only changed fields) while letting
  // us pass a plain object rather than mutating the draft imperatively.
  const [, patches, inversePatches] = produceWithPatches(
    snapshot,
    () => derived,
  );
  snapshot = derived;
  pushPatches(patches, inversePatches);
  notifyListeners();
}

/**
 * Replaces the stored project document WITHOUT pushing patches to the
 * history store. Used exclusively by `useUndoRedo` when applying undo/redo
 * operations — the patches for these operations are already managed by the
 * history store, and re-pushing would corrupt the undo/redo stacks.
 */
export function setProjectSilent(doc: ProjectDoc): void {
  const derived: ProjectDoc = {
    ...doc,
    durationFrames: computeProjectDuration(doc.clips, doc.fps),
  };
  snapshot = derived;
  notifyListeners();
}

/** Returns the version ID of the last successfully saved version, or null. */
export function getCurrentVersionId(): number | null {
  return currentVersionId;
}

/**
 * Sets the current version ID after a successful autosave.
 * Called by `useAutosave` once the API responds with the new version ID.
 * Notifies subscribers so hooks like `useCurrentVersionId` trigger a re-render.
 */
export function setCurrentVersionId(id: number): void {
  currentVersionId = id;
  notifyListeners();
}

/**
 * Resets the project store to an empty document seeded with the given
 * `projectId` and clears `currentVersionId`.
 *
 * Call this at the start of the hydration effect in `useProjectInit` **before**
 * fetching the latest version. This prevents `useAutosave` from draining
 * accumulated patches from project A into project B's first autosave write.
 *
 * The empty document is set silently (no patches pushed to history-store) so
 * the reset itself does not trigger an autosave. Notifies listeners so any
 * derived subscriptions (e.g. `useCurrentVersionId`) reflect the cleared state.
 */
export function resetProjectStore(projectId: string): void {
  const now = new Date().toISOString();
  snapshot = {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    id: projectId,
    title: '',
    fps: DEFAULT_FPS,
    durationFrames: DEFAULT_FPS * 5,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    tracks: [],
    clips: [],
    createdAt: now,
    updatedAt: now,
  } as unknown as ProjectDoc;
  currentVersionId = null;
  notifyListeners();
}

/**
 * React hook that subscribes to the project store and returns the current
 * `ProjectDoc`. Components will re-render only when `setProject` is called.
 */
export function useProjectStore(): ProjectDoc {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * React hook that subscribes to version ID changes. Returns the current
 * version ID or null if the project has not been saved yet.
 */
export function useCurrentVersionId(): number | null {
  return useSyncExternalStore(subscribe, getCurrentVersionId);
}
