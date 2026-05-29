/**
 * useStoryboardPlanGeneration tests.
 *
 * Covers explicit start, realtime queued/running/completed events, terminal
 * behavior, surfaced errors, and retry after failure.
 */

import { act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DRAFT_ID,
  JOB_ID,
  emitPlanStatus as emitPlanStatusEvent,
  flushMicrotasks,
  makeState,
  renderPlanHook,
  type PlanSubscriptionHandler,
} from './useStoryboardPlanGeneration.test-utils';

const {
  mockStartStoryboardPlan,
  mockGetStoryboardPlanStatus,
  mockApplyLatestStoryboardPlan,
  mockDraftSubscriptionHandlers,
} = vi.hoisted(() => ({
  mockStartStoryboardPlan: vi.fn(),
  mockGetStoryboardPlanStatus: vi.fn(),
  mockApplyLatestStoryboardPlan: vi.fn(),
  mockDraftSubscriptionHandlers: [] as Array<{
    onEvent: (event: {
      type: 'storyboard.status.updated';
      draftId: string;
      userId: string;
      payload: Record<string, unknown>;
    }) => void;
    onReconnect?: () => void;
  }>,
}));

vi.mock('@/features/storyboard/api', () => ({
  startStoryboardPlan: mockStartStoryboardPlan,
  getStoryboardPlanStatus: mockGetStoryboardPlanStatus,
  applyLatestStoryboardPlan: mockApplyLatestStoryboardPlan,
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn((_draftId: string | null, handlers: {
    onEvent: (event: {
      type: 'storyboard.status.updated';
      draftId: string;
      userId: string;
      payload: Record<string, unknown>;
    }) => void;
    onReconnect?: () => void;
  }) => {
    mockDraftSubscriptionHandlers.push(handlers);
  }),
}));

function emitPlanStatus(status: 'queued' | 'running' | 'completed' | 'failed', jobId = JOB_ID): void {
  emitPlanStatusEvent(mockDraftSubscriptionHandlers as PlanSubscriptionHandler[], status, jobId);
}

describe('useStoryboardPlanGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftSubscriptionHandlers.length = 0;
    mockStartStoryboardPlan.mockResolvedValue({ jobId: JOB_ID, status: 'queued' });
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

  it('applies after realtime completed status and returns canvas state', async () => {
    mockApplyLatestStoryboardPlan.mockResolvedValue(makeState({ withMusic: true }));

    const { result, invalidateSpy } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });

    emitPlanStatus('queued');
    expect(result.current.status).toBe('queued');
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();

    emitPlanStatus('running');
    expect(result.current.status).toBe('running');
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();

    emitPlanStatus('completed');
    await flushMicrotasks();

    expect(result.current.status).toBe('completed');
    expect(mockApplyLatestStoryboardPlan).toHaveBeenCalledWith(DRAFT_ID);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['storyboard-history', DRAFT_ID] });
    expect(result.current.canvasState?.nodes.map((node) => node.id)).toEqual([
      'start-1',
      'scene-1',
      'end-1',
      'music-1',
    ]);
    expect(result.current.canvasState?.nodes.find((node) => node.id === 'music-1')?.type).toBe('music-block');
    expect(result.current.canvasState?.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'start-1->scene-1',
      'scene-1->end-1',
    ]);
  });

  it('surfaces failed realtime job status', async () => {
    const { result } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });
    emitPlanStatus('failed');
    await flushMicrotasks();

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Storyboard generation failed. Try again.');
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();
  });

  it('surfaces user-facing start, reconnect refresh, and apply error messages', async () => {
    mockStartStoryboardPlan.mockRejectedValueOnce(new Error('start rejected'));
    const first = renderPlanHook();

    await act(async () => {
      await first.result.current.start();
    });
    expect(first.result.current.status).toBe('failed');
    expect(first.result.current.error).toBe('Could not start storyboard generation. Try again.');

    mockStartStoryboardPlan.mockResolvedValueOnce({ jobId: JOB_ID, status: 'queued' });
    mockGetStoryboardPlanStatus.mockRejectedValueOnce(new Error('status refresh rejected'));
    const second = renderPlanHook();

    await act(async () => {
      await second.result.current.start();
    });
    await act(async () => {
      mockDraftSubscriptionHandlers.at(-1)?.onReconnect?.();
    });
    await waitFor(() => expect(second.result.current.status).toBe('failed'));
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
    });
    emitPlanStatus('completed');
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

  it('ignores realtime events on unmount', async () => {
    const { result, unmount } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });
    unmount();

    emitPlanStatus('running');
    expect(result.current.status).toBe('queued');
  });

  it('ignores stale events when the draft changes', async () => {
    mockApplyLatestStoryboardPlan.mockResolvedValue(makeState());

    const { result, rerender } = renderPlanHook();

    await act(async () => {
      await result.current.start();
    });

    rerender({ draftId: 'draft-next' });

    emitPlanStatus('completed');
    await flushMicrotasks();

    expect(mockGetStoryboardPlanStatus).not.toHaveBeenCalled();
    expect(mockApplyLatestStoryboardPlan).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.jobId).toBeNull();
  });
});
