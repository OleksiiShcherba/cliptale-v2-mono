import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockGetJobStatus } = vi.hoisted(() => ({
  mockGetJobStatus: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  getJobStatus: mockGetJobStatus,
}));

import { useJobPolling } from './useJobPolling';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    status: 'processing',
    progress: 50,
    resultAssetId: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('useJobPolling', () => {
  it('returns null job and isPolling=false when jobId is null', () => {
    const { result } = renderHook(() => useJobPolling(null));
    expect(result.current.job).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it('polls immediately when jobId is provided', async () => {
    mockGetJobStatus.mockResolvedValue(makeJob());
    const { result } = renderHook(() => useJobPolling('job-1'));

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockGetJobStatus).toHaveBeenCalledWith('job-1');
    expect(result.current.job?.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);
  });

  it('stops polling when status becomes completed', async () => {
    mockGetJobStatus.mockResolvedValue(makeJob({ status: 'completed', progress: 100 }));
    const { result } = renderHook(() => useJobPolling('job-1'));

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.job?.status).toBe('completed');
    expect(result.current.isPolling).toBe(false);
  });

  it('stops polling when status becomes failed', async () => {
    mockGetJobStatus.mockResolvedValue(
      makeJob({ status: 'failed', errorMessage: 'Provider error' }),
    );
    const { result } = renderHook(() => useJobPolling('job-1'));

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.job?.status).toBe('failed');
    expect(result.current.isPolling).toBe(false);
  });

  it('polls again after interval while status is queued/processing', async () => {
    mockGetJobStatus.mockResolvedValue(makeJob({ status: 'queued', progress: 0 }));
    renderHook(() => useJobPolling('job-1'));

    // Initial poll(s) — may fire more than once due to strict mode
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const initialCalls = mockGetJobStatus.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // Advance by poll interval (2500ms) — should fire at least one more
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(mockGetJobStatus.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('resets job to null when jobId changes to null', async () => {
    mockGetJobStatus.mockResolvedValue(makeJob());
    const { result, rerender } = renderHook(({ id }) => useJobPolling(id), {
      initialProps: { id: 'job-1' as string | null },
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.job).not.toBeNull();

    rerender({ id: null });
    expect(result.current.job).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it('survives transient network errors and keeps polling', async () => {
    // Reject enough times to cover strict mode double-mount, then resolve
    mockGetJobStatus.mockRejectedValueOnce(new Error('Network error'));
    mockGetJobStatus.mockRejectedValueOnce(new Error('Network error'));
    mockGetJobStatus.mockResolvedValue(makeJob({ status: 'processing', progress: 75 }));

    const { result } = renderHook(() => useJobPolling('job-1'));

    // Initial poll(s) — errors swallowed
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Advance past interval — next poll should succeed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(result.current.job?.progress).toBe(75);
    expect(result.current.isPolling).toBe(true);
  });
});
