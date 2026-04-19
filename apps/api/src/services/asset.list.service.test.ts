/**
 * Unit tests for `asset.list.service` — the wizard gallery list endpoint.
 *
 * The repository is mocked via `vi.hoisted` so no DB is needed. Covers:
 *   - type filter → MIME prefix mapping (video/image/audio/all)
 *   - duration derivation from `durationFrames` + `fps`
 *   - thumbnail proxy URL construction + null pass-through
 *   - label fallback from `displayName` to `filename`
 *   - totals bucketing with missing buckets defaulting to zero
 *
 * Cursor and pagination tests live in `asset.list.service.cursor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BASE_URL, USER_ID, makeAsset } from './asset.list.service.fixtures.js';

const { mockFindReady, mockGetTotals } = vi.hoisted(() => ({
  mockFindReady: vi.fn(),
  mockGetTotals: vi.fn(),
}));

vi.mock('@/repositories/asset.repository.js', () => ({
  findReadyForUser: mockFindReady,
  getReadyTotalsForUser: mockGetTotals,
}));

import { listForUser } from './asset.list.service.js';

describe('asset.list.service / listForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTotals.mockResolvedValue([]);
  });

  describe('type filter', () => {
    it('maps type=video to the video/ MIME prefix', async () => {
      mockFindReady.mockResolvedValueOnce([]);

      await listForUser({ userId: USER_ID, type: 'video', limit: 24, baseUrl: BASE_URL });

      expect(mockFindReady).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, mimePrefix: 'video/', limit: 24 }),
      );
    });

    it('maps type=image to the image/ MIME prefix', async () => {
      mockFindReady.mockResolvedValueOnce([]);

      await listForUser({ userId: USER_ID, type: 'image', limit: 24, baseUrl: BASE_URL });

      expect(mockFindReady).toHaveBeenCalledWith(
        expect.objectContaining({ mimePrefix: 'image/' }),
      );
    });

    it('maps type=audio to the audio/ MIME prefix', async () => {
      mockFindReady.mockResolvedValueOnce([]);

      await listForUser({ userId: USER_ID, type: 'audio', limit: 24, baseUrl: BASE_URL });

      expect(mockFindReady).toHaveBeenCalledWith(
        expect.objectContaining({ mimePrefix: 'audio/' }),
      );
    });

    it('omits the MIME filter when type=all', async () => {
      mockFindReady.mockResolvedValueOnce([]);

      await listForUser({ userId: USER_ID, type: 'all', limit: 24, baseUrl: BASE_URL });

      const params = mockFindReady.mock.calls[0]![0];
      expect(params.mimePrefix).toBeUndefined();
    });
  });

  describe('item serialization', () => {
    it('derives durationSeconds from durationFrames / fps when both are present', async () => {
      mockFindReady.mockResolvedValueOnce([makeAsset({ durationFrames: 300, fps: 30 })]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items[0]!.durationSeconds).toBe(10);
    });

    it('returns null durationSeconds when durationFrames is missing', async () => {
      mockFindReady.mockResolvedValueOnce([makeAsset({ durationFrames: null, fps: 30 })]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items[0]!.durationSeconds).toBeNull();
    });

    it('builds a thumbnail proxy URL when thumbnailUri is set', async () => {
      mockFindReady.mockResolvedValueOnce([
        makeAsset({ fileId: 'asset-abc', thumbnailUri: 's3://bucket/thumb.jpg' }),
      ]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items[0]!.thumbnailUrl).toBe(`${BASE_URL}/assets/asset-abc/thumbnail`);
    });

    it('returns null thumbnailUrl when thumbnailUri is null', async () => {
      mockFindReady.mockResolvedValueOnce([makeAsset({ thumbnailUri: null })]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items[0]!.thumbnailUrl).toBeNull();
    });

    it('prefers displayName over filename for the label', async () => {
      mockFindReady.mockResolvedValueOnce([
        makeAsset({ filename: 'raw.mp4', displayName: 'My Cut' }),
      ]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items[0]!.label).toBe('My Cut');
    });

    it('falls back to filename when displayName is null', async () => {
      mockFindReady.mockResolvedValueOnce([
        makeAsset({ filename: 'raw.mp4', displayName: null }),
      ]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items[0]!.label).toBe('raw.mp4');
    });

    it('maps MIME prefix to the correct enum bucket for images and audio', async () => {
      mockFindReady.mockResolvedValueOnce([
        makeAsset({ fileId: 'a1', contentType: 'image/png' }),
        makeAsset({ fileId: 'a2', contentType: 'audio/mpeg' }),
      ]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items.find((i) => i.id === 'a1')!.type).toBe('image');
      expect(result.items.find((i) => i.id === 'a2')!.type).toBe('audio');
    });
  });

  describe('totals bucketing', () => {
    it('sums counts per bucket and aggregates bytesUsed across all buckets', async () => {
      mockFindReady.mockResolvedValueOnce([]);
      mockGetTotals.mockResolvedValueOnce([
        { mimePrefix: 'video/', count: 5, bytes: 1000 },
        { mimePrefix: 'image/', count: 2, bytes: 300 },
        { mimePrefix: 'audio/', count: 3, bytes: 700 },
      ]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.totals).toEqual({ videos: 5, images: 2, audio: 3, bytesUsed: 2000 });
    });

    it('defaults missing buckets to zero', async () => {
      mockFindReady.mockResolvedValueOnce([]);
      mockGetTotals.mockResolvedValueOnce([{ mimePrefix: 'video/', count: 4, bytes: 500 }]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.totals).toEqual({ videos: 4, images: 0, audio: 0, bytesUsed: 500 });
    });

    it('returns zero totals when the user has no ready assets', async () => {
      mockFindReady.mockResolvedValueOnce([]);
      mockGetTotals.mockResolvedValueOnce([]);

      const result = await listForUser({
        userId: USER_ID,
        type: 'all',
        limit: 24,
        baseUrl: BASE_URL,
      });

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.totals).toEqual({ videos: 0, images: 0, audio: 0, bytesUsed: 0 });
    });
  });
});
