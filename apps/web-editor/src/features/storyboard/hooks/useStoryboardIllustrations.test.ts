import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFetchStoryboardIllustrations,
  mockStartStoryboardIllustrations,
  mockStartStoryboardBlockIllustration,
} = vi.hoisted(() => ({
  mockFetchStoryboardIllustrations: vi.fn(),
  mockStartStoryboardIllustrations: vi.fn(),
  mockStartStoryboardBlockIllustration: vi.fn(),
}));

vi.mock('@/features/storyboard/api', () => ({
  fetchStoryboardIllustrations: mockFetchStoryboardIllustrations,
  startStoryboardIllustrations: mockStartStoryboardIllustrations,
  startStoryboardBlockIllustration: mockStartStoryboardBlockIllustration,
}));

import { useStoryboardIllustrations } from './useStoryboardIllustrations';

const DRAFT_ID = 'draft-1';
const NEXT_DRAFT_ID = 'draft-2';

function item(overrides: Record<string, unknown> = {}) {
  return {
    blockId: 'block-1',
    status: 'queued',
    jobId: null,
    outputFileId: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('useStoryboardIllustrations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockFetchStoryboardIllustrations.mockResolvedValue({ items: [item()] });
    mockStartStoryboardIllustrations.mockResolvedValue({
      items: [item({ status: 'queued', jobId: 'job-1' })],
    });
    mockStartStoryboardBlockIllustration.mockResolvedValue({
      items: [item({ status: 'queued', jobId: 'job-2' })],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads existing illustration statuses without treating missing jobs as blocking', async () => {
    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledWith(DRAFT_ID);
    expect(result.current.status).toBe('idle');
    expect(result.current.isBlocking).toBe(false);
    expect(result.current.byBlockId.get('block-1')?.jobId).toBeNull();
  });

  it('starts all illustrations, polls active jobs, and refreshes storyboard when output arrives', async () => {
    const onStoryboardUpdated = vi.fn();
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce({ items: [item()] })
      .mockResolvedValueOnce({ items: [item({ status: 'running', jobId: 'job-1' })] })
      .mockResolvedValueOnce({
        items: [item({
          status: 'ready',
          jobId: 'job-1',
          outputFileId: 'file-1',
        })],
      });

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {
      pollIntervalMs: 100,
      onStoryboardUpdated,
    }));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isBlocking).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('completed');
    expect(result.current.isBlocking).toBe(false);
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(1);
  });

  it('retries one failed block through the block endpoint', async () => {
    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.retryBlock('block-1');
    });

    expect(mockStartStoryboardBlockIllustration).toHaveBeenCalledWith(DRAFT_ID, 'block-1');
    expect(result.current.isBlocking).toBe(true);
  });

  it('derives failed lifecycle from failed scene status responses', async () => {
    mockFetchStoryboardIllustrations.mockResolvedValueOnce({
      items: [item({ status: 'failed', jobId: 'job-1', errorMessage: 'Provider failed' })],
    });

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.isBlocking).toBe(false);
    expect(result.current.byBlockId.get('block-1')?.errorMessage).toBe('Provider failed');
  });

  it('surfaces start and retry request failures without keeping Step 3 blocked', async () => {
    mockStartStoryboardIllustrations.mockRejectedValueOnce(new Error('start failed'));
    const first = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await first.result.current.start();
    });

    expect(first.result.current.status).toBe('failed');
    expect(first.result.current.error).toBe('Could not start illustration generation.');
    expect(first.result.current.isBlocking).toBe(false);

    mockStartStoryboardBlockIllustration.mockRejectedValueOnce(new Error('retry failed'));
    const second = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await second.result.current.retryBlock('block-1');
    });

    expect(second.result.current.status).toBe('failed');
    expect(second.result.current.error).toBe('Could not retry the scene illustration.');
    expect(second.result.current.isBlocking).toBe(false);
  });

  it('stops blocking and polling when status polling fails', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce({ items: [item()] })
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.isBlocking).toBe(false);

    const callCount = mockFetchStoryboardIllustrations.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledTimes(callCount);
  });

  it('ignores stale illustration status responses after draft changes', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockFetchStoryboardIllustrations
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({
        items: [item({ blockId: 'block-next', status: 'ready', jobId: 'job-next', outputFileId: 'file-next' })],
      });

    const { result, rerender } = renderHook(
      ({ draftId }) => useStoryboardIllustrations(draftId, { pollIntervalMs: 100 }),
      { initialProps: { draftId: DRAFT_ID } },
    );

    rerender({ draftId: NEXT_DRAFT_ID });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.byBlockId.get('block-next')?.outputFileId).toBe('file-next');

    await act(async () => {
      resolveFirst({
        items: [item({ blockId: 'block-old', status: 'running', jobId: 'job-old' })],
      });
      await Promise.resolve();
    });

    expect(result.current.byBlockId.get('block-next')?.outputFileId).toBe('file-next');
    expect(result.current.byBlockId.has('block-old')).toBe(false);

    const callCount = mockFetchStoryboardIllustrations.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledTimes(callCount);
  });
});
