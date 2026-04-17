/**
 * Shared test fixtures for MediaGalleryPanel tests.
 */

import type { AssetListResponse, AssetSummary } from '../types';

export const VIDEO_ASSET: AssetSummary = {
  id: 'v1',
  type: 'video',
  label: 'Intro clip',
  durationSeconds: 12,
  thumbnailUrl: 'http://example.com/thumb/v1.jpg',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const IMAGE_ASSET: AssetSummary = {
  id: 'i1',
  type: 'image',
  label: 'Hero banner',
  durationSeconds: null,
  thumbnailUrl: 'http://example.com/thumb/i1.jpg',
  createdAt: '2026-01-02T00:00:00.000Z',
};

export const AUDIO_ASSET: AssetSummary = {
  id: 'a1',
  type: 'audio',
  label: 'Background music',
  durationSeconds: 90,
  thumbnailUrl: null,
  createdAt: '2026-01-03T00:00:00.000Z',
};

export const MIXED_RESPONSE: AssetListResponse = {
  items: [VIDEO_ASSET, IMAGE_ASSET, AUDIO_ASSET],
  nextCursor: null,
  totals: { count: 3, bytesUsed: 1.5 * 1024 ** 3 }, // 1.5 GB
};

export const EMPTY_RESPONSE: AssetListResponse = {
  items: [],
  nextCursor: null,
  totals: { count: 0, bytesUsed: 0 },
};

/** Response with only video assets — used to verify section-omission. */
export const VIDEO_ONLY_RESPONSE: AssetListResponse = {
  items: [VIDEO_ASSET],
  nextCursor: null,
  totals: { count: 1, bytesUsed: 500 * 1024 * 1024 },
};
