import type { AudioClip, CaptionClip, ImageClip, TextOverlayClip, VideoClip } from '@ai-video-editor/project-schema';

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

/** Creates a minimal ImageClip for use in App component tests. */
export function makeImageClip(overrides: Partial<ImageClip> = {}): ImageClip {
  return {
    id: CLIP_ID,
    type: 'image',
    assetId: 'asset-001',
    trackId: TRACK_ID,
    startFrame: 0,
    durationFrames: 150,
    opacity: 1,
    ...overrides,
  };
}

/** Creates a minimal VideoClip for use in App component tests. */
export function makeVideoClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: CLIP_ID,
    type: 'video',
    assetId: 'asset-001',
    trackId: TRACK_ID,
    startFrame: 0,
    durationFrames: 150,
    trimInFrame: 0,
    opacity: 1,
    volume: 1,
    ...overrides,
  };
}

/** Creates a minimal AudioClip for use in App component tests. */
export function makeAudioClip(overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    id: CLIP_ID,
    type: 'audio',
    assetId: 'asset-001',
    trackId: TRACK_ID,
    startFrame: 0,
    durationFrames: 150,
    trimInFrame: 0,
    volume: 1,
    ...overrides,
  };
}

/** Creates a minimal CaptionClip for use in App component tests. */
export function makeCaptionClip(overrides: Partial<CaptionClip> = {}): CaptionClip {
  return {
    id: CLIP_ID,
    type: 'caption',
    trackId: TRACK_ID,
    startFrame: 0,
    durationFrames: 30,
    words: [],
    activeColor: '#FFFFFF',
    inactiveColor: 'rgba(255,255,255,0.35)',
    fontSize: 24,
    position: 'bottom',
    ...overrides,
  };
}

/** Creates a minimal ProjectDoc with optional clips for use in App component tests. */
export function makeProjectDoc(clips: Array<AudioClip | CaptionClip | ImageClip | TextOverlayClip | VideoClip> = []) {
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
