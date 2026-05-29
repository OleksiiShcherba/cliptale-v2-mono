/**
 * useStoryboardPlanGeneration — Step 2 storyboard plan generation lifecycle.
 *
 * Starts the async planning job only when requested, applies completed plans
 * from realtime status events, and exposes the server-returned storyboard as
 * React Flow-ready canvas state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RealtimeStoryboardEvent } from '@ai-video-editor/project-schema';
import { useQueryClient } from '@tanstack/react-query';

import {
  applyLatestStoryboardPlan,
  getStoryboardPlanStatus,
  startStoryboardPlan,
} from '@/features/storyboard/api';
import type { StoryboardPlanGenerationStatus } from '@/features/storyboard/types';
import { useDraftStoryboardStatusSubscription } from '@/shared/hooks/useRealtimeSubscription';

import { toCanvasState, type StoryboardPlanCanvasState } from './useStoryboardPlanGeneration.canvas';
export type {
  StoryboardPlanCanvasState,
  StoryboardPlanFlowEdge,
  StoryboardPlanFlowNode,
} from './useStoryboardPlanGeneration.canvas';

export type UseStoryboardPlanGenerationOptions = {
  /** Used for scene node delete callbacks in generated React Flow node data. */
  onRemoveNode?: (nodeId: string) => void;
};

export type UseStoryboardPlanGenerationResult = {
  status: StoryboardPlanGenerationStatus;
  jobId: string | null;
  error: string | null;
  canvasState: StoryboardPlanCanvasState | null;
  start: () => Promise<string | null>;
  retry: () => Promise<string | null>;
  reset: () => void;
};

const START_ERROR_MESSAGE = 'Could not start storyboard generation. Try again.';
const STATUS_REFRESH_ERROR_MESSAGE = 'Could not check storyboard generation progress. Try again.';
const APPLY_ERROR_MESSAGE = 'Could not apply generated storyboard scenes. Try again.';
const JOB_FAILED_MESSAGE = 'Storyboard generation failed. Try again.';

type StoryboardPlanRealtimePayload = {
  resource?: unknown;
  jobId?: unknown;
  status?: unknown;
};

function getStoryboardPlanPayload(event: RealtimeStoryboardEvent): StoryboardPlanRealtimePayload | null {
  const payload = event.payload as StoryboardPlanRealtimePayload;
  return payload.resource === 'storyboardPlan' ? payload : null;
}

function isPlanJobStatus(status: unknown): status is 'queued' | 'running' | 'completed' | 'failed' {
  return status === 'queued' || status === 'running' || status === 'completed' || status === 'failed';
}

export function useStoryboardPlanGeneration(
  draftId: string,
  options: UseStoryboardPlanGenerationOptions = {},
): UseStoryboardPlanGenerationResult {
  const queryClient = useQueryClient();
  const onRemoveNode = options.onRemoveNode ?? (() => {});

  const [status, setStatus] = useState<StoryboardPlanGenerationStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<StoryboardPlanCanvasState | null>(null);

  const statusRef = useRef<StoryboardPlanGenerationStatus>('idle');
  const isMountedRef = useRef(true);
  const activeDraftIdRef = useRef(draftId);
  const generationTokenRef = useRef(0);

  const setLifecycleStatus = useCallback((nextStatus: StoryboardPlanGenerationStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeDraftIdRef.current = draftId;
    generationTokenRef.current += 1;
    setLifecycleStatus('idle');
    setJobId(null);
    setError(null);
    setCanvasState(null);
  }, [draftId, setLifecycleStatus]);

  const reset = useCallback(() => {
    generationTokenRef.current += 1;
    setLifecycleStatus('idle');
    setJobId(null);
    setError(null);
    setCanvasState(null);
  }, [setLifecycleStatus]);

  const isCurrentGeneration = useCallback((draftIdForGeneration: string, token: number) => (
    isMountedRef.current
      && generationTokenRef.current === token
      && activeDraftIdRef.current === draftIdForGeneration
  ), []);

  const applyCompletedPlan = useCallback(async (
    draftIdForGeneration: string,
    token: number,
  ): Promise<void> => {
    if (!isCurrentGeneration(draftIdForGeneration, token)) return;
    setLifecycleStatus('applying');

    try {
      const appliedState = await applyLatestStoryboardPlan(draftIdForGeneration);
      if (!isCurrentGeneration(draftIdForGeneration, token)) return;

      setCanvasState(toCanvasState(
        appliedState.blocks,
        appliedState.edges,
        appliedState.musicBlocks,
        onRemoveNode,
      ));
      await queryClient.invalidateQueries({ queryKey: ['storyboard-history', draftIdForGeneration] });
      if (!isCurrentGeneration(draftIdForGeneration, token)) return;

      setError(null);
      setLifecycleStatus('completed');
    } catch (err) {
      if (!isCurrentGeneration(draftIdForGeneration, token)) return;
      setError(APPLY_ERROR_MESSAGE);
      setLifecycleStatus('failed');
    }
  }, [isCurrentGeneration, onRemoveNode, queryClient, setLifecycleStatus]);

  const handlePlanStatus = useCallback((
    draftIdForGeneration: string,
    currentJobId: string,
    token: number,
    nextStatus: 'queued' | 'running' | 'completed' | 'failed',
  ) => {
    if (!isCurrentGeneration(draftIdForGeneration, token)) return;

    if (nextStatus === 'completed') {
      void applyCompletedPlan(draftIdForGeneration, token);
      return;
    }

    if (nextStatus === 'failed') {
      setError(JOB_FAILED_MESSAGE);
      setLifecycleStatus('failed');
      return;
    }

    setLifecycleStatus(nextStatus);
  }, [applyCompletedPlan, isCurrentGeneration, setLifecycleStatus]);

  const refreshCurrentPlanStatus = useCallback(() => {
    const currentJobId = jobId;
    if (!draftId || !currentJobId) return;
    if (statusRef.current !== 'queued' && statusRef.current !== 'running') return;

    const token = generationTokenRef.current;
    void getStoryboardPlanStatus(draftId, currentJobId)
      .then((response) => {
        handlePlanStatus(draftId, currentJobId, token, response.status);
      })
      .catch(() => {
        if (!isCurrentGeneration(draftId, token)) return;
        setError(STATUS_REFRESH_ERROR_MESSAGE);
        setLifecycleStatus('failed');
      });
  }, [draftId, handlePlanStatus, isCurrentGeneration, jobId, setLifecycleStatus]);

  useDraftStoryboardStatusSubscription(draftId || null, {
    enabled: Boolean(draftId),
    onEvent: (event) => {
      const payload = getStoryboardPlanPayload(event);
      if (
        !payload ||
        typeof payload.jobId !== 'string' ||
        payload.jobId !== jobId ||
        !isPlanJobStatus(payload.status)
      ) {
        return;
      }
      handlePlanStatus(draftId, payload.jobId, generationTokenRef.current, payload.status);
    },
    onReconnect: refreshCurrentPlanStatus,
  });

  const start = useCallback(async (): Promise<string | null> => {
    if (!draftId) return null;
    if (statusRef.current === 'queued' || statusRef.current === 'running' || statusRef.current === 'applying') {
      return jobId;
    }

    const token = generationTokenRef.current + 1;
    generationTokenRef.current = token;
    activeDraftIdRef.current = draftId;
    setLifecycleStatus('queued');
    setJobId(null);
    setError(null);
    setCanvasState(null);

    try {
      const response = await startStoryboardPlan(draftId);
      if (!isCurrentGeneration(draftId, token)) return null;

      setJobId(response.jobId);
      setLifecycleStatus(response.status);
      return response.jobId;
    } catch (err) {
      if (!isCurrentGeneration(draftId, token)) return null;
      setError(START_ERROR_MESSAGE);
      setLifecycleStatus('failed');
      return null;
    }
  }, [draftId, isCurrentGeneration, jobId, setLifecycleStatus]);

  return {
    status,
    jobId,
    error,
    canvasState,
    start,
    retry: start,
    reset,
  };
}
