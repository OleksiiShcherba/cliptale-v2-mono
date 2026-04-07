import { useSyncExternalStore } from 'react';
import { enablePatches, produceWithPatches } from 'immer';
import type { ProjectDoc } from '@ai-video-editor/project-schema';
import { computeProjectDuration } from '@ai-video-editor/editor-core';

import { pushPatches } from './history-store.js';

// Immer's Patches plugin must be enabled before produceWithPatches is called.
enablePatches();

// ---------------------------------------------------------------------------
// Dev fixture — seeds the store until the project CRUD epic lands.
// Includes a TextOverlayClip so the preview canvas shows visible content
// instead of a black rectangle when the editor is opened.
// ---------------------------------------------------------------------------
const DEV_PROJECT: ProjectDoc = {
  schemaVersion: 1,
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Dev Project',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
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
 */
export function setCurrentVersionId(id: number): void {
  currentVersionId = id;
}

/**
 * React hook that subscribes to the project store and returns the current
 * `ProjectDoc`. Components will re-render only when `setProject` is called.
 */
export function useProjectStore(): ProjectDoc {
  return useSyncExternalStore(subscribe, getSnapshot);
}
