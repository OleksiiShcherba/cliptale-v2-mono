import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usePrefetchAssets } from './usePrefetchAssets.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('remotion', () => ({
  prefetch: vi.fn(),
}));

import { prefetch } from 'remotion';

const mockPrefetch = vi.mocked(prefetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrefetchResult(blobUrl: string) {
  return {
    free: vi.fn(),
    waitUntilDone: Promise.resolve(blobUrl),
  };
}

function makeFailingPrefetchResult() {
  return {
    free: vi.fn(),
    waitUntilDone: Promise.reject(new Error('network error')),
  };
}

/**
 * Creates a deferred promise that can be resolved on demand.
 * Use this instead of `new Promise(() => {})` (which never resolves) to avoid
 * leaving permanently-pending microtasks that hang the Vitest worker.
 * Resolve the returned `resolve` function in test cleanup or after assertions.
 */
function makeDeferred() {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((res) => { resolve = res; });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePrefetchAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stream URLs immediately before prefetch resolves', async () => {
    const streamUrls = { 'asset-a': 'http://localhost:3001/assets/asset-a/stream' };
    const { promise, resolve } = makeDeferred();
    mockPrefetch.mockReturnValue({
      free: vi.fn(),
      waitUntilDone: promise,
    });

    const { result, unmount } = renderHook(() => usePrefetchAssets(streamUrls));

    // At this point prefetch has not resolved — the hook must return stream URLs.
    expect(result.current).toEqual(streamUrls);

    // Resolve the deferred and allow the resulting state update to be processed
    // inside act(), then unmount. This drains React 18's async act queue so the
    // Vitest worker does not hang between tests.
    await act(async () => {
      resolve('blob:http://localhost/cleanup');
      // Flush the microtask that resolves the promise and invokes the .then() handler.
      await Promise.resolve();
    });
    unmount();
  });

  it('replaces stream URLs with blob URLs after prefetch resolves', async () => {
    const streamUrls = { 'asset-a': 'http://localhost:3001/assets/asset-a/stream' };
    mockPrefetch.mockReturnValue(makePrefetchResult('blob:http://localhost/abc'));

    const { result } = renderHook(() => usePrefetchAssets(streamUrls));

    await waitFor(() => {
      expect(result.current['asset-a']).toBe('blob:http://localhost/abc');
    });
  });

  it('calls prefetch with blob-url method for each stream URL', async () => {
    const streamUrls = {
      'asset-a': 'http://localhost:3001/assets/asset-a/stream',
      'asset-b': 'http://localhost:3001/assets/asset-b/stream',
    };
    const deferredA = makeDeferred();
    const deferredB = makeDeferred();
    mockPrefetch
      .mockReturnValueOnce({ free: vi.fn(), waitUntilDone: deferredA.promise })
      .mockReturnValueOnce({ free: vi.fn(), waitUntilDone: deferredB.promise });

    const { unmount } = renderHook(() => usePrefetchAssets(streamUrls));

    expect(mockPrefetch).toHaveBeenCalledTimes(2);
    expect(mockPrefetch).toHaveBeenCalledWith(
      'http://localhost:3001/assets/asset-a/stream',
      { method: 'blob-url' },
    );
    expect(mockPrefetch).toHaveBeenCalledWith(
      'http://localhost:3001/assets/asset-b/stream',
      { method: 'blob-url' },
    );

    await act(async () => {
      deferredA.resolve('blob:a');
      deferredB.resolve('blob:b');
    });
    unmount();
  });

  it('does not call prefetch when streamUrls is empty', () => {
    mockPrefetch.mockReturnValue({ free: vi.fn(), waitUntilDone: Promise.resolve('') });

    // Hoist the empty map OUTSIDE renderHook — inline `{}` would create a new
    // object reference on every render, making [streamUrls] dep unstable and
    // causing an infinite effect re-run loop.
    const emptyUrls: Record<string, string> = {};
    const { unmount } = renderHook(() => usePrefetchAssets(emptyUrls));

    expect(mockPrefetch).not.toHaveBeenCalled();
    unmount();
  });

  it('calls free() for each prefetched URL on unmount', async () => {
    const freeA = vi.fn();
    const { promise, resolve } = makeDeferred();
    mockPrefetch.mockReturnValue({
      free: freeA,
      waitUntilDone: promise,
    });

    const streamUrls = { 'asset-a': 'http://localhost:3001/assets/asset-a/stream' };

    const { unmount } = renderHook(() => usePrefetchAssets(streamUrls));

    await act(async () => {
      resolve('blob:http://localhost/cleanup');
    });
    unmount();

    expect(freeA).toHaveBeenCalledOnce();
  });

  it('falls back to stream URL when prefetch fails', async () => {
    const streamUrls = { 'asset-a': 'http://localhost:3001/assets/asset-a/stream' };
    mockPrefetch.mockReturnValue(makeFailingPrefetchResult());

    const { result } = renderHook(() => usePrefetchAssets(streamUrls));

    // After the rejected promise settles, the stream URL should still be returned
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current['asset-a']).toBe('http://localhost:3001/assets/asset-a/stream');
  });

  it('re-runs prefetch and clears blob URLs when streamUrls reference changes', async () => {
    const freeOld = vi.fn();
    const deferredFirst = makeDeferred();
    const deferredSecond = makeDeferred();
    mockPrefetch
      .mockReturnValueOnce({ free: freeOld, waitUntilDone: deferredFirst.promise })
      .mockReturnValueOnce({ free: vi.fn(), waitUntilDone: deferredSecond.promise });

    const firstUrls = { 'asset-a': 'http://localhost:3001/assets/asset-a/stream' };
    const secondUrls = { 'asset-b': 'http://localhost:3001/assets/asset-b/stream' };

    const { rerender, unmount } = renderHook(
      ({ urls }: { urls: Record<string, string> }) => usePrefetchAssets(urls),
      { initialProps: { urls: firstUrls } },
    );

    rerender({ urls: secondUrls });

    expect(freeOld).toHaveBeenCalledOnce();
    expect(mockPrefetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      deferredFirst.resolve('blob:a');
      deferredSecond.resolve('blob:b');
    });
    unmount();
  });
});
