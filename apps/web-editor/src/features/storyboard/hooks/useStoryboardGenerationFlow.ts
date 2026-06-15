/**
 * useStoryboardGenerationFlow — T15 rewire: delegates to usePipelineState.
 *
 * The old client-side orchestration (useStoryboardPlanGeneration +
 * useStoryboardIllustrations) has been retired. This hook now derives
 * compatible plan/illustration status objects from the server-side pipeline
 * state so that StoryboardPageWorkspace keeps its existing prop interface
 * without changes.
 *
 * T16–T19 UI components are NOT wired here; mount-point comments are left
 * in StoryboardPageWorkspace where the real components will plug in.
 */

import type React from 'react';

import type { Edge as FlowEdge, Node } from '@xyflow/react';

import type { StoryboardPlanGenerationStatus, StoryboardIllustrationLifecycleStatus, StoryboardIllustrationLifecyclePhase } from '@/features/storyboard/types';

import type { UseStoryboardPlanGenerationResult } from './useStoryboardPlanGeneration';
import type { UseStoryboardIllustrationsResult } from './useStoryboardIllustrations';
import { usePipelineState } from './usePipelineState';

interface UseStoryboardGenerationFlowArgs {
  draftId: string;
  nodes: Node[];
  isLoading: boolean;
  error: unknown;
  autoStartedPlanDraftRef: React.MutableRefObject<string | null>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<FlowEdge[]>>;
  removeNode: (id: string) => void;
  reloadStoryboard: () => Promise<void>;
}

/** Derive a plan-generation status from the pipeline's active_run_phase. */
function derivePlanStatus(activeRunPhase: string | null): StoryboardPlanGenerationStatus {
  if (activeRunPhase === 'cast_extraction' || activeRunPhase === 'cast_review') return 'idle';
  if (activeRunPhase === 'scene_planning') return 'running';
  if (activeRunPhase === 'scene_illustration') return 'completed';
  return 'idle';
}

/** Derive an illustration lifecycle status from the pipeline's active_run_phase. */
function deriveIllustrationStatus(activeRunPhase: string | null): StoryboardIllustrationLifecycleStatus {
  if (activeRunPhase === 'scene_illustration') return 'running';
  return 'idle';
}

/** Derive an illustration lifecycle phase. */
function deriveIllustrationPhase(activeRunPhase: string | null): StoryboardIllustrationLifecyclePhase {
  if (activeRunPhase === 'scene_illustration') return 'scene';
  return 'idle';
}

export function useStoryboardGenerationFlow({
  draftId,
}: UseStoryboardGenerationFlowArgs) {
  const { state } = usePipelineState(draftId);

  const activeRunPhase = state?.active_run_phase ?? null;

  const planStatus = derivePlanStatus(activeRunPhase);
  const illustrationStatus = deriveIllustrationStatus(activeRunPhase);
  const illustrationPhase = deriveIllustrationPhase(activeRunPhase);

  const isPlanBlocking =
    planStatus === 'queued' || planStatus === 'running' || planStatus === 'applying';

  const isGenerationBlocking = isPlanBlocking || illustrationStatus === 'running';
  const isStep3Disabled = isGenerationBlocking;

  const planGeneration: UseStoryboardPlanGenerationResult = {
    status: planStatus,
    jobId: null,
    error: state?.error_message ?? null,
    canvasState: null,
    start: async () => null,
    retry: async () => null,
    reset: () => {},
  };

  const illustrationGeneration: UseStoryboardIllustrationsResult = {
    status: illustrationStatus,
    phase: illustrationPhase,
    error: state?.error_message ?? null,
    gateError: null,
    items: [],
    byBlockId: new Map(),
    isBlocking: illustrationStatus === 'running',
    start: async () => {},
    retryBlock: async () => {},
    refresh: async () => [],
  };

  return {
    pipelineState: state,
    planGeneration,
    illustrationGeneration,
    isPlanBlocking,
    isGenerationBlocking,
    isStep3Disabled,
  };
}
