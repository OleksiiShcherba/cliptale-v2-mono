import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DRAFT_ID,
  NEXT_DRAFT_ID,
  emitIllustrationStatus,
  item,
  mockDraftSubscriptionHandlers,
  mockFetchStoryboardIllustrations,
  mockStartStoryboardIllustrations,
  reference,
  response,
  setupStoryboardIllustrationsTestLifecycle,
} from './useStoryboardIllustrations.test-utils';
import { useStoryboardIllustrations } from './useStoryboardIllustrations';

describe('useStoryboardIllustrations realtime refreshes', () => {
  setupStoryboardIllustrationsTestLifecycle();

  it('refreshes illustration status once after reconnect', async () => {
    const completedResponse = response({
      reference: reference({
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'ref-file-1',
        approvalStatus: 'approved',
      }),
      items: [item({ status: 'ready', jobId: 'job-1', outputFileId: 'file-1' })],
    });
    mockFetchStoryboardIllustrations.mockReset();
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response({
        items: [item({ status: 'running', jobId: 'job-1' })],
      }))
      .mockResolvedValue(completedResponse);

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await waitFor(() => expect(mockFetchStoryboardIllustrations).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockDraftSubscriptionHandlers.at(-1)?.onReconnect?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('completed'));
    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledTimes(2);
  });

  it('continues scene generation from realtime status even after local workflow state reset', async () => {
    const approvedReference = reference({
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'ref-file-ready',
      approvalStatus: 'approved',
    });
    mockStartStoryboardIllustrations.mockResolvedValueOnce(response({
      reference: approvedReference,
      items: [
        item({
          blockId: 'scene-1',
          status: 'ready',
          jobId: 'scene-job-1',
          outputFileId: 'scene-file-1',
        }),
        item({ blockId: 'scene-2', status: 'running', jobId: 'scene-job-2' }),
      ],
    }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await waitFor(() => expect(mockFetchStoryboardIllustrations).toHaveBeenCalledWith(DRAFT_ID));
    await act(async () => {
      mockDraftSubscriptionHandlers.at(-1)?.onEvent({
        type: 'storyboard.status.updated',
        draftId: DRAFT_ID,
        userId: 'user-1',
        payload: {
          resource: 'storyboardIllustrations',
          status: response({
            reference: approvedReference,
            items: [
              item({
                blockId: 'scene-1',
                status: 'ready',
                jobId: 'scene-job-1',
                outputFileId: 'scene-file-1',
              }),
              item({ blockId: 'scene-2', status: 'queued', jobId: null }),
            ],
          }),
        },
      });
      await Promise.resolve();
    });

    expect(mockStartStoryboardIllustrations).toHaveBeenCalledWith(DRAFT_ID);
    expect(result.current.status).toBe('running');
    expect(result.current.byBlockId.get('scene-2')?.jobId).toBe('scene-job-2');
  });

  it('resumes sequential scene generation from the refreshed status snapshot', async () => {
    const approvedReference = reference({
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'ref-file-ready',
      approvalStatus: 'approved',
    });
    mockFetchStoryboardIllustrations.mockResolvedValueOnce(response({
      reference: approvedReference,
      items: [
        item({
          blockId: 'scene-1',
          status: 'ready',
          jobId: 'scene-job-1',
          outputFileId: 'scene-file-1',
        }),
        item({ blockId: 'scene-2', status: 'queued', jobId: null }),
      ],
    }));
    mockStartStoryboardIllustrations.mockResolvedValueOnce(response({
      reference: approvedReference,
      items: [
        item({
          blockId: 'scene-1',
          status: 'ready',
          jobId: 'scene-job-1',
          outputFileId: 'scene-file-1',
        }),
        item({ blockId: 'scene-2', status: 'running', jobId: 'scene-job-2' }),
      ],
    }));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await waitFor(() => expect(mockStartStoryboardIllustrations).toHaveBeenCalledWith(DRAFT_ID));
    expect(result.current.status).toBe('running');
    expect(result.current.byBlockId.get('scene-2')?.jobId).toBe('scene-job-2');
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
      ({ draftId }) => useStoryboardIllustrations(draftId, {}),
      { initialProps: { draftId: DRAFT_ID } },
    );

    rerender({ draftId: NEXT_DRAFT_ID });
    await act(async () => {
      await Promise.resolve();
    });

    emitIllustrationStatus(response({
      items: [item({ blockId: 'block-next', status: 'ready', jobId: 'job-next', outputFileId: 'file-next' })],
    }));

    await waitFor(() => expect(result.current.byBlockId.get('block-next')?.outputFileId).toBe('file-next'));

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
      await Promise.resolve();
    });
    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledTimes(callCount);
  });
});
