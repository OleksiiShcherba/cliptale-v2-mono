import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchStoryboardIllustrations,
  startStoryboardBlockIllustration,
  startStoryboardIllustrations,
} from '@/features/storyboard/api';
import type { GateErrorDetails } from '@/features/storyboard/api';
import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationLifecycleStatus,
  StoryboardIllustrationStatusItem,
  StoryboardIllustrationStatusResponse,
} from '@/features/storyboard/types';
import { useDraftStoryboardStatusSubscription } from '@/shared/hooks/useRealtimeSubscription';

import {
  derivePhase,
  deriveStatus,
  eventHasIllustrationBinding,
  hasPendingSceneStart,
  isIllustrationStatusResponse,
} from './useStoryboardIllustrations.status';

type UseStoryboardIllustrationsOptions = {
  onStoryboardUpdated?: () => void | Promise<void>;
};

export interface StructuredGateError {
  code: string;
  details: GateErrorDetails;
  message: string;
}

export type UseStoryboardIllustrationsResult = {
  status: StoryboardIllustrationLifecycleStatus;
  phase: StoryboardIllustrationLifecyclePhase;
  error: string | null;
  gateError: StructuredGateError | null;
  items: StoryboardIllustrationStatusItem[];
  byBlockId: Map<string, StoryboardIllustrationStatusItem>;
  isBlocking: boolean;
  start: () => Promise<void>;
  retryBlock: (blockId: string) => Promise<void>;
  refresh: () => Promise<StoryboardIllustrationStatusItem[]>;
};

type StoryboardStatusPayload = {
  resource?: unknown;
  status?: unknown;
};

export function useStoryboardIllustrations(
  draftId: string,
  options: UseStoryboardIllustrationsOptions = {},
): UseStoryboardIllustrationsResult {
  const onStoryboardUpdatedRef = useRef(options.onStoryboardUpdated);
  const isMountedRef = useRef(true);
  const seenOutputFileIdsRef = useRef<Set<string>>(new Set());
  const activeDraftIdRef = useRef(draftId);
  const requestTokenRef = useRef(0);
  const workflowActiveRef = useRef(false);

  const [items, setItems] = useState<StoryboardIllustrationStatusItem[]>([]);
  const [status, setStatus] = useState<StoryboardIllustrationLifecycleStatus>('idle');
  const [phase, setPhase] = useState<StoryboardIllustrationLifecyclePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<StructuredGateError | null>(null);

  useEffect(() => {
    onStoryboardUpdatedRef.current = options.onStoryboardUpdated;
  }, [options.onStoryboardUpdated]);

  const applyResponse = useCallback((response: StoryboardIllustrationStatusResponse) => {
    const nextStatus = deriveStatus(response);
    const nextPhase = derivePhase(response);
    const shouldContinueSceneStart = hasPendingSceneStart(response);

    setItems(response.items);
    setStatus(shouldContinueSceneStart ? 'queued' : nextStatus);
    setPhase(shouldContinueSceneStart ? 'scene' : nextPhase);

    if (nextStatus === 'completed' || nextStatus === 'failed') {
      workflowActiveRef.current = false;
    }

    const readyOutputs = response.items
      .map((item) => item.outputFileId)
      .filter((fileId): fileId is string => fileId !== null);
    const unseenReadyOutput = readyOutputs.find((fileId) => (
      !seenOutputFileIdsRef.current.has(fileId)
    ));
    readyOutputs.forEach((fileId) => {
      seenOutputFileIdsRef.current.add(fileId);
    });

    if (unseenReadyOutput) {
      void onStoryboardUpdatedRef.current?.();
    }
    return { shouldContinueSceneStart };
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

  const refreshStatusSnapshot = useCallback(async (): Promise<StoryboardIllustrationStatusResponse | null> => {
    if (!draftId) return null;
    const token = beginRequest(draftId);
    try {
      const response = await fetchStoryboardIllustrations(draftId);
      if (!isCurrentRequest(draftId, token)) return null;
      setError(null);
      applyResponse(response);
      return response;
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return null;
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

  const refresh = useCallback(async (): Promise<StoryboardIllustrationStatusItem[]> => {
    const response = await refreshStatusSnapshot();
    if (response && hasPendingSceneStart(response)) {
      await continueStoryboardIllustrations();
    }
    return response?.items ?? [];
  }, [continueStoryboardIllustrations, refreshStatusSnapshot]);

  const handleStatusResponse = useCallback(async (
    response: StoryboardIllustrationStatusResponse,
  ): Promise<void> => {
    const result = applyResponse(response);
    if (!result.shouldContinueSceneStart) return;
    try {
      await continueStoryboardIllustrations();
    } catch {
      if (!isMountedRef.current) return;
      workflowActiveRef.current = false;
      setError('Could not start illustration generation.');
      setStatus('failed');
      setPhase('failed');
    }
  }, [applyResponse, continueStoryboardIllustrations]);

  const refreshFromRealtime = useCallback(() => {
    if (!draftId) return;
    void refreshStatusSnapshot()
      .then(async (response) => {
        if (!response || !isMountedRef.current) return;
        await handleStatusResponse(response);
      })
      .catch(() => undefined);
  }, [draftId, handleStatusResponse, refreshStatusSnapshot]);

  useDraftStoryboardStatusSubscription(draftId || null, {
    enabled: Boolean(draftId),
    onEvent: (event) => {
      if (!eventHasIllustrationBinding(event)) return;
      const payload = event.payload as StoryboardStatusPayload;
      if (payload.resource === 'storyboardIllustrations' && isIllustrationStatusResponse(payload.status)) {
        void handleStatusResponse(payload.status);
        return;
      }
      refreshFromRealtime();
    },
    onReconnect: refreshFromRealtime,
  });

  const start = useCallback(async (): Promise<void> => {
    if (!draftId) return;
    const token = beginRequest(draftId);
    workflowActiveRef.current = true;
    setStatus('queued');
    setPhase('scene');
    setError(null);
    setGateError(null);

    try {
      const response = await startStoryboardIllustrations(draftId);
      if (!isCurrentRequest(draftId, token)) return;
      await handleStatusResponse(response);
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return;
      workflowActiveRef.current = false;
      const maybeGate = err as { code?: string; details?: GateErrorDetails; message?: string };
      if (maybeGate.code && maybeGate.details) {
        setGateError({
          code: maybeGate.code,
          details: maybeGate.details,
          message: maybeGate.message ?? 'Gate error',
        });
      }
      setError('Could not start illustration generation.');
      setStatus('failed');
      setPhase('failed');
    }
  }, [beginRequest, draftId, handleStatusResponse, isCurrentRequest]);

  const retryBlock = useCallback(async (blockId: string): Promise<void> => {
    if (!draftId) return;
    const token = beginRequest(draftId);
    setStatus('queued');
    setPhase('scene');
    setError(null);
    setGateError(null);

    try {
      const response = await startStoryboardBlockIllustration(draftId, blockId);
      if (!isCurrentRequest(draftId, token)) return;
      await handleStatusResponse(response);
    } catch (err) {
      if (!isCurrentRequest(draftId, token)) return;
      const maybeGate = err as { code?: string; details?: GateErrorDetails; message?: string };
      if (maybeGate.code && maybeGate.details) {
        setGateError({
          code: maybeGate.code,
          details: maybeGate.details,
          message: maybeGate.message ?? 'Gate error',
        });
      }
      setError('Could not retry the scene illustration.');
      setStatus('failed');
      setPhase('failed');
    }
  }, [beginRequest, draftId, handleStatusResponse, isCurrentRequest]);

  useEffect(() => {
    isMountedRef.current = true;
    activeDraftIdRef.current = draftId;
    requestTokenRef.current += 1;
    seenOutputFileIdsRef.current = new Set();
    workflowActiveRef.current = false;
    setItems([]);
    setStatus('idle');
    setPhase('idle');
    setError(null);
    setGateError(null);
    void refresh().catch(() => undefined);

    return () => {
      isMountedRef.current = false;
    };
  }, [draftId, refresh]);

  const byBlockId = useMemo(() => (
    new Map(items.map((item) => [item.blockId, item]))
  ), [items]);

  return {
    status,
    phase,
    error,
    gateError,
    items,
    byBlockId,
    isBlocking: status === 'queued' || status === 'running',
    start,
    retryBlock,
    refresh,
  };
}
