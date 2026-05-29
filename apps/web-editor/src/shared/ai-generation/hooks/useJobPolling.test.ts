import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import type { RealtimeAiJobEvent, RealtimeSubscribeMessage } from '@ai-video-editor/project-schema';
import type { AiGenerationJob } from '@/shared/ai-generation/types';

const { mockGetJobStatus, mockUseRealtimeSubscription } = vi.hoisted(() => ({
  mockGetJobStatus: vi.fn(),
  mockUseRealtimeSubscription: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  getJobStatus: mockGetJobStatus,
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: mockUseRealtimeSubscription,
}));

import { useJobPolling } from './useJobPolling';

function makeJob(overrides: Partial<AiGenerationJob> = {}): AiGenerationJob {
  return {
    jobId: 'job-1',
    status: 'processing',
    progress: 50,
    resultAssetId: null,
    errorMessage: null,
    ...overrides,
  };
}

function makeEvent(payload: Record<string, unknown>): RealtimeAiJobEvent {
  return {
    type: 'ai.job.updated',
    jobId: 'job-1',
    userId: 'user-1',
    payload,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function latestSubscriptionOptions() {
  const call = mockUseRealtimeSubscription.mock.calls.at(-1);
  if (!call) throw new Error('Realtime subscription was not registered');
  return call[1] as {
    enabled?: boolean;
    onEvent: (event: RealtimeAiJobEvent) => void;
    onReconnect?: () => void;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetJobStatus.mockResolvedValue(makeJob());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useJobPolling', () => {
  it('returns null job and leaves realtime disabled when jobId is null', () => {
    const { result } = renderHook(() => useJobPolling(null));

    expect(result.current.job).toBeNull();
    expect(result.current.isPolling).toBe(false);
    expect(mockGetJobStatus).not.toHaveBeenCalled();
    expect(mockUseRealtimeSubscription).toHaveBeenLastCalledWith(null, expect.objectContaining({
      enabled: false,
    }));
  });

  it('fetches one initial snapshot and subscribes to the ai job channel', async () => {
    const { result } = renderHook(() => useJobPolling('job-1'));

    await waitFor(() => expect(result.current.job?.status).toBe('processing'));

    expect(mockGetJobStatus).toHaveBeenCalledTimes(1);
    expect(mockGetJobStatus).toHaveBeenCalledWith('job-1');
    expect(mockUseRealtimeSubscription).toHaveBeenCalledWith(
      { type: 'subscribe', scope: 'ai-job', jobId: 'job-1' } satisfies RealtimeSubscribeMessage,
      expect.objectContaining({ enabled: true }),
    );
    expect(result.current.isPolling).toBe(true);
  });

  it('does not schedule interval-based status checks', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    mockGetJobStatus.mockReturnValueOnce(new Promise(() => undefined));

    renderHook(() => useJobPolling('job-1'));

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('updates the job from realtime events and maps outputFileId to resultAssetId', async () => {
    const initialJob = makeJob({ status: 'queued', progress: 0 });
    const { result } = renderHook(() => useJobPolling('job-1', initialJob));

    await waitFor(() => expect(result.current.job?.status).toBe('processing'));

    act(() => {
      latestSubscriptionOptions().onEvent(makeEvent({
        status: 'completed',
        progress: 100,
        outputFileId: 'asset-1',
        errorMessage: null,
      }));
    });

    expect(result.current.job).toEqual(makeJob({
      status: 'completed',
      progress: 100,
      resultAssetId: 'asset-1',
    }));
    expect(result.current.isPolling).toBe(false);
  });

  it('shows failed realtime status with the server error message', async () => {
    const { result } = renderHook(() => useJobPolling('job-1'));

    await waitFor(() => expect(result.current.job?.status).toBe('processing'));

    act(() => {
      latestSubscriptionOptions().onEvent(makeEvent({
        status: 'failed',
        progress: 30,
        errorMessage: 'Provider error',
      }));
    });

    expect(result.current.job).toEqual(makeJob({
      status: 'failed',
      progress: 30,
      errorMessage: 'Provider error',
    }));
    expect(result.current.isPolling).toBe(false);
  });

  it('refreshes a snapshot once when realtime reconnects', async () => {
    mockGetJobStatus
      .mockResolvedValueOnce(makeJob({ status: 'queued', progress: 0 }))
      .mockResolvedValueOnce(makeJob({ status: 'processing', progress: 75 }));

    const { result } = renderHook(() => useJobPolling('job-1'));

    await waitFor(() => expect(result.current.job?.progress).toBe(0));

    act(() => {
      latestSubscriptionOptions().onReconnect?.();
    });

    await waitFor(() => expect(result.current.job?.progress).toBe(75));
    expect(mockGetJobStatus).toHaveBeenCalledTimes(2);
  });

  it('resets job to null when jobId changes to null', async () => {
    const { result, rerender } = renderHook(({ id }) => useJobPolling(id), {
      initialProps: { id: 'job-1' as string | null },
    });

    await waitFor(() => expect(result.current.job).not.toBeNull());

    rerender({ id: null });

    expect(result.current.job).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it('ignores an initial snapshot that resolves after the job is cleared', async () => {
    const snapshot = deferred<AiGenerationJob>();
    mockGetJobStatus.mockReturnValueOnce(snapshot.promise);

    const { result, rerender } = renderHook(({ id }) => useJobPolling(id), {
      initialProps: { id: 'job-1' as string | null },
    });

    rerender({ id: null });

    await act(async () => {
      snapshot.resolve(makeJob({ status: 'completed', progress: 100 }));
      await snapshot.promise;
    });

    expect(result.current.job).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });
});
