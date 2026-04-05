/**
 * Shared test fixtures for useClipDeleteShortcut tests.
 * Imported by both .test.ts and .guards.test.ts to avoid duplication.
 */

import type { Clip, Track, ProjectDoc } from '@ai-video-editor/project-schema';

/** Creates a minimal Track fixture with the given id and lock state. */
export function makeTrack(id: string, locked = false): Track {
  return { id, type: 'video', name: 'Track', muted: false, locked };
}

/** Creates a minimal video Clip fixture assigned to the given track. */
export function makeClip(id: string, trackId: string): Clip {
  return {
    id,
    type: 'video',
    assetId: 'asset-001',
    trackId,
    startFrame: 0,
    durationFrames: 30,
    trimInFrame: 0,
    volume: 1,
    opacity: 1,
  };
}

/** Creates a minimal ProjectDoc fixture containing the given tracks and clips. */
export function makeProjectDoc(tracks: Track[], clips: Clip[]): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    createdAt: '',
    updatedAt: '',
  } as unknown as ProjectDoc;
}

/** Dispatches a synthetic `keydown` event with the given key to `document`. */
export function dispatchKey(key: string): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
}
