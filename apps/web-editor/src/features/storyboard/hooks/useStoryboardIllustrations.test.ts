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
import type {
  StoryboardIllustrationReferenceStatus,
  StoryboardIllustrationStatusItem,
  StoryboardIllustrationStatusResponse,
} from '@/features/storyboard/types';

const DRAFT_ID = 'draft-1';
const NEXT_DRAFT_ID = 'draft-2';

function item(
  overrides: Partial<StoryboardIllustrationStatusItem> = {},
): StoryboardIllustrationStatusItem {
  return {
    blockId: 'block-1',
    status: 'queued',
    jobId: null,
    outputFileId: null,
    errorMessage: null,
    ...overrides,
  };
}

function reference(
  overrides: Partial<StoryboardIllustrationReferenceStatus> = {},
): StoryboardIllustrationReferenceStatus {
  return {
    status: 'queued',
    jobId: null,
    outputFileId: null,
    sourceReferenceFileIds: [],
    approvalStatus: 'pending',
    errorMessage: null,
    ...overrides,
  };
}

function response(
  overrides: Partial<StoryboardIllustrationStatusResponse> = {},
): StoryboardIllustrationStatusResponse {
  return {
    reference: reference(),
    items: [item()],
    ...overrides,
  } as StoryboardIllustrationStatusResponse;
}

describe('useStoryboardIllustrations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockFetchStoryboardIllustrations.mockResolvedValue(response());
    mockStartStoryboardIllustrations.mockResolvedValue(response({
      items: [item({ status: 'queued', jobId: 'job-1' })],
    }));
    mockStartStoryboardBlockIllustration.mockResolvedValue(response({
      items: [item({ status: 'queued', jobId: 'job-2' })],
    }));
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
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({
        items: [item({ status: 'running', jobId: 'job-1' })],
      }))
      .mockResolvedValueOnce(response({
        reference: reference({
          status: 'ready',
          jobId: 'ref-job-1',
          outputFileId: 'ref-file-1',
          approvalStatus: 'approved',
        }),
        items: [item({
          status: 'ready',
          jobId: 'job-1',
          outputFileId: 'file-1',
        })],
      }));

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

  it('polls reference work, then starts scene work when the reference is ready', async () => {
    const onStoryboardUpdated = vi.fn();
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response({ reference: reference({ status: 'queued', jobId: null }) }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'running', jobId: 'ref-job-1' }),
      }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
      }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
        items: [item({ status: 'running', jobId: 'scene-job-1' })],
      }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
        items: [item({ status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' })],
      }));
    mockStartStoryboardIllustrations
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'queued', jobId: 'ref-job-1' }),
      }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
        items: [item({ status: 'running', jobId: 'scene-job-1' })],
      }));

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

    expect(result.current.status).toBe('queued');
    expect(result.current.isBlocking).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(mockStartStoryboardIllustrations).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('running');
    expect(result.current.phase).toBe('scene');
    expect(result.current.reference?.outputFileId).toBe('ref-file-ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('completed');
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(2);
  });

  it('continues sequential scene starts after each previous scene output is ready', async () => {
    const onStoryboardUpdated = vi.fn();
    const approvedReference = reference({
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'ref-file-ready',
      approvalStatus: 'approved',
    });

    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response({ reference: approvedReference }))
      .mockResolvedValueOnce(response({
        reference: approvedReference,
        items: [
          item({ blockId: 'scene-1', status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' }),
          item({ blockId: 'scene-2', status: 'queued', jobId: null }),
        ],
      }))
      .mockResolvedValueOnce(response({
        reference: approvedReference,
        items: [
          item({ blockId: 'scene-1', status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' }),
          item({ blockId: 'scene-2', status: 'ready', jobId: 'scene-job-2', outputFileId: 'scene-file-2' }),
        ],
      }));
    mockStartStoryboardIllustrations
      .mockResolvedValueOnce(response({
        reference: approvedReference,
        items: [
          item({ blockId: 'scene-1', status: 'running', jobId: 'scene-job-1' }),
          item({ blockId: 'scene-2', status: 'queued', jobId: null }),
        ],
      }))
      .mockResolvedValueOnce(response({
        reference: approvedReference,
        items: [
          item({ blockId: 'scene-1', status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' }),
          item({ blockId: 'scene-2', status: 'running', jobId: 'scene-job-2' }),
        ],
      }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {
      pollIntervalMs: 100,
      onStoryboardUpdated,
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledWith(DRAFT_ID);
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('running');
    expect(result.current.byBlockId.get('scene-2')?.jobId).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockStartStoryboardIllustrations).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('running');
    expect(result.current.byBlockId.get('scene-2')?.jobId).toBe('scene-job-2');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.byBlockId.get('scene-2')?.outputFileId).toBe('scene-file-2');
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(3);
  });

  it('does not auto-start scene work while the ready reference is pending approval', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({
        reference: reference({
          status: 'ready',
          jobId: 'ref-job-1',
          outputFileId: 'ref-file-ready',
          approvalStatus: 'pending',
        }),
      }));
    mockStartStoryboardIllustrations.mockResolvedValueOnce(response({
      reference: reference({ status: 'queued', jobId: 'ref-job-1' }),
    }));

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

    expect(mockStartStoryboardIllustrations).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.phase).toBe('idle');
    expect(result.current.isBlocking).toBe(false);
  });

  it('continues polling when a manual refresh observes active reference work', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'queued', jobId: 'ref-job-1' }),
      }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'running', jobId: 'ref-job-1' }),
      }))
      .mockResolvedValueOnce(response({
        reference: reference({
          status: 'ready',
          jobId: 'ref-job-1',
          outputFileId: 'ref-file-ready',
          approvalStatus: 'pending',
        }),
      }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('queued');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.reference).toMatchObject({
      status: 'ready',
      approvalStatus: 'pending',
      outputFileId: 'ref-file-ready',
    });
  });

  it('does not mark lifecycle completed while ready scenes wait on principal approval', async () => {
    mockFetchStoryboardIllustrations.mockResolvedValueOnce(response({
      reference: reference({
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'ref-file-1',
        approvalStatus: 'pending',
      }),
      items: [item({ status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' })],
    }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.phase).toBe('idle');
    expect(result.current.isBlocking).toBe(false);
  });

  it('surfaces automatic scene-start failures after the reference is ready', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
      }));
    mockStartStoryboardIllustrations
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'queued', jobId: 'ref-job-1' }),
      }))
      .mockRejectedValueOnce(new Error('scene start failed'));

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
    expect(result.current.phase).toBe('reference');
    expect(result.current.error).toBe('Could not start illustration generation.');
    expect(result.current.isBlocking).toBe(false);
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
      reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-1' }),
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

  it('keeps reference phase when the canonical reference fails', async () => {
    mockFetchStoryboardIllustrations.mockResolvedValueOnce(response({
      reference: reference({
        status: 'failed',
        jobId: 'ref-job-1',
        errorMessage: 'Reference failed',
      }),
    }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, { pollIntervalMs: 100 }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.phase).toBe('reference');
    expect(result.current.reference?.errorMessage).toBe('Reference failed');
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
      .mockResolvedValueOnce(response())
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
      .mockResolvedValueOnce(response({
        items: [item({ blockId: 'block-next', status: 'ready', jobId: 'job-next', outputFileId: 'file-next' })],
      }));

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
        reference: reference({ status: 'ready', jobId: 'ref-old', outputFileId: 'file-old-ref' }),
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
