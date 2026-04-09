import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import * as projectStore from '@/store/project-store.js';
import * as ephemeralStore from '@/store/ephemeral-store.js';

import { useRemotionPlayer } from './useRemotionPlayer.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  useQueries: vi.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRemotionPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  describe('assetUrls resolution', () => {
    it('returns an empty map when the project has no clips', () => {
      mockGetProjectSnapshot.mockReturnValue(makeProjectDoc({ clips: [] }));

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });

    it('passes one query per unique assetId in video and audio clips', () => {
      const doc = makeProjectDoc({
        clips: [
          {
            id: 'c1',
            type: 'video',
            assetId: 'asset-a',
            trackId: 't1',
            startFrame: 0,
            durationFrames: 30,
          },
          {
            id: 'c2',
            type: 'audio',
            assetId: 'asset-b',
            trackId: 't2',
            startFrame: 0,
            durationFrames: 30,
          },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      // useQueries should be called with 2 queries (one per assetId)
      expect(mockUseQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.arrayContaining([
            expect.objectContaining({ queryKey: ['asset', 'asset-a'] }),
            expect.objectContaining({ queryKey: ['asset', 'asset-b'] }),
          ]),
        }),
      );
    });

    it('deduplicates clips sharing the same assetId', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 10 },
          { id: 'c2', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 10, durationFrames: 10 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      const callArgs = mockUseQueries.mock.calls[0]?.[0] as { queries: unknown[] } | undefined;
      expect(callArgs?.queries).toHaveLength(1);
    });

    it('includes image clips in asset queries', () => {
      const doc = makeProjectDoc({
        clips: [
          {
            id: 'c1',
            type: 'image',
            assetId: 'asset-img',
            trackId: 't1',
            startFrame: 0,
            durationFrames: 30,
          },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      const callArgs = mockUseQueries.mock.calls[0]?.[0] as { queries: unknown[] } | undefined;
      expect(callArgs?.queries).toHaveLength(1);
      expect(callArgs?.queries[0]).toMatchObject({ queryKey: ['asset', 'asset-img'] });
    });

    it('excludes text-overlay clips from asset queries', () => {
      const doc = makeProjectDoc({
        clips: [
          {
            id: 'c1',
            type: 'text-overlay',
            trackId: 't1',
            startFrame: 0,
            durationFrames: 30,
            text: 'Hello',
          },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([]);

      renderHook(() => useRemotionPlayer());

      const callArgs = mockUseQueries.mock.calls[0]?.[0] as { queries: unknown[] } | undefined;
      expect(callArgs?.queries).toHaveLength(0);
    });

    it('builds assetUrls map using the API stream URL (never a raw s3:// URI)', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        {
          data: { id: 'asset-a', downloadUrl: 'https://example.com/presigned/video.mp4', status: 'ready' },
          isLoading: false,
          isError: false,
        },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({
        'asset-a': 'http://localhost:3001/assets/asset-a/stream',
      });
    });

    it('appends auth token to stream URL when token exists in localStorage', () => {
      localStorage.setItem('auth_token', 'test-auth-token-123');
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        {
          data: { id: 'asset-a', downloadUrl: 'https://example.com/presigned/video.mp4', status: 'ready' },
          isLoading: false,
          isError: false,
        },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls['asset-a']).toBe('http://localhost:3001/assets/asset-a/stream?token=test-auth-token-123');
    });

    it('does not append token when no token exists in localStorage', () => {
      // Explicitly ensure localStorage is empty
      expect(localStorage.getItem('auth_token')).toBeNull();

      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        {
          data: { id: 'asset-a', downloadUrl: 'https://example.com/presigned/video.mp4', status: 'ready' },
          isLoading: false,
          isError: false,
        },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls['asset-a']).toBe('http://localhost:3001/assets/asset-a/stream');
    });

    it('stream URL uses the configured apiBaseUrl', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-xyz', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        {
          data: { id: 'asset-xyz', downloadUrl: 'https://example.com/presigned/any-key.mp4', status: 'ready' },
          isLoading: false,
          isError: false,
        },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls['asset-xyz']).toBe('http://localhost:3001/assets/asset-xyz/stream');
    });

    it('stream URL does not contain s3:// scheme', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-b', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        {
          data: { id: 'asset-b', downloadUrl: 'https://example.com/presigned/video.mp4', status: 'ready' },
          isLoading: false,
          isError: false,
        },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      const url = result.current.assetUrls['asset-b'] ?? '';
      expect(url).not.toContain('s3://');
      expect(url.startsWith('http')).toBe(true);
    });

    it('omits assets with status pending (not yet ready)', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        { data: { id: 'asset-a', status: 'pending' }, isLoading: false, isError: false },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });

    it('omits assets with status processing', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        { data: { id: 'asset-a', status: 'processing' }, isLoading: false, isError: false },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });

    it('omits assets whose query is still loading', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        { data: undefined, isLoading: true, isError: false },
      ] as ReturnType<typeof useQueries>);

      const { result } = renderHook(() => useRemotionPlayer());

      expect(result.current.assetUrls).toEqual({});
    });
  });

  describe('assetUrls reference stability', () => {
    it('returns the same assetUrls reference when ready assets have not changed', () => {
      // This tests the readyAssetIds memoization: unnecessary re-renders (e.g.
      // when ephemeral store ticks while no assets change) must NOT give
      // usePrefetchAssets a new object reference, which would trigger a
      // redundant prefetch cycle.
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);
      mockUseQueries.mockReturnValue([
        { data: { id: 'asset-a', status: 'ready' }, isLoading: false, isError: false },
      ] as ReturnType<typeof useQueries>);

      const { result, rerender } = renderHook(() => useRemotionPlayer());

      const firstRef = result.current.assetUrls;

      // Simulate an ephemeral store tick (e.g. playhead frame advance).
      mockGetEphemeralSnapshot.mockReturnValue(makeEphemeralState({ playheadFrame: 5 }));
      rerender();

      expect(result.current.assetUrls).toBe(firstRef);
    });

    it('returns a new assetUrls reference when a new asset becomes ready', () => {
      const doc = makeProjectDoc({
        clips: [
          { id: 'c1', type: 'video', assetId: 'asset-a', trackId: 't1', startFrame: 0, durationFrames: 30 },
          { id: 'c2', type: 'video', assetId: 'asset-b', trackId: 't1', startFrame: 30, durationFrames: 30 },
        ] as ProjectDoc['clips'],
      });
      mockGetProjectSnapshot.mockReturnValue(doc);

      // Initially only asset-a is ready.
      mockUseQueries.mockReturnValue([
        { data: { id: 'asset-a', status: 'ready' }, isLoading: false, isError: false },
        { data: { id: 'asset-b', status: 'processing' }, isLoading: false, isError: false },
      ] as ReturnType<typeof useQueries>);

      const { result, rerender } = renderHook(() => useRemotionPlayer());

      const firstRef = result.current.assetUrls;

      // Now asset-b finishes processing and becomes ready.
      mockUseQueries.mockReturnValue([
        { data: { id: 'asset-a', status: 'ready' }, isLoading: false, isError: false },
        { data: { id: 'asset-b', status: 'ready' }, isLoading: false, isError: false },
      ] as ReturnType<typeof useQueries>);
      rerender();

      expect(result.current.assetUrls).not.toBe(firstRef);
      expect(result.current.assetUrls).toHaveProperty('asset-b');
    });
  });
});
