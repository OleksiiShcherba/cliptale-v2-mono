import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DRAFT_ID,
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

describe('useStoryboardIllustrations', () => {
  setupStoryboardIllustrationsTestLifecycle();

  it('loads existing illustration statuses without treating missing jobs as blocking', async () => {
    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchStoryboardIllustrations).toHaveBeenCalledWith(DRAFT_ID);
    expect(result.current.status).toBe('idle');
    expect(result.current.isBlocking).toBe(false);
    expect(result.current.byBlockId.get('block-1')?.jobId).toBeNull();
  });

  it('starts all illustrations, follows realtime job events, and refreshes storyboard when output arrives', async () => {
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
      onStoryboardUpdated,
    }));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isBlocking).toBe(true);

    emitIllustrationStatus(response({
      items: [item({ status: 'running', jobId: 'job-1' })],
    }));
    expect(result.current.status).toBe('running');

    emitIllustrationStatus(response({
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
    expect(result.current.status).toBe('completed');
    expect(result.current.isBlocking).toBe(false);
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(1);
  });

  it('handles reference work, then starts scene work when the reference is ready', async () => {
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

    emitIllustrationStatus(response({
      reference: reference({ status: 'running', jobId: 'ref-job-1' }),
    }));
    expect(result.current.status).toBe('running');

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
    expect(mockStartStoryboardIllustrations).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('running');
    expect(result.current.phase).toBe('scene');
    expect(result.current.reference?.outputFileId).toBe('ref-file-ready');

    emitIllustrationStatus(response({
      reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
      items: [item({ status: 'running', jobId: 'scene-job-1' })],
    }));
    expect(result.current.status).toBe('running');

    emitIllustrationStatus(response({
      reference: reference({ status: 'ready', jobId: 'ref-job-1', outputFileId: 'ref-file-ready', approvalStatus: 'approved' }),
      items: [item({ status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' })],
    }));
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
      mockDraftSubscriptionHandlers.at(-1)?.onEvent({
        type: 'storyboard.status.updated',
        draftId: DRAFT_ID,
        userId: 'user-1',
        payload: {
          resource: 'storyboardIllustrations',
          status: response({
            reference: approvedReference,
            items: [
              item({ blockId: 'scene-1', status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' }),
              item({ blockId: 'scene-2', status: 'queued', jobId: null }),
            ],
          }),
        },
      });
      await Promise.resolve();
    });

    expect(mockStartStoryboardIllustrations).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('running');
    expect(result.current.byBlockId.get('scene-2')?.jobId).toBe('scene-job-2');

    emitIllustrationStatus(response({
      reference: approvedReference,
      items: [
        item({ blockId: 'scene-1', status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' }),
        item({ blockId: 'scene-2', status: 'ready', jobId: 'scene-job-2', outputFileId: 'scene-file-2' }),
      ],
    }));

    expect(result.current.status).toBe('completed');
    expect(result.current.byBlockId.get('scene-2')?.outputFileId).toBe('scene-file-2');
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(4);
  });

});
