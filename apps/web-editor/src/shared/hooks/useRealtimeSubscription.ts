import { useEffect, useMemo, useRef } from 'react';

import type {
  RealtimeRedisEvent,
  RealtimeSubscribeMessage,
  RealtimeStoryboardEvent,
} from '@ai-video-editor/project-schema';

import { getRealtimeClient } from '@/lib/realtime-client';

type UseRealtimeSubscriptionOptions = {
  enabled?: boolean;
  onEvent: (event: RealtimeRedisEvent) => void;
  onReconnect?: () => void;
};

export function useRealtimeSubscription(
  message: RealtimeSubscribeMessage | null,
  options: UseRealtimeSubscriptionOptions,
): void {
  const handlersRef = useRef(options);
  const messageRef = useRef(message);
  handlersRef.current = options;
  messageRef.current = message;

  const subscriptionKey = message
    ? JSON.stringify(message)
    : null;

  useEffect(() => {
    if (!messageRef.current || options.enabled === false) return undefined;

    return getRealtimeClient().subscribe(messageRef.current, {
      onEvent: (event) => handlersRef.current.onEvent(event),
      onReconnect: () => handlersRef.current.onReconnect?.(),
    });
  }, [options.enabled, subscriptionKey]);
}

export function useDraftStoryboardStatusSubscription(
  draftId: string | null,
  options: {
    enabled?: boolean;
    onEvent: (event: RealtimeStoryboardEvent) => void;
    onReconnect?: () => void;
  },
): void {
  const message = useMemo<RealtimeSubscribeMessage | null>(() => (
    draftId
      ? { type: 'subscribe', scope: 'draft-storyboard', draftId }
      : null
  ), [draftId]);

  useRealtimeSubscription(message, {
    enabled: options.enabled,
    onEvent: (event) => {
      if (event.type === 'storyboard.status.updated') {
        options.onEvent(event);
      }
    },
    onReconnect: options.onReconnect,
  });
}
