/**
 * useStoryboardPlanGeneration tests.
 *
 * Covers explicit start, queued/running polling, completed-plan apply, terminal
 * stop behavior, unmount cleanup, surfaced errors, and retry after failure.
 */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { StoryboardState } from '@/features/storyboard/types';

const {
  mockStartStoryboardPlan,
  mockGetStoryboardPlanStatus,
  mockApplyLatestStoryboardPlan,
} = vi.hoisted(() => ({
  mockStartStoryboardPlan: vi.fn(),
  mockGetStoryboardPlanStatus: vi.fn(),
  mockApplyLatestStoryboardPlan: vi.fn(),
}));

vi.mock('@/features/storyboard/api', () => ({
  startStoryboardPlan: mockStartStoryboardPlan,
  getStoryboardPlanStatus: mockGetStoryboardPlanStatus,
  applyLatestStoryboardPlan: mockApplyLatestStoryboardPlan,
}));

import { useStoryboardPlanGeneration } from './useStoryboardPlanGeneration';

const DRAFT_ID = 'draft-abc';
const JOB_ID = 'job-123';

function makeState(): StoryboardState {
  return {
    blocks: [
      {
        id: 'start-1',
        draftId: DRAFT_ID,
        blockType: 'start',
        name: null,
        prompt: null,
        durationS: 0,
        positionX: 40,
        positionY: 200,
        sortOrder: 0,
        style: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        mediaItems: [],
      },
      {
        id: 'scene-1',
        draftId: DRAFT_ID,
        blockType: 'scene',
        name: 'Scene 1',
        prompt: 'Wide product reveal',
        durationS: 6,
        positionX: 320,
        positionY: 200,
        sortOrder: 1,
        style: 'cinematic',
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        mediaItems: [],
      },
      {
        id: 'end-1',
        draftId: DRAFT_ID,
        blockType: 'end',
        name: null,
        prompt: null,
        durationS: 0,
        positionX: 600,
        positionY: 200,
        sortOrder: 999,
        style: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        mediaItems: [],
      },
    ],
    edges: [
      {
        id: 'edge-1',
        draftId: DRAFT_ID,
        sourceBlockId: 'start-1',
        targetBlockId: 'scene-1',
      },
      {
        id: 'edge-2',
        draftId: DRAFT_ID,
        sourceBlockId: 'scene-1',
        targetBlockId: 'end-1',
      },
    ],
  };
}

function renderPlanHook(initialDraftId = DRAFT_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return {
    ...renderHook(
      ({ draftId }) => useStoryboardPlanGeneration(draftId, { pollIntervalMs: 100 }),
      { initialProps: { draftId: initialDraftId }, wrapper },
    ),
    invalidateSpy,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('useStoryboardPlanGeneration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockStartStoryboardPlan.mockResolvedValue({ jobId: JOB_ID, status: 'queued' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts only when explicitly requested and exposes queued state immediately', async () => {
    const { result } = renderPlanHook();

    expect(result.current.status).toBe('idle');
    expect(mockStartStoryboardPlan).not.toHaveBeenCalled();

    let resolvedJobId: string | null = null;
    await act(async () => {
      resolvedJobId = await result.current.start();
    });

    expect(result.current.status).toBe('queued');
    expect(resolvedJobId).toBe(JOB_ID);
    expect(mockStartStoryboardPlan).toHaveBeenCalledWith(DRAFT_ID);
    expect(result.current.jobId).toBe(JOB_ID);
  });

  it('polls queued/running states, applies only after completed, and returns canvas state', async () => {
    mockGetStoryboardPlanStatus
      .mockResolvedValueOnce({ jobId: JOB_ID, status: 'queued', plan: null, errorMessage: null })
      .mockResolvedValueOnce({ jobId: JOB_ID, status: 'running', plan: null, errorMessage: null })
      .mockResolvedValueOnce({ jobId: JOB_ID, status: 'completed', plan: { scenes: [] }, errorMessage: null });
    mockApplyLatestStoryboardPlan.mockResolvedValue(makeState());

    const { result, invalidateSpy } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('queued');
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('running');
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await flushMicrotasks();

    expect(result.current.status).toBe('completed');
    expect(mockApplyLatestStoryboardPlan).toHaveBeenCalledWith(DRAFT_ID);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['storyboard-history', DRAFT_ID] });
    expect(result.current.canvasState?.nodes.map((node) => node.id)).toEqual([
      'start-1',
      'scene-1',
      'end-1',
    ]);
    expect(result.current.canvasState?.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'start-1->scene-1',
      'scene-1->end-1',
    ]);
  });

  it('stops polling after a failed job and surfaces the server error message', async () => {
    mockGetStoryboardPlanStatus.mockResolvedValueOnce({
      jobId: JOB_ID,
      status: 'failed',
      plan: null,
      errorMessage: 'Plan worker failed',
    });

    const { result } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await flushMicrotasks();

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Storyboard generation failed. Try again.');

    const callCount = mockGetStoryboardPlanStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockGetStoryboardPlanStatus).toHaveBeenCalledTimes(callCount);
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();
  });

  it('surfaces user-facing start, poll, and apply error messages', async () => {
    mockStartStoryboardPlan.mockRejectedValueOnce(new Error('start rejected'));
    const first = renderPlanHook();

    await act(async () => {
      await first.result.current.start();
    });
    expect(first.result.current.status).toBe('failed');
    expect(first.result.current.error).toBe('Could not start storyboard generation. Try again.');

    mockStartStoryboardPlan.mockResolvedValueOnce({ jobId: JOB_ID, status: 'queued' });
    mockGetStoryboardPlanStatus.mockRejectedValueOnce(new Error('poll rejected'));
    const second = renderPlanHook();

    await act(async () => {
      await second.result.current.start();
      await vi.advanceTimersByTimeAsync(100);
    });
    await flushMicrotasks();
    expect(second.result.current.status).toBe('failed');
    expect(second.result.current.error).toBe('Could not check storyboard generation progress. Try again.');

    mockStartStoryboardPlan.mockResolvedValueOnce({ jobId: JOB_ID, status: 'queued' });
    mockGetStoryboardPlanStatus.mockResolvedValueOnce({
      jobId: JOB_ID,
      status: 'completed',
      plan: { scenes: [] },
      errorMessage: null,
    });
    mockApplyLatestStoryboardPlan.mockRejectedValueOnce(new Error('apply rejected'));
    const third = renderPlanHook();

    await act(async () => {
      await third.result.current.start();
      await vi.advanceTimersByTimeAsync(100);
    });
    await flushMicrotasks();
    expect(third.result.current.status).toBe('failed');
    expect(third.result.current.error).toBe('Could not apply generated storyboard scenes. Try again.');
  });

  it('allows retry after failure by starting a new planning job', async () => {
    mockStartStoryboardPlan
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ jobId: 'job-retry', status: 'queued' });

    const { result } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('failed');

    await act(async () => {
      await result.current.retry();
    });

    expect(mockStartStoryboardPlan).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('queued');
    expect(result.current.jobId).toBe('job-retry');
    expect(result.current.error).toBeNull();
  });

  it('stops polling on unmount', async () => {
    mockGetStoryboardPlanStatus.mockResolvedValue({ jobId: JOB_ID, status: 'running', plan: null, errorMessage: null });

    const { result, unmount } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(mockGetStoryboardPlanStatus).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockGetStoryboardPlanStatus).toHaveBeenCalledTimes(1);
  });

  it('clears polling and ignores stale results when the draft changes', async () => {
    mockGetStoryboardPlanStatus.mockResolvedValueOnce({
      jobId: JOB_ID,
      status: 'completed',
      plan: { scenes: [] },
      errorMessage: null,
    });
    mockApplyLatestStoryboardPlan.mockResolvedValue(makeState());

    const { result, rerender } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });

    rerender({ draftId: 'draft-next' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await flushMicrotasks();

    expect(mockGetStoryboardPlanStatus).not.toHaveBeenCalled();
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.jobId).toBeNull();
  });
});
