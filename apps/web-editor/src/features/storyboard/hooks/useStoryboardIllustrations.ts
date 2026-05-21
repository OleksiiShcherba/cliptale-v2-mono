import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchStoryboardIllustrations,
  startStoryboardBlockIllustration,
  startStoryboardIllustrations,
} from '@/features/storyboard/api';
import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationReferenceStatus,
  StoryboardIllustrationLifecycleStatus,
  StoryboardIllustrationStatusItem,
  StoryboardIllustrationStatusResponse,
} from '@/features/storyboard/types';

const DEFAULT_POLL_INTERVAL_MS = 1_500;

type UseStoryboardIllustrationsOptions = {
  pollIntervalMs?: number;
  onStoryboardUpdated?: () => void | Promise<void>;
};

export type UseStoryboardIllustrationsResult = {
  status: StoryboardIllustrationLifecycleStatus;
  phase: StoryboardIllustrationLifecyclePhase;
  error: string | null;
  reference: StoryboardIllustrationReferenceStatus | null;
  items: StoryboardIllustrationStatusItem[];
  byBlockId: Map<string, StoryboardIllustrationStatusItem>;
  isBlocking: boolean;
  start: () => Promise<void>;
  retryBlock: (blockId: string) => Promise<void>;
  refresh: () => Promise<StoryboardIllustrationStatusItem[]>;
};

function hasActiveJob(item: StoryboardIllustrationStatusItem | StoryboardIllustrationReferenceStatus): boolean {
  return item.jobId !== null && (item.status === 'queued' || item.status === 'running');
}

function deriveStatus(response: StoryboardIllustrationStatusResponse): StoryboardIllustrationLifecycleStatus {
  const entries = [response.reference, ...response.items];
  if (entries.some(hasActiveJob)) {
    return entries.some((item) => item.jobId !== null && item.status === 'running') ? 'running' : 'queued';
  }
  if (entries.some((item) => item.status === 'failed')) return 'failed';
  if (
    response.reference.status === 'ready' &&
    response.reference.approvalStatus === 'approved' &&
    response.items.length > 0 &&
    response.items.every((item) => item.jobId !== null && item.status === 'ready')
  ) {
    return 'completed';
  }
  return 'idle';
}

function derivePhase(response: StoryboardIllustrationStatusResponse): StoryboardIllustrationLifecyclePhase {
  if (hasActiveJob(response.reference)) {
    return 'reference';
  }
  if (response.items.some(hasActiveJob)) {
    return 'scene';
  }
  if (response.reference.status === 'failed') {
    return 'reference';
  }
  if (response.items.some((item) => item.status === 'failed')) {
    return 'scene';
  }
  if (
    response.reference.status === 'ready' &&
    response.reference.approvalStatus === 'approved' &&
    response.items.length > 0 &&
    response.items.every((item) => item.jobId !== null && item.status === 'ready')
  ) {
    return 'completed';
  }
  return 'idle';
}

function hasActiveWork(response: StoryboardIllustrationStatusResponse): boolean {
  return hasActiveJob(response.reference) || response.items.some(hasActiveJob);
}

function hasPendingSceneStart(response: StoryboardIllustrationStatusResponse): boolean {
  return (
    response.reference.status === 'ready' &&
    response.reference.approvalStatus === 'approved' &&
    !response.items.some(hasActiveJob) &&
    response.items.some((item) => item.status === 'queued' && item.jobId === null)
  );
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
  const hasActiveWorkRef = useRef(false);
  const workflowActiveRef = useRef(false);
  const shouldContinueSceneStartRef = useRef(false);
  const schedulePollRef = useRef<(() => void) | null>(null);

  const [items, setItems] = useState<StoryboardIllustrationStatusItem[]>([]);
  const [reference, setReference] = useState<StoryboardIllustrationReferenceStatus | null>(null);
  const [status, setStatus] = useState<StoryboardIllustrationLifecycleStatus>('idle');
  const [phase, setPhase] = useState<StoryboardIllustrationLifecyclePhase>('idle');
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

  const applyResponse = useCallback((response: StoryboardIllustrationStatusResponse) => {
    const nextStatus = deriveStatus(response);
    const nextPhase = derivePhase(response);
    const shouldContinueSceneStart = workflowActiveRef.current && hasPendingSceneStart(response);

    setReference(response.reference);
    setItems(response.items);
    setStatus(shouldContinueSceneStart ? 'queued' : nextStatus);
    setPhase(shouldContinueSceneStart ? 'scene' : nextPhase);
    hasActiveWorkRef.current = hasActiveWork(response) || shouldContinueSceneStart;
    shouldContinueSceneStartRef.current = shouldContinueSceneStart;

    if (nextStatus === 'completed' || nextStatus === 'failed') {
      workflowActiveRef.current = false;
    }

    const readyOutputs = [
      response.reference.outputFileId,
      ...response.items.map((item) => item.outputFileId),
    ].filter((fileId): fileId is string => fileId !== null);
    const unseenReadyOutput = readyOutputs.find((fileId) => (
      !seenOutputFileIdsRef.current.has(fileId)
    ));
    readyOutputs.forEach((fileId) => {
      seenOutputFileIdsRef.current.add(fileId);
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
      applyResponse(response);
      if (hasActiveWork(response)) {
        schedulePollRef.current?.();
      }
      return response.items;
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return [];
      setError('Could not check illustration progress.');
      setStatus('failed');
      setPhase('failed');
      throw err;
    }
  }, [applyResponse, beginRequest, draftId, isCurrentRequest]);

  const continueStoryboardIllustrations = useCallback(async (): Promise<void> => {
    if (!draftId) return;
    const token = requestTokenRef.current;
    const draftIdForRequest = draftId;
    const response = await startStoryboardIllustrations(draftId);
    if (!isCurrentRequest(draftIdForRequest, token)) return;
    applyResponse(response);
  }, [applyResponse, draftId, isCurrentRequest]);

  const schedulePoll = useCallback(() => {
    clearPollTimeout();
    timeoutRef.current = window.setTimeout(() => {
      void refresh().then(async () => {
        if (!isMountedRef.current) return;
        if (shouldContinueSceneStartRef.current) {
          try {
            await continueStoryboardIllustrations();
          } catch {
            if (!isMountedRef.current) return;
            workflowActiveRef.current = false;
            hasActiveWorkRef.current = false;
            shouldContinueSceneStartRef.current = false;
            setError('Could not start illustration generation.');
            setStatus('failed');
            setPhase('reference');
          }
          if (!isMountedRef.current) return;
        }
        if (hasActiveWorkRef.current) schedulePoll();
      }).catch(() => {
        clearPollTimeout();
      });
    }, pollIntervalMs);
  }, [clearPollTimeout, continueStoryboardIllustrations, pollIntervalMs, refresh]);

  useEffect(() => {
    schedulePollRef.current = schedulePoll;
  }, [schedulePoll]);

  const start = useCallback(async (): Promise<void> => {
    if (!draftId) return;
    clearPollTimeout();
    const token = beginRequest(draftId);
    workflowActiveRef.current = true;
    setStatus('queued');
    setPhase('reference');
    setError(null);

    try {
      const response = await startStoryboardIllustrations(draftId);
      if (!isCurrentRequest(draftId, token)) return;
      applyResponse(response);
      if (hasActiveWorkRef.current) schedulePoll();
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return;
      workflowActiveRef.current = false;
      setError('Could not start illustration generation.');
      setStatus('failed');
      setPhase('failed');
    }
  }, [applyResponse, beginRequest, clearPollTimeout, draftId, isCurrentRequest, schedulePoll]);

  const retryBlock = useCallback(async (blockId: string): Promise<void> => {
    if (!draftId) return;
    clearPollTimeout();
    const token = beginRequest(draftId);
    setStatus('queued');
    setPhase('scene');
    setError(null);

    try {
      const response = await startStoryboardBlockIllustration(draftId, blockId);
      if (!isCurrentRequest(draftId, token)) return;
      applyResponse(response);
      if (hasActiveWork(response)) schedulePoll();
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return;
      setError('Could not retry the scene illustration.');
      setStatus('failed');
      setPhase('failed');
    }
  }, [applyResponse, beginRequest, clearPollTimeout, draftId, isCurrentRequest, schedulePoll]);

  useEffect(() => {
    isMountedRef.current = true;
    activeDraftIdRef.current = draftId;
    requestTokenRef.current += 1;
    seenOutputFileIdsRef.current = new Set();
    hasActiveWorkRef.current = false;
    workflowActiveRef.current = false;
    shouldContinueSceneStartRef.current = false;
    clearPollTimeout();
    setItems([]);
    setReference(null);
    setStatus('idle');
    setPhase('idle');
    setError(null);
    void refresh().then((nextItems) => {
      if (!isMountedRef.current) return;
      if (hasActiveWorkRef.current) schedulePoll();
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
    phase,
    error,
    reference,
    items,
    byBlockId,
    isBlocking: status === 'queued' || status === 'running',
    start,
    retryBlock,
    refresh,
  };
}
