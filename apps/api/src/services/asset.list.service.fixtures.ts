/**
 * Shared Vitest fixtures for `asset.list.service` tests.
 *
 * Extracted so the split test files (`*.test.ts`, `*.cursor.test.ts`) can
 * stay under the 300-line limit without duplicating the `makeAsset` helper.
 */
import type { Asset } from '@/repositories/asset.repository.js';

export const BASE_URL = 'http://localhost:3001';
export const USER_ID = 'user-001';

/** Builds a fully-populated `Asset` row with sensible defaults, overridable per test. */
export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    fileId: 'asset-001',
    projectId: 'proj-001',
    userId: USER_ID,
    filename: 'clip.mp4',
    displayName: null,
    contentType: 'video/mp4',
    fileSizeBytes: 1_000_000,
    storageUri: 's3://bucket/clip.mp4',
    status: 'ready',
    errorMessage: null,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    fps: 30,
    thumbnailUri: 's3://bucket/thumb.jpg',
    waveformJson: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
