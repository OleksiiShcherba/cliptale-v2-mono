import type { Asset } from '@/features/asset-manager/types';

/** Shared fixture builder for AssetDetailPanel tests. */
export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'clip.mp4',
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned/clip.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 5_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  };
}

export const PROJECT_CTX = { kind: 'project' as const, projectId: 'proj-001' };
export const DRAFT_CTX = { kind: 'draft' as const, draftId: 'draft-001' };
