import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import * as projectStore from '@/store/project-store.js';
import * as ephemeralStore from '@/store/ephemeral-store.js';

import { useRemotionPlayer } from './useRemotionPlayer.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useQueries is still used for the fallback path (orphan clips not in cache).
// useQueryClient provides getQueryData for the cache-read path.
const { mockGetQueryData, mockUseQueryClient } = vi.hoisted(() => ({
  mockGetQueryData: vi.fn(),
  mockUseQueryClient: vi.fn(() => ({ getQueryData: mockGetQueryData })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueries: vi.fn(),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock('@/store/project-store.js', () => ({
  getSnapshot: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

vi.mock('@/store/ephemeral-store.js', () => ({
  getSnapshot: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

vi.mock('@/features/asset-manager/api.js', () => ({
  getAsset: vi.fn(),
  getAssets: vi.fn(),
}));

vi.mock('@/lib/config.js', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

import { useQueries } from '@tanstack/react-query';

const mockUseQueries = vi.mocked(useQueries);
const mockGetProjectSnapshot = vi.mocked(projectStore.getSnapshot);
const mockGetEphemeralSnapshot = vi.mocked(ephemeralStore.getSnapshot);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProjectDoc(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as ProjectDoc;
}

function makeEphemeralState(overrides = {}) {
  return { playheadFrame: 0, selectedClipIds: [], zoom: 1, ...overrides };
}

function makeAssetItem(id: string, status = 'ready') {
  return {
    id,
    projectId: 'proj-001',
    filename: `${id}.mp4`,
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: `https://example.com/${id}.mp4`,
    status,
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

function makeEnvelope(items: ReturnType<typeof makeAssetItem>[]) {
  return { items, nextCursor: null, totals: { count: items.length, bytesUsed: 0 } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRemotionPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // By default: no cached list data → falls through to useQueries
    mockGetQueryData.mockReturnValue(undefined);
    mockUseQueries.mockReturnValue([]);
    mockGetProjectSnapshot.mockReturnValue(makeProjectDoc());
    mockGetEphemeralSnapshot.mockReturnValue(makeEphemeralState());
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('returns correct projectDoc', () => {
    it('returns the current project document from the project store', () => {
      const doc = makeProjectDoc({ title: 'My Video' });
      mockGetProjectSnapshot.mockReturnValue(doc);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.projectDoc.title).toBe('My Video');
    });
  });

  describe('returns correct currentFrame', () => {
    it('returns the playheadFrame from the ephemeral store', () => {
      mockGetEphemeralSnapshot.mockReturnValue(makeEphemeralState({ playheadFrame: 42 }));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.currentFrame).toBe(42);
    });

    it('returns 0 when playheadFrame is 0', () => {
      mockGetEphemeralSnapshot.mockReturnValue(makeEphemeralState({ playheadFrame: 0 }));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.currentFrame).toBe(0);
    });
  });

  describe('playerRef', () => {
    it('returns a ref object', () => {
      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.playerRef).toBeDefined();
      expect(typeof result.current.playerRef).toBe('object');
    });

    it('initialises with a null current value', () => {
      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.playerRef.current).toBeNull();
    });
  });

  describe('cache-first resolution (issue 1.1)', () => {
    it('returns an empty map when the project has no clips', () => {
      mockGetProjectSnapshot.mockReturnValue(makeProjectDoc({ clips: [] }));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });

    it('issues ZERO getAsset calls when all fileIds are present in the project cache', () => {
      // Populate the project list cache with all clips already present.
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
          { id: 'c2', type: 'audio', fileId: 'asset-b', trackId: 't2', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);

      // Cache has both assets
      mockGetQueryData.mockReturnValue(makeEnvelope([
        makeAssetItem('asset-a'),
        makeAssetItem('asset-b'),
      ]));

      renderHook(() => useRemotionPlayer());

      // useQueries should be called with an empty array — no fallback requests
      expect(mockUseQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queries: [] }),
      );
    });

    it('builds assetUrls directly from cached data (no getAsset calls)', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'ready')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({
        'asset-a': 'http://localhost:3001/assets/asset-a/stream',
      });
    });
  });

  describe('fallback path for orphan clips', () => {
    it('passes one query per fileId missing from the project cache', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
          { id: 'c2', type: 'audio', fileId: 'asset-b', trackId: 't2', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      // Cache is empty — both clips are "missing"
      mockGetQueryData.mockReturnValue(undefined);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      expect(mockUseQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.arrayContaining([
            expect.objectContaining({ queryKey: ['asset', 'asset-a'] }),
            expect.objectContaining({ queryKey: ['asset', 'asset-b'] }),
          ]),
        }),
      );
    });

    it('deduplicates clips sharing the same fileId in fallback queries', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 10 },
          { id: 'c2', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 10, durationFrames: 10 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(undefined);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      const callArgs = mockUseQueries.mock.calls[0]?.[0] as { queries: unknown[] } | undefined;
      expect(callArgs?.queries).toHaveLength(1);
    });

    it('includes image clips in fallback queries when not in cache', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'image', fileId: 'asset-img', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(undefined);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      const callArgs = mockUseQueries.mock.calls[0]?.[0] as { queries: unknown[] } | undefined;
      expect(callArgs?.queries).toHaveLength(1);
      expect(callArgs?.queries[0]).toMatchObject({ queryKey: ['asset', 'asset-img'] });
    });

    it('excludes text-overlay clips from fallback queries', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'text-overlay', trackId: 't1', startFrame: 0, durationFrames: 30, text: 'Hello' },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(undefined);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      const callArgs = mockUseQueries.mock.calls[0]?.[0] as { queries: unknown[] } | undefined;
      expect(callArgs?.queries).toHaveLength(0);
    });

    it('resolves assetUrl from fallback query result for orphan clips', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      // Cache is empty — must fall back
      mockGetQueryData.mockReturnValue(undefined);
      mockUseQueries.mockReturnValue([
        {
          data: makeAssetItem('asset-a', 'ready'),
          isLoading: false,
          isError: false,
        },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({
        'asset-a': 'http://localhost:3001/assets/asset-a/stream',
      });
    });
  });

  describe('assetUrls resolution', () => {
    it('builds assetUrls map using the API stream URL (never a raw s3:// URI)', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'ready')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({
        'asset-a': 'http://localhost:3001/assets/asset-a/stream',
      });
    });

    it('appends auth token to stream URL when token exists in localStorage', () => {
      localStorage.setItem('auth_token', 'test-auth-token-123');
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'ready')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls['asset-a']).toBe('http://localhost:3001/assets/asset-a/stream?token=test-auth-token-123');
    });

    it('does not append token when no token exists in localStorage', () => {
      expect(localStorage.getItem('auth_token')).toBeNull();

      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'ready')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls['asset-a']).toBe('http://localhost:3001/assets/asset-a/stream');
    });

    it('stream URL uses the configured apiBaseUrl', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-xyz', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-xyz', 'ready')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls['asset-xyz']).toBe('http://localhost:3001/assets/asset-xyz/stream');
    });

    it('stream URL does not contain s3:// scheme', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-b', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-b', 'ready')]));

      const { result } = renderHook(() => useRemotionPlayer());

      const url = result.current.assetUrls['asset-b'] ?? '';
      expect(url).not.toContain('s3://');
      expect(url.startsWith('http')).toBe(true);
    });

    it('omits assets with status pending (not yet ready) from the cache', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'pending')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });

    it('omits assets with status processing from the cache', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'processing')]));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });

    it('omits assets whose fallback query is still loading', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(undefined);
      mockUseQueries.mockReturnValue([
        { data: undefined, isLoading: true, isError: false },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });
  });

  describe('assetUrls reference stability', () => {
    it('returns the same assetUrls reference when ready assets have not changed (cache path)', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockGetQueryData.mockReturnValue(makeEnvelope([makeAssetItem('asset-a', 'ready')]));

      const { result, rerender } = renderHook(() => useRemotionPlayer());

      const firstRef = result.current.assetUrls;

      // Simulate an ephemeral store tick (e.g. playhead frame advance).
      mockGetEphemeralSnapshot.mockReturnValue(makeEphemeralState({ playheadFrame: 5 }));
      rerender();

      expect(result.current.assetUrls).toBe(firstRef);
    });

    it('returns a new assetUrls reference when a new asset becomes ready (cache path)', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', fileId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
          { id: 'c2', type: 'video', fileId: 'asset-b', trackId: 't1', startFrame: 30, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);

      // Initially only asset-a is ready in cache.
      mockGetQueryData.mockReturnValue(makeEnvelope([
        makeAssetItem('asset-a', 'ready'),
        makeAssetItem('asset-b', 'processing'),
      ]));

      const { result, rerender } = renderHook(() => useRemotionPlayer());

      const firstRef = result.current.assetUrls;

      // Now asset-b finishes processing and becomes ready.
      mockGetQueryData.mockReturnValue(makeEnvelope([
        makeAssetItem('asset-a', 'ready'),
        makeAssetItem('asset-b', 'ready'),
      ]));
      rerender();

      expect(result.current.assetUrls).not.toBe(firstRef);
      expect(result.current.assetUrls).toHaveProperty('asset-b');
    });
  });
});
