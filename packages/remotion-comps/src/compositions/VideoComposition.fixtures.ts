import type { ProjectDoc } from '@ai-video-editor/project-schema';

const NOW = new Date().toISOString();

/**
 * Creates a minimal valid `ProjectDoc` for use in tests.
 * All fields are set to sensible defaults; pass `overrides` to customise.
 */
export function makeProjectDoc(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Test Project',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProjectDoc;
}

/** Fixture video track with `muted: false`. */
export const TRACK_VIDEO = {
  id: 'track-video-001',
  type: 'video' as const,
  name: 'Video 1',
  muted: false,
  locked: false,
};

/** Fixture audio track with `muted: false`. */
export const TRACK_AUDIO = {
  id: 'track-audio-001',
  type: 'audio' as const,
  name: 'Audio 1',
  muted: false,
  locked: false,
};

/** Fixture overlay track with `muted: false`. */
export const TRACK_OVERLAY = {
  id: 'track-overlay-001',
  type: 'overlay' as const,
  name: 'Overlay 1',
  muted: false,
  locked: false,
};

/** Fixture video clip placed at frame 0 on `TRACK_VIDEO`. */
export const CLIP_VIDEO = {
  id: 'clip-video-001',
  type: 'video' as const,
  assetId: 'asset-001',
  trackId: TRACK_VIDEO.id,
  startFrame: 0,
  durationFrames: 90,
  trimInFrame: 0,
  trimOutFrame: undefined,
  opacity: 1,
  volume: 1,
};

/** Fixture audio clip placed at frame 0 on `TRACK_AUDIO`, with trim values set. */
export const CLIP_AUDIO = {
  id: 'clip-audio-001',
  type: 'audio' as const,
  assetId: 'asset-002',
  trackId: TRACK_AUDIO.id,
  startFrame: 0,
  durationFrames: 90,
  trimInFrame: 5,
  trimOutFrame: 80,
  volume: 0.8,
};

/** Fixture image clip placed at frame 0 on `TRACK_OVERLAY`. */
export const CLIP_IMAGE = {
  id: 'clip-image-001',
  type: 'image' as const,
  assetId: 'asset-img-001',
  trackId: TRACK_OVERLAY.id,
  startFrame: 0,
  durationFrames: 60,
  opacity: 0.9,
};

/** Fixture text-overlay clip placed at frame 10 on `TRACK_OVERLAY`. */
export const CLIP_TEXT = {
  id: 'clip-text-001',
  type: 'text-overlay' as const,
  trackId: TRACK_OVERLAY.id,
  startFrame: 10,
  durationFrames: 30,
  text: 'Hello',
  fontSize: 24,
  color: '#FFFFFF',
  position: 'bottom' as const,
};

/** Fixture caption track with `muted: false`. */
export const TRACK_CAPTION = {
  id: 'track-caption-001',
  type: 'caption' as const,
  name: 'Caption 1',
  muted: false,
  locked: false,
};

/** Fixture caption clip with two words, placed at frame 0 on `TRACK_CAPTION`. */
export const CLIP_CAPTION = {
  id: 'clip-caption-001',
  type: 'caption' as const,
  trackId: TRACK_CAPTION.id,
  startFrame: 0,
  durationFrames: 60,
  words: [
    { word: 'Hello', startFrame: 0, endFrame: 15 },
    { word: 'world', startFrame: 16, endFrame: 30 },
  ],
  activeColor: '#FFFFFF',
  inactiveColor: 'rgba(255,255,255,0.35)',
  fontSize: 24,
  position: 'bottom' as const,
};
