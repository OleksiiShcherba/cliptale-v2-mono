/**
 * useStoryboardPlanGeneration — Step 2 storyboard plan generation lifecycle.
 *
 * Starts the async planning job only when requested, polls until the persisted
 * job reaches a terminal state, applies only completed plans, and exposes the
 * server-returned storyboard as React Flow-ready canvas state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import {
  applyLatestStoryboardPlan,
  getStoryboardPlanStatus,
  startStoryboardPlan,
} from '@/features/storyboard/api';
import type {
  SceneBlockNodeData,
  SentinelNodeData,
  StoryboardBlock,
  StoryboardEdge,
  StoryboardPlanGenerationStatus,
} from '@/features/storyboard/types';

const DEFAULT_POLL_INTERVAL_MS = 1_000;

export type StoryboardPlanFlowNode = {
  id: string;
  type: 'start' | 'end' | 'scene-block';
  position: { x: number; y: number };
  data: SceneBlockNodeData | SentinelNodeData;
  draggable: boolean;
  deletable: boolean;
};

export type StoryboardPlanFlowEdge = {
  id: string;
  source: string;
  sourceHandle: 'exit';
  target: string;
  targetHandle: 'income';
  style: { stroke: string; strokeWidth: number };
};

export type StoryboardPlanCanvasState = {
  nodes: StoryboardPlanFlowNode[];
  edges: StoryboardPlanFlowEdge[];
};

export type UseStoryboardPlanGenerationOptions = {
  /** Used for scene node delete callbacks in generated React Flow node data. */
  onRemoveNode?: (nodeId: string) => void;
  /** Test override; production uses a 1 second poll interval. */
  pollIntervalMs?: number;
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

function blockToNode(
  block: StoryboardBlock,
  onRemoveNode: (nodeId: string) => void,
): StoryboardPlanFlowNode {
  const position = { x: block.positionX, y: block.positionY };

  if (block.blockType === 'start') {
    return {
      id: block.id,
      type: 'start',
      position,
      data: { label: 'START' } satisfies SentinelNodeData,
      draggable: true,
      deletable: false,
    };
  }

  if (block.blockType === 'end') {
    return {
      id: block.id,
      type: 'end',
      position,
      data: { label: 'END' } satisfies SentinelNodeData,
      draggable: true,
      deletable: false,
    };
  }

  return {
    id: block.id,
    type: 'scene-block',
    position,
    data: { block, onRemove: onRemoveNode } satisfies SceneBlockNodeData,
    draggable: true,
    deletable: true,
  };
}

function edgeToFlowEdge(edge: StoryboardEdge): StoryboardPlanFlowEdge {
  return {
    id: edge.id,
    source: edge.sourceBlockId,
    sourceHandle: 'exit',
    target: edge.targetBlockId,
    targetHandle: 'income',
    style: { stroke: '#252535', strokeWidth: 2 },
  };
}

function toCanvasState(
  blocks: StoryboardBlock[],
  edges: StoryboardEdge[],
  onRemoveNode: (nodeId: string) => void,
): StoryboardPlanCanvasState {
  return {
    nodes: blocks.map((block) => blockToNode(block, onRemoveNode)),
    edges: edges.map(edgeToFlowEdge),
  };
}

const START_ERROR_MESSAGE = 'Could not start storyboard generation. Try again.';
const POLL_ERROR_MESSAGE = 'Could not check storyboard generation progress. Try again.';
const APPLY_ERROR_MESSAGE = 'Could not apply generated storyboard scenes. Try again.';
const JOB_FAILED_MESSAGE = 'Storyboard generation failed. Try again.';

export function useStoryboardPlanGeneration(
  draftId: string,
  options: UseStoryboardPlanGenerationOptions = {},
): UseStoryboardPlanGenerationResult {
  const queryClient = useQueryClient();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const onRemoveNode = options.onRemoveNode ?? (() => {});

  const [status, setStatus] = useState<StoryboardPlanGenerationStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<StoryboardPlanCanvasState | null>(null);

  const statusRef = useRef<StoryboardPlanGenerationStatus>('idle');
  const timeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const activeDraftIdRef = useRef(draftId);
  const generationTokenRef = useRef(0);

  const setLifecycleStatus = useCallback((nextStatus: StoryboardPlanGenerationStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const clearPollTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPollTimeout();
    };
  }, [clearPollTimeout]);

  useEffect(() => {
    activeDraftIdRef.current = draftId;
    generationTokenRef.current += 1;
    clearPollTimeout();
    setLifecycleStatus('idle');
    setJobId(null);
    setError(null);
    setCanvasState(null);
  }, [clearPollTimeout, draftId, setLifecycleStatus]);

  const reset = useCallback(() => {
    generationTokenRef.current += 1;
    clearPollTimeout();
    setLifecycleStatus('idle');
    setJobId(null);
    setError(null);
    setCanvasState(null);
  }, [clearPollTimeout, setLifecycleStatus]);

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

      setCanvasState(toCanvasState(appliedState.blocks, appliedState.edges, onRemoveNode));
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

  const poll = useCallback(
    (draftIdForGeneration: string, currentJobId: string, token: number) => {
      clearPollTimeout();

      timeoutRef.current = window.setTimeout(() => {
        void getStoryboardPlanStatus(draftIdForGeneration, currentJobId)
          .then((response) => {
            if (!isCurrentGeneration(draftIdForGeneration, token)) return;

            if (response.status === 'completed') {
              clearPollTimeout();
              void applyCompletedPlan(draftIdForGeneration, token);
              return;
            }

            if (response.status === 'failed') {
              clearPollTimeout();
              setError(JOB_FAILED_MESSAGE);
              setLifecycleStatus('failed');
              return;
            }

            setLifecycleStatus(response.status);
            poll(draftIdForGeneration, currentJobId, token);
          })
          .catch((err: unknown) => {
            if (!isCurrentGeneration(draftIdForGeneration, token)) return;
            clearPollTimeout();
            setError(POLL_ERROR_MESSAGE);
            setLifecycleStatus('failed');
          });
      }, pollIntervalMs);
    },
    [applyCompletedPlan, clearPollTimeout, isCurrentGeneration, pollIntervalMs, setLifecycleStatus],
  );

  const start = useCallback(async (): Promise<string | null> => {
    if (!draftId) return null;
    if (statusRef.current === 'queued' || statusRef.current === 'running' || statusRef.current === 'applying') {
      return jobId;
    }

    clearPollTimeout();
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
      poll(draftId, response.jobId, token);
      return response.jobId;
    } catch (err) {
      if (!isCurrentGeneration(draftId, token)) return null;
      setError(START_ERROR_MESSAGE);
      setLifecycleStatus('failed');
      return null;
    }
  }, [clearPollTimeout, draftId, isCurrentGeneration, jobId, poll, setLifecycleStatus]);

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
