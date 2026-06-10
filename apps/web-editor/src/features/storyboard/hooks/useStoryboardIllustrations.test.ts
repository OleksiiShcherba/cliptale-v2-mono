import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DRAFT_ID,
  emitIllustrationStatus,
  item,
  mockDraftSubscriptionHandlers,
  mockFetchStoryboardIllustrations,
  mockStartStoryboardIllustrations,
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

  it('handles scene work: queued -> running -> completed', async () => {
    const onStoryboardUpdated = vi.fn();
    mockFetchStoryboardIllustrations
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({
        items: [item({ status: 'running', jobId: 'scene-job-1' })],
      }))
      .mockResolvedValueOnce(response({
        items: [item({ status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' })],
      }));
    mockStartStoryboardIllustrations
      .mockResolvedValueOnce(response({
        items: [item({ status: 'queued', jobId: 'scene-job-1' })],
      }))
      .mockResolvedValueOnce(response({
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
      items: [item({ status: 'running', jobId: 'scene-job-1' })],
    }));
    expect(result.current.status).toBe('running');

    emitIllustrationStatus(response({
      items: [item({ status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' })],
    }));
    expect(result.current.status).toBe('completed');
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(1);
  });

  it('updates byBlockId from realtime events for multiple scene blocks', async () => {
    const onStoryboardUpdated = vi.fn();

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {
      onStoryboardUpdated,
    }));

    await act(async () => {
      await Promise.resolve();
    });

    // Emit two-block status via realtime event
    emitIllustrationStatus(response({
      items: [
        item({ blockId: 'scene-1', status: 'running', jobId: 'scene-job-1' }),
        item({ blockId: 'scene-2', status: 'queued', jobId: null }),
      ],
    }));

    expect(result.current.status).toBe('running');
    expect(result.current.byBlockId.get('scene-1')?.status).toBe('running');
    expect(result.current.byBlockId.get('scene-2')?.jobId).toBeNull();

    // All scenes complete
    emitIllustrationStatus(response({
      items: [
        item({ blockId: 'scene-1', status: 'ready', jobId: 'scene-job-1', outputFileId: 'scene-file-1' }),
        item({ blockId: 'scene-2', status: 'ready', jobId: 'scene-job-2', outputFileId: 'scene-file-2' }),
      ],
    }));

    expect(result.current.status).toBe('completed');
    expect(result.current.byBlockId.get('scene-2')?.outputFileId).toBe('scene-file-2');
    expect(onStoryboardUpdated).toHaveBeenCalledTimes(2);
  });

});
