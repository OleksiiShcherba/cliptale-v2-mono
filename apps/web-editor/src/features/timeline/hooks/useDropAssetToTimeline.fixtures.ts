import type { Clip, ProjectDoc, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

/** Creates a minimal `ProjectDoc` fixture for use in useDropAssetToTimeline tests. */
export function makeProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [] as Track[],
    clips: [] as Clip[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ProjectDoc;
}

/** Creates a minimal `Asset` fixture for use in useDropAssetToTimeline tests. */
export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'test.mp4',
    contentType: 'video/mp4',
    status: 'ready',
    durationSeconds: 5,
    thumbnailUri: null,
    storageUri: 's3://bucket/test.mp4',
    waveformUri: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
