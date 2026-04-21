import type { Clip, ProjectDoc, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

export const TEST_PROJECT_ID = 'proj-001';

export function makeProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: TEST_PROJECT_ID,
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

export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: TEST_PROJECT_ID,
    filename: 'test.mp4',
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned/test.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 1_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
