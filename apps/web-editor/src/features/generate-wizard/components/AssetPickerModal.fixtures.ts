/**
 * Shared test fixtures for AssetPickerModal tests.
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

/** Response returned when the server already filters by type (e.g. type=video). */
export const VIDEO_RESPONSE: AssetListResponse = {
  items: [VIDEO_ASSET],
  nextCursor: null,
  totals: { count: 1, bytesUsed: 500 * 1024 * 1024 },
};

export const IMAGE_RESPONSE: AssetListResponse = {
  items: [IMAGE_ASSET],
  nextCursor: null,
  totals: { count: 1, bytesUsed: 100 * 1024 * 1024 },
};

export const AUDIO_RESPONSE: AssetListResponse = {
  items: [AUDIO_ASSET],
  nextCursor: null,
  totals: { count: 1, bytesUsed: 20 * 1024 * 1024 },
};

export const EMPTY_RESPONSE: AssetListResponse = {
  items: [],
  nextCursor: null,
  totals: { count: 0, bytesUsed: 0 },
};
