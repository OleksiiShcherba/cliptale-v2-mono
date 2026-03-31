import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useAssetPolling } from './useAssetPolling';
import * as api from '@/features/asset-manager/api';
import type { Asset } from '@/features/asset-manager/types';

vi.mock('@/features/asset-manager/api');

const mockGetAsset = vi.mocked(api.getAsset);

function makeAsset(status: Asset['status']): Asset {
  return {
    id: 'asset-1',
    projectId: 'project-1',
    filename: 'video.mp4',
    contentType: 'video/mp4',
    storageUri: 's3://bucket/key',
    status,
    durationSeconds: null,
    width: null,
    height: null,
    fileSizeBytes: 1024,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('useAssetPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onReady when asset status is ready on first poll', async () => {
    mockGetAsset.mockResolvedValue(makeAsset('ready'));
    const onReady = vi.fn();

    await act(async () => {
      renderHook(() => useAssetPolling({ assetId: 'asset-1', onReady }));
    });

    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
  });

  it('calls onError and not onReady when asset status is error', async () => {
    mockGetAsset.mockResolvedValue(makeAsset('error'));
    const onReady = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      renderHook(() => useAssetPolling({ assetId: 'asset-1', onReady, onError }));
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    expect(onReady).not.toHaveBeenCalled();
  });

  it('keeps polling while status is processing, stops when ready', async () => {
    mockGetAsset
      .mockResolvedValueOnce(makeAsset('processing'))
      .mockResolvedValueOnce(makeAsset('processing'))
      .mockResolvedValue(makeAsset('ready'));
    const onReady = vi.fn();

    renderHook(() => useAssetPolling({ assetId: 'asset-1', onReady }));
    // Advance past two 2-second intervals
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(mockGetAsset.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not poll when assetId is null', async () => {
    const onReady = vi.fn();

    await act(async () => {
      renderHook(() => useAssetPolling({ assetId: null, onReady }));
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(mockGetAsset).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('stops polling after unmount and does not call onReady', async () => {
    mockGetAsset.mockResolvedValue(makeAsset('processing'));
    const onReady = vi.fn();

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = renderHook(() => useAssetPolling({ assetId: 'asset-1', onReady })));
      await vi.advanceTimersByTimeAsync(2500);
    });

    const callsBefore = mockGetAsset.mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(mockGetAsset.mock.calls.length).toBe(callsBefore);
  });

  it('continues polling through transient network errors', async () => {
    mockGetAsset
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(makeAsset('ready'));
    const onReady = vi.fn();

    renderHook(() => useAssetPolling({ assetId: 'asset-1', onReady }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
