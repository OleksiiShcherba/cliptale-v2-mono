import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DRAFT_ID,
  emitIllustrationStatus,
  item,
  mockDraftSubscriptionHandlers,
  mockFetchStoryboardIllustrations,
  mockStartStoryboardBlockIllustration,
  mockStartStoryboardIllustrations,
  reference,
  response,
  setupStoryboardIllustrationsTestLifecycle,
} from './useStoryboardIllustrations.test-utils';
import { useStoryboardIllustrations } from './useStoryboardIllustrations';

describe('useStoryboardIllustrations lifecycle edges', () => {
  setupStoryboardIllustrationsTestLifecycle();

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

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });
    emitIllustrationStatus(response({
      reference: reference({
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'ref-file-ready',
        approvalStatus: 'pending',
      }),
    }));

    expect(mockStartStoryboardIllustrations).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.phase).toBe('idle');
    expect(result.current.isBlocking).toBe(false);
  });

  it('updates when realtime events report active reference work', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'queued', jobId: 'ref-job-1' }),
      }))
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'running', jobId: 'ref-job-1' }),
      }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });

    emitIllustrationStatus(response({
      reference: reference({ status: 'running', jobId: 'ref-job-1' }),
    }));
    await waitFor(() => expect(result.current.status).toBe('running'));

    emitIllustrationStatus(response({
      reference: reference({
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'ref-file-ready',
        approvalStatus: 'pending',
      }),
    }));
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

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).not.toBe('completed'));
    expect(result.current.phase).not.toBe('completed');
  });

  it('surfaces automatic scene-start failures after the reference is ready', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({
        reference: reference({
          status: 'ready',
          jobId: 'ref-job-1',
          outputFileId: 'ref-file-ready',
          approvalStatus: 'approved',
        }),
      }));
    mockStartStoryboardIllustrations
      .mockResolvedValueOnce(response({
        reference: reference({ status: 'queued', jobId: 'ref-job-1' }),
      }))
      .mockRejectedValueOnce(new Error('scene start failed'));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      mockDraftSubscriptionHandlers.at(-1)?.onEvent({
        type: 'storyboard.status.updated',
        draftId: DRAFT_ID,
        userId: 'user-1',
        payload: {
          resource: 'storyboardIllustrations',
          status: response({
            reference: reference({
              status: 'ready',
              jobId: 'ref-job-1',
              outputFileId: 'ref-file-ready',
              approvalStatus: 'approved',
            }),
          }),
        },
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.phase).toBe('reference');
    expect(result.current.error).toBe('Could not start illustration generation.');
    expect(result.current.isBlocking).toBe(false);
  });

  it('retries one failed block through the block endpoint', async () => {
    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

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
    const failedResponse = response({
      reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-1' }),
      items: [item({ status: 'failed', jobId: 'job-1', errorMessage: 'Provider failed' })],
    });

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });
    emitIllustrationStatus(failedResponse);

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.isBlocking).toBe(false);
    expect(result.current.byBlockId.get('block-1')?.errorMessage).toBe('Provider failed');
  });

  it('keeps reference phase when the canonical reference fails', async () => {
    const failedResponse = response({
      reference: reference({
        status: 'failed',
        jobId: 'ref-job-1',
        errorMessage: 'Reference failed',
      }),
    });

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });
    emitIllustrationStatus(failedResponse);

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.phase).toBe('reference');
    expect(result.current.reference?.errorMessage).toBe('Reference failed');
  });

  it('surfaces start and retry request failures without keeping Step 3 blocked', async () => {
    mockStartStoryboardIllustrations.mockRejectedValueOnce(new Error('start failed'));
    const first = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

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
    const second = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

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

  it('does not schedule repeated status requests after active work starts', async () => {
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });
    const callCount = mockFetchStoryboardIllustrations.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledTimes(callCount);
  });

});
