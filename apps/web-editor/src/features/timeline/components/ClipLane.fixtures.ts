import { vi } from 'vitest';

import type { Clip, Track, ProjectDoc } from '@ai-video-editor/project-schema';
import type { ClipDragInfo } from '../hooks/useClipDrag';
import type { TrimDragInfo } from '../hooks/useClipTrim';

export const videoTrack: Track = {
  id: 'track-001',
  type: 'video',
  name: 'Video Track',
  muted: false,
  locked: false,
};

export const clip1: Clip = {
  id: 'clip-001',
  type: 'video',
  fileId: 'asset-001',
  trackId: 'track-001',
  startFrame: 0,
  durationFrames: 30,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
};

export const clip2: Clip = {
  id: 'clip-002',
  type: 'video',
  fileId: 'asset-002',
  trackId: 'track-001',
  startFrame: 50,
  durationFrames: 20,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
};

export const defaultProps = {
  projectId: 'project-001',
  track: videoTrack,
  clips: [clip1, clip2] as ReadonlyArray<Clip & { layer?: number }>,
  pxPerFrame: 4,
  selectedClipIds: new Set<string>(),
  width: 800,
  scrollOffsetX: 0,
  dragInfo: null as ClipDragInfo | null,
  onClipPointerDown: vi.fn(),
  trimInfo: null as TrimDragInfo | null,
  getTrimCursor: vi.fn().mockReturnValue(null),
  onTrimPointerDown: vi.fn().mockReturnValue(false),
};

export function makeProjectDoc(clips: Clip[]): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'project-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips,
    createdAt: '',
    updatedAt: '',
  } as unknown as ProjectDoc;
}

export function makeAsset() {
  return {
    id: 'asset-001',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
    status: 'ready' as const,
    durationSeconds: 5,
    thumbnailUri: null,
    createdAt: '',
  };
}

/** Creates a ClipDragInfo with required fields, overriding with provided values. */
export function makeDragInfo(overrides: Partial<ClipDragInfo> = {}): ClipDragInfo {
  return {
    draggingClipIds: new Set<string>(),
    ghostPositions: new Map<string, number>(),
    isSnapping: false,
    snapIndicatorPx: null,
    ...overrides,
  };
}
