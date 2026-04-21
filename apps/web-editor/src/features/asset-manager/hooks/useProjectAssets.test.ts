import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@/features/asset-manager/api', () => ({
  getAssets: vi.fn(),
}));

import { useProjectAssets } from './useProjectAssets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsset(id: string) {
  return {
    id,
    projectId: 'proj-001',
    filename: `${id}.mp4`,
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: `https://example.com/${id}.mp4`,
    status: 'ready' as const,
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 1024,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeEnvelope(assets: ReturnType<typeof makeAsset>[]) {
  return { items: assets, nextCursor: null, totals: { count: assets.length, bytesUsed: 0 } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProjectAssets', () => {
  const PROJECT_ID = 'proj-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('envelope → items extraction', () => {
    it('returns items from the paginated envelope', () => {
      const assets = [makeAsset('a1'), makeAsset('a2')];
      mockUseQuery.mockReturnValue({ data: makeEnvelope(assets), isLoading: false, isError: false });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.assets).toHaveLength(2);
      expect(result.current.assets[0].id).toBe('a1');
      expect(result.current.assets[1].id).toBe('a2');
    });

    it('returns empty array when envelope items is empty', () => {
      mockUseQuery.mockReturnValue({ data: makeEnvelope([]), isLoading: false, isError: false });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.assets).toEqual([]);
    });

    it('returns empty array when data is undefined (no cache entry yet)', () => {
      mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.assets).toEqual([]);
    });
  });

  describe('loading state', () => {
    it('returns isLoading: true while the query is in-flight', () => {
      mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading: false when the query has resolved', () => {
      mockUseQuery.mockReturnValue({ data: makeEnvelope([]), isLoading: false, isError: false });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('error state', () => {
    it('returns isError: true when the query fails', () => {
      mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.isError).toBe(true);
    });

    it('returns isError: false when the query succeeds', () => {
      mockUseQuery.mockReturnValue({ data: makeEnvelope([makeAsset('a1')]), isLoading: false, isError: false });

      const { result } = renderHook(() => useProjectAssets(PROJECT_ID));

      expect(result.current.isError).toBe(false);
    });
  });

  describe('query key', () => {
    it('calls useQuery with the shared cache key ["assets", projectId, "project"]', () => {
      mockUseQuery.mockReturnValue({ data: makeEnvelope([]), isLoading: false, isError: false });

      renderHook(() => useProjectAssets('my-project-id'));

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['assets', 'my-project-id', 'project'],
        }),
      );
    });
  });
});
