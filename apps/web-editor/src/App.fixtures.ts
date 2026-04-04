import type { TextOverlayClip } from '@ai-video-editor/project-schema';

export const CLIP_ID = '00000000-0000-0000-0000-000000000020';
export const TRACK_ID = '00000000-0000-0000-0000-000000000010';

/** Creates a minimal TextOverlayClip for use in App component tests. */
export function makeTextOverlayClip(overrides: Partial<TextOverlayClip> = {}): TextOverlayClip {
  return {
    id: CLIP_ID,
    type: 'text-overlay',
    trackId: TRACK_ID,
    startFrame: 0,
    durationFrames: 30,
    text: 'Hello',
    fontSize: 24,
    color: '#FFFFFF',
    position: 'bottom',
    ...overrides,
  };
}

/** Creates a minimal ProjectDoc with optional clips for use in App component tests. */
export function makeProjectDoc(clips: TextOverlayClip[] = []) {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
