import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClientPost } = vi.hoisted(() => ({
  mockApiClientPost: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: mockApiClientPost,
  },
}));

import {
  clearBulkFileStreamUrlCacheForTests,
  useBulkFileStreamUrls,
} from './useBulkFileStreamUrls';

describe('useBulkFileStreamUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBulkFileStreamUrlCacheForTests();
    mockApiClientPost.mockImplementation((_path: string, body: { fileIds: string[] }) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        urls: Object.fromEntries(
          body.fileIds.map((fileId) => [fileId, `https://signed.test/${fileId}`]),
        ),
        missingFileIds: [],
      }),
    }));
  });

  it('requests one bulk URL response for a stable unique ID set', async () => {
    const { result } = renderHook(() => useBulkFileStreamUrls(['file-b', 'file-a', 'file-a']));

    await waitFor(() => {
      expect(result.current.urls).toEqual({
        'file-a': 'https://signed.test/file-a',
        'file-b': 'https://signed.test/file-b',
      });
    });

    expect(mockApiClientPost).toHaveBeenCalledTimes(1);
    expect(mockApiClientPost).toHaveBeenCalledWith('/files/stream-urls', {
      fileIds: ['file-a', 'file-b'],
    });
  });

  it('reuses cached file URLs on later ID sets', async () => {
    const { result, rerender } = renderHook(
      ({ fileIds }: { fileIds: string[] }) => useBulkFileStreamUrls(fileIds),
      { initialProps: { fileIds: ['file-a', 'file-b'] } },
    );

    await waitFor(() => {
      expect(result.current.urls['file-a']).toBe('https://signed.test/file-a');
    });

    rerender({ fileIds: ['file-a', 'file-c'] });

    await waitFor(() => {
      expect(result.current.urls).toEqual({
        'file-a': 'https://signed.test/file-a',
        'file-c': 'https://signed.test/file-c',
      });
    });

    expect(mockApiClientPost).toHaveBeenCalledTimes(2);
    expect(mockApiClientPost).toHaveBeenLastCalledWith('/files/stream-urls', {
      fileIds: ['file-c'],
    });
  });

  it('reuses cached file URLs before the cache TTL expires', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const { result, unmount } = renderHook(() => useBulkFileStreamUrls(['file-a']));

      await waitFor(() => {
        expect(result.current.urls).toEqual({
          'file-a': 'https://signed.test/file-a',
        });
      });
      unmount();

      nowSpy.mockReturnValue(1_000_000 + 13 * 60 * 1000);

      const { result: cachedResult } = renderHook(() => useBulkFileStreamUrls(['file-a']));

      expect(cachedResult.current).toEqual({
        urls: {
          'file-a': 'https://signed.test/file-a',
        },
        isLoading: false,
        error: null,
        missingFileIds: [],
      });
      expect(mockApiClientPost).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('refreshes cached file URLs after the cache TTL expires', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    let requestCount = 0;
    mockApiClientPost.mockImplementation((_path: string, body: { fileIds: string[] }) => {
      requestCount += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          urls: Object.fromEntries(
            body.fileIds.map((fileId) => [
              fileId,
              `https://signed.test/${fileId}?request=${requestCount}`,
            ]),
          ),
          missingFileIds: [],
        }),
      });
    });

    try {
      const { result, unmount } = renderHook(() => useBulkFileStreamUrls(['file-a']));

      await waitFor(() => {
        expect(result.current.urls).toEqual({
          'file-a': 'https://signed.test/file-a?request=1',
        });
      });
      unmount();

      nowSpy.mockReturnValue(2_000_000 + 14 * 60 * 1000 + 1);

      const { result: refreshedResult } = renderHook(() => useBulkFileStreamUrls(['file-a']));

      await waitFor(() => {
        expect(refreshedResult.current.urls).toEqual({
          'file-a': 'https://signed.test/file-a?request=2',
        });
      });
      expect(mockApiClientPost).toHaveBeenCalledTimes(2);
      expect(mockApiClientPost).toHaveBeenLastCalledWith('/files/stream-urls', {
        fileIds: ['file-a'],
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('refreshes a mounted hook when the cached URL TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_000_000);

    let requestCount = 0;
    mockApiClientPost.mockImplementation((_path: string, body: { fileIds: string[] }) => {
      requestCount += 1;
      const currentRequest = requestCount;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          urls: Object.fromEntries(
            body.fileIds.map((fileId) => [
              fileId,
              `https://signed.test/${fileId}?request=${currentRequest}`,
            ]),
          ),
          missingFileIds: [],
        }),
      });
    });

    try {
      const { result, unmount } = renderHook(() => useBulkFileStreamUrls(['file-a']));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.urls).toEqual({
        'file-a': 'https://signed.test/file-a?request=1',
      });

      act(() => {
        vi.advanceTimersByTime(14 * 60 * 1000);
      });

      expect(result.current).toEqual({
        urls: {},
        isLoading: true,
        error: null,
        missingFileIds: [],
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.urls).toEqual({
        'file-a': 'https://signed.test/file-a?request=2',
      });
      expect(mockApiClientPost).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses an in-flight request for matching ID sets', async () => {
    const { result: first } = renderHook(() => useBulkFileStreamUrls(['file-b', 'file-a']));
    const { result: second } = renderHook(() => useBulkFileStreamUrls(['file-a', 'file-b']));

    await waitFor(() => {
      expect(first.current.urls['file-a']).toBe('https://signed.test/file-a');
      expect(second.current.urls['file-b']).toBe('https://signed.test/file-b');
    });

    expect(mockApiClientPost).toHaveBeenCalledTimes(1);
    expect(mockApiClientPost).toHaveBeenCalledWith('/files/stream-urls', {
      fileIds: ['file-a', 'file-b'],
    });
  });

  it('tracks missing IDs and does not request them again after they are cached missing', async () => {
    mockApiClientPost.mockImplementationOnce((_path: string, body: { fileIds: string[] }) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        urls: Object.fromEntries(
          body.fileIds.filter((fileId) => fileId !== 'file-missing').map((fileId) => [fileId, `https://signed.test/${fileId}`]),
        ),
        missingFileIds: ['file-missing'],
      }),
    }));

    const { result, rerender } = renderHook(
      ({ fileIds }: { fileIds: string[] }) => useBulkFileStreamUrls(fileIds),
      { initialProps: { fileIds: ['file-a', 'file-missing'] } },
    );

    await waitFor(() => {
      expect(result.current.urls).toEqual({ 'file-a': 'https://signed.test/file-a' });
      expect(result.current.missingFileIds).toEqual(['file-missing']);
    });

    rerender({ fileIds: ['file-missing'] });

    await waitFor(() => {
      expect(result.current).toEqual({
        urls: {},
        isLoading: false,
        error: null,
        missingFileIds: ['file-missing'],
      });
    });
    expect(mockApiClientPost).toHaveBeenCalledTimes(1);
  });

  it('surfaces fetch failures without caching the ID as missing', async () => {
    mockApiClientPost.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useBulkFileStreamUrls(['file-auth']));

    await waitFor(() => {
      expect(result.current).toEqual({
        urls: {},
        isLoading: false,
        error: 'POST /files/stream-urls failed: 401',
        missingFileIds: [],
      });
    });
  });

  it('does not request anything for an empty ID set', () => {
    const { result } = renderHook(() => useBulkFileStreamUrls([]));

    expect(result.current).toEqual({
      urls: {},
      isLoading: false,
      error: null,
      missingFileIds: [],
    });
    expect(mockApiClientPost).not.toHaveBeenCalled();
  });
});
