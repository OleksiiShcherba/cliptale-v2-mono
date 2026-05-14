import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchStoryboardIllustrations,
  startStoryboardBlockIllustration,
  startStoryboardIllustrations,
} from '@/features/storyboard/api';
import type {
  StoryboardIllustrationLifecycleStatus,
  StoryboardIllustrationStatusItem,
} from '@/features/storyboard/types';

const DEFAULT_POLL_INTERVAL_MS = 1_500;

type UseStoryboardIllustrationsOptions = {
  pollIntervalMs?: number;
  onStoryboardUpdated?: () => void | Promise<void>;
};

export type UseStoryboardIllustrationsResult = {
  status: StoryboardIllustrationLifecycleStatus;
  error: string | null;
  items: StoryboardIllustrationStatusItem[];
  byBlockId: Map<string, StoryboardIllustrationStatusItem>;
  isBlocking: boolean;
  start: () => Promise<void>;
  retryBlock: (blockId: string) => Promise<void>;
  refresh: () => Promise<StoryboardIllustrationStatusItem[]>;
};

function hasActiveJob(item: StoryboardIllustrationStatusItem): boolean {
  return item.jobId !== null && (item.status === 'queued' || item.status === 'running');
}

function deriveStatus(items: StoryboardIllustrationStatusItem[]): StoryboardIllustrationLifecycleStatus {
  if (items.some(hasActiveJob)) {
    return items.some((item) => item.jobId !== null && item.status === 'running') ? 'running' : 'queued';
  }
  if (items.some((item) => item.status === 'failed')) return 'failed';
  if (items.length > 0 && items.every((item) => item.jobId !== null && item.status === 'ready')) {
    return 'completed';
  }
  return 'idle';
}

export function useStoryboardIllustrations(
  draftId: string,
  options: UseStoryboardIllustrationsOptions = {},
): UseStoryboardIllustrationsResult {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const onStoryboardUpdatedRef = useRef(options.onStoryboardUpdated);
  const timeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const seenOutputFileIdsRef = useRef<Set<string>>(new Set());
  const activeDraftIdRef = useRef(draftId);
  const requestTokenRef = useRef(0);

  const [items, setItems] = useState<StoryboardIllustrationStatusItem[]>([]);
  const [status, setStatus] = useState<StoryboardIllustrationLifecycleStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onStoryboardUpdatedRef.current = options.onStoryboardUpdated;
  }, [options.onStoryboardUpdated]);

  const clearPollTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const applyItems = useCallback((nextItems: StoryboardIllustrationStatusItem[]) => {
    setItems(nextItems);
    setStatus(deriveStatus(nextItems));

    const unseenReadyOutput = nextItems.find((item) => (
      item.outputFileId !== null && !seenOutputFileIdsRef.current.has(item.outputFileId)
    ));
    nextItems.forEach((item) => {
      if (item.outputFileId) seenOutputFileIdsRef.current.add(item.outputFileId);
    });

    if (unseenReadyOutput) {
      void onStoryboardUpdatedRef.current?.();
    }
  }, []);

  const beginRequest = useCallback((draftIdForRequest: string): number => {
    const token = requestTokenRef.current + 1;
    requestTokenRef.current = token;
    activeDraftIdRef.current = draftIdForRequest;
    return token;
  }, []);

  const isCurrentRequest = useCallback((draftIdForRequest: string, token: number): boolean => (
    isMountedRef.current
      && requestTokenRef.current === token
      && activeDraftIdRef.current === draftIdForRequest
  ), []);

  const refresh = useCallback(async (): Promise<StoryboardIllustrationStatusItem[]> => {
    if (!draftId) return [];
    const token = beginRequest(draftId);
    try {
      const response = await fetchStoryboardIllustrations(draftId);
      if (!isCurrentRequest(draftId, token)) return [];
      setError(null);
      applyItems(response.items);
      return response.items;
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return [];
      setError('Could not check illustration progress.');
      setStatus('failed');
      throw err;
    }
  }, [applyItems, beginRequest, draftId, isCurrentRequest]);

  const schedulePoll = useCallback(() => {
    clearPollTimeout();
    timeoutRef.current = window.setTimeout(() => {
      void refresh().then((nextItems) => {
        if (!isMountedRef.current) return;
        if (nextItems.some(hasActiveJob)) schedulePoll();
      }).catch(() => {
        clearPollTimeout();
      });
    }, pollIntervalMs);
  }, [clearPollTimeout, pollIntervalMs, refresh]);

  const start = useCallback(async (): Promise<void> => {
    if (!draftId) return;
    clearPollTimeout();
    const token = beginRequest(draftId);
    setStatus('queued');
    setError(null);

    try {
      const response = await startStoryboardIllustrations(draftId);
      if (!isCurrentRequest(draftId, token)) return;
      applyItems(response.items);
      if (response.items.some(hasActiveJob)) schedulePoll();
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return;
      setError('Could not start illustration generation.');
      setStatus('failed');
    }
  }, [applyItems, beginRequest, clearPollTimeout, draftId, isCurrentRequest, schedulePoll]);

  const retryBlock = useCallback(async (blockId: string): Promise<void> => {
    if (!draftId) return;
    clearPollTimeout();
    const token = beginRequest(draftId);
    setStatus('queued');
    setError(null);

    try {
      const response = await startStoryboardBlockIllustration(draftId, blockId);
      if (!isCurrentRequest(draftId, token)) return;
      applyItems(response.items);
      if (response.items.some(hasActiveJob)) schedulePoll();
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return;
      setError('Could not retry the scene illustration.');
      setStatus('failed');
    }
  }, [applyItems, beginRequest, clearPollTimeout, draftId, isCurrentRequest, schedulePoll]);

  useEffect(() => {
    isMountedRef.current = true;
    activeDraftIdRef.current = draftId;
    requestTokenRef.current += 1;
    seenOutputFileIdsRef.current = new Set();
    clearPollTimeout();
    setItems([]);
    setStatus('idle');
    setError(null);
    void refresh().then((nextItems) => {
      if (!isMountedRef.current) return;
      if (nextItems.some(hasActiveJob)) schedulePoll();
    }).catch(() => {
      clearPollTimeout();
    });

    return () => {
      isMountedRef.current = false;
      clearPollTimeout();
    };
  }, [clearPollTimeout, draftId, refresh, schedulePoll]);

  const byBlockId = useMemo(() => (
    new Map(items.map((item) => [item.blockId, item]))
  ), [items]);

  return {
    status,
    error,
    items,
    byBlockId,
    isBlocking: status === 'queued' || status === 'running',
    start,
    retryBlock,
    refresh,
  };
}
