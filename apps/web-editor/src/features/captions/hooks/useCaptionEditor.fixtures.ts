import type {
  CaptionClip,
  Clip,
  ProjectDoc,
  TextOverlayClip,
  Track,
} from '@ai-video-editor/project-schema';

export const CLIP_ID = '00000000-0000-0000-0000-000000000020';
export const TRACK_ID = '00000000-0000-0000-0000-000000000010';

/** Factory for a default `TextOverlayClip`; accepts partial overrides for per-test customization. */
export function makeClip(overrides: Partial<TextOverlayClip> = {}): TextOverlayClip {
  return {
    id: CLIP_ID,
    type: 'text-overlay',
    trackId: TRACK_ID,
    startFrame: 10,
    durationFrames: 50,
    text: 'Hello',
    fontSize: 24,
    color: '#FFFFFF',
    position: 'bottom',
    ...overrides,
  };
}

/** Factory for a default `CaptionClip` with two sample words; accepts partial overrides. */
export function makeCaptionClip(overrides: Partial<CaptionClip> = {}): CaptionClip {
  return {
    id: CLIP_ID,
    type: 'caption',
    trackId: TRACK_ID,
    startFrame: 10,
    durationFrames: 50,
    words: [
      { word: 'Hello', startFrame: 10, endFrame: 20 },
      { word: 'world', startFrame: 20, endFrame: 30 },
    ],
    activeColor: '#FFFFFF',
    inactiveColor: 'rgba(255,255,255,0.35)',
    fontSize: 24,
    position: 'bottom',
    ...overrides,
  };
}

/** Factory for a minimal `ProjectDoc` shaped to satisfy `useCaptionEditor` mutations in tests. */
export function makeProject(clips: Clip[] = [], overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [{ id: TRACK_ID, type: 'overlay', name: 'Captions', muted: false, locked: false }] as Track[],
    clips,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ProjectDoc;
}
