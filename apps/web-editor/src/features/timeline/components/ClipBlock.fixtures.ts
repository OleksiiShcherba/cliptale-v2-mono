import { vi } from 'vitest';

import type { CaptionClip, Clip } from '@ai-video-editor/project-schema';

export const videoClip: Clip & { layer?: number } = {
  id: 'clip-001',
  type: 'video',
  assetId: 'asset-001',
  trackId: 'track-001',
  startFrame: 10,
  durationFrames: 60,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
};

export const audioClip: Clip & { layer?: number } = {
  id: 'clip-002',
  type: 'audio',
  assetId: 'asset-002',
  trackId: 'track-001',
  startFrame: 0,
  durationFrames: 90,
  trimInFrame: 0,
  volume: 1,
};

export const captionClip: CaptionClip & { layer?: number } = {
  id: 'clip-003',
  type: 'caption',
  trackId: 'track-001',
  startFrame: 0,
  durationFrames: 60,
  words: [
    { word: 'Hello', startFrame: 0, endFrame: 15 },
    { word: 'world', startFrame: 16, endFrame: 30 },
  ],
  activeColor: '#FFFFFF',
  inactiveColor: 'rgba(255,255,255,0.35)',
  fontSize: 24,
  position: 'bottom',
};

export const defaultProps = {
  pxPerFrame: 4,
  isSelected: false,
  isLocked: false,
  laneHeight: 36,
  scrollOffsetX: 0,
  onClick: vi.fn(),
};
