import { useSyncExternalStore } from 'react';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// Dev fixture — seeds the store until the project CRUD epic lands.
// Includes a TextOverlayClip so the preview canvas shows visible content
// instead of a black rectangle when the editor is opened.
// ---------------------------------------------------------------------------
const DEV_TRACK_ID = '00000000-0000-0000-0000-000000000010';
const DEV_CLIP_ID = '00000000-0000-0000-0000-000000000020';

const DEV_PROJECT: ProjectDoc = {
  schemaVersion: 1,
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Dev Project',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [
    {
      id: DEV_TRACK_ID,
      type: 'overlay',
      name: 'Text Overlay',
      muted: false,
      locked: false,
    },
  ],
  clips: [
    {
      id: DEV_CLIP_ID,
      type: 'text-overlay',
      trackId: DEV_TRACK_ID,
      startFrame: 0,
      durationFrames: 300,
      text: 'ClipTale',
      fontSize: 64,
      color: '#F0F0FA',
      position: 'center',
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as ProjectDoc;

// ---------------------------------------------------------------------------
// Internal store state — module-level singleton so all subscribers share it.
// ---------------------------------------------------------------------------
let snapshot: ProjectDoc = DEV_PROJECT;
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
 * Pass a full `ProjectDoc` — partial updates are not supported here;
 * use Immer patches from `editor-core` to produce a new document first.
 */
export function setProject(doc: ProjectDoc): void {
  snapshot = doc;
  notifyListeners();
}

/**
 * React hook that subscribes to the project store and returns the current
 * `ProjectDoc`. Components will re-render only when `setProject` is called.
 */
export function useProjectStore(): ProjectDoc {
  return useSyncExternalStore(subscribe, getSnapshot);
}
