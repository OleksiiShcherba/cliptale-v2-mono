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
  response,
  setupStoryboardIllustrationsTestLifecycle,
} from './useStoryboardIllustrations.test-utils';
import { useStoryboardIllustrations } from './useStoryboardIllustrations';

describe('useStoryboardIllustrations lifecycle edges', () => {
  setupStoryboardIllustrationsTestLifecycle();

  // AC-08 (T9): tests for "does not auto-start scene work while the ready reference is pending
  // approval" and "does not mark lifecycle completed while ready scenes wait on principal
  // approval" have been retired — the principal-image approval step no longer exists.

  it('surfaces scene-start failures when start() call fails', async () => {
    // After AC-08, the principal-approval continuation no longer exists.
    // Test that a direct start() failure surfaces correctly.
    mockStartStoryboardIllustrations
      .mockRejectedValueOnce(new Error('scene start failed'));

    const { result } = renderHook(() => useStoryboardIllustrations(DRAFT_ID, {}));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('failed');
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

  // AC-08 (T9): "keeps reference phase when the canonical reference fails" retired —
  // the reference field and 'reference' phase no longer exist after T9.

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
