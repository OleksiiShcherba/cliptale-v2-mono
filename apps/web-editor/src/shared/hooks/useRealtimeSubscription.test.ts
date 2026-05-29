import { createElement, StrictMode, type ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSubscribe } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
}));

vi.mock('@/lib/realtime-client', () => ({
  getRealtimeClient: () => ({
    subscribe: mockSubscribe,
  }),
}));

import {
  useDraftStoryboardStatusSubscription,
  useRealtimeSubscription,
} from './useRealtimeSubscription';

describe('useRealtimeSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(vi.fn());
  });

  it('does not resubscribe when handlers change for the same subscription key', () => {
    const firstOnEvent = vi.fn();
    const secondOnEvent = vi.fn();
    const firstOnReconnect = vi.fn();
    const secondOnReconnect = vi.fn();

    const { rerender } = renderHook(
      ({ onEvent, onReconnect }) => useRealtimeSubscription(
        { type: 'subscribe', scope: 'draft-storyboard', draftId: 'draft-1' },
        { onEvent, onReconnect },
      ),
      { initialProps: { onEvent: firstOnEvent, onReconnect: firstOnReconnect } },
    );

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    const handlers = mockSubscribe.mock.calls[0][1];

    rerender({ onEvent: secondOnEvent, onReconnect: secondOnReconnect });
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    act(() => {
      handlers.onEvent({
        type: 'storyboard.status.updated',
        draftId: 'draft-1',
        userId: 'user-1',
        payload: {},
      });
      handlers.onReconnect();
    });

    expect(firstOnEvent).not.toHaveBeenCalled();
    expect(firstOnReconnect).not.toHaveBeenCalled();
    expect(secondOnEvent).toHaveBeenCalledTimes(1);
    expect(secondOnReconnect).toHaveBeenCalledTimes(1);
  });

  it('cleans up the first Strict Mode mount before keeping the active subscription', () => {
    const unsubscribeFirst = vi.fn();
    const unsubscribeSecond = vi.fn();
    mockSubscribe
      .mockReturnValueOnce(unsubscribeFirst)
      .mockReturnValueOnce(unsubscribeSecond);

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);

    const { unmount } = renderHook(
      () => useDraftStoryboardStatusSubscription('draft-1', { onEvent: vi.fn() }),
      { wrapper },
    );

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribeFirst).toHaveBeenCalledTimes(1);
    expect(unsubscribeSecond).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribeSecond).toHaveBeenCalledTimes(1);
  });

  it('filters draft storyboard subscriptions to storyboard status events', () => {
    const onEvent = vi.fn();

    renderHook(() => useDraftStoryboardStatusSubscription('draft-1', { onEvent }));
    const handlers = mockSubscribe.mock.calls[0][1];

    act(() => {
      handlers.onEvent({
        type: 'ai.job.updated',
        jobId: 'job-1',
        userId: 'user-1',
        payload: {},
      });
      handlers.onEvent({
        type: 'storyboard.status.updated',
        draftId: 'draft-1',
        userId: 'user-1',
        payload: {},
      });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      type: 'storyboard.status.updated',
      draftId: 'draft-1',
    });
  });
});
