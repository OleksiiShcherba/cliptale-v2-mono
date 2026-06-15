/**
 * useStoryboardGenerationFlow — T15 rewire: delegates to usePipelineState.
 *
 * The old client-side orchestration (useStoryboardPlanGeneration +
 * useStoryboardIllustrations) has been retired. This hook now derives
 * compatible plan/illustration status objects from the server-side pipeline
 * state so that StoryboardPageWorkspace keeps its existing prop interface
 * without changes.
 *
 * Mapping (T15 reconciliation):
 *   scene phase status     → StoryboardPlanGenerationStatus
 *   scene_image phase status → StoryboardIllustrationLifecycleStatus
 *
 * PhaseStatus → plan:
 *   idle            → idle
 *   queued          → queued
 *   running         → running
 *   awaiting_review → running  (still in-progress from the UI's perspective)
 *   completed       → completed
 *   skipped         → completed (skipped counts as done)
 *   failed          → failed
 *
 * PhaseStatus → illustration:
 *   idle            → idle
 *   queued          → queued
 *   running         → running
 *   awaiting_review → running
 *   completed       → completed
 *   skipped         → completed
 *   failed          → failed
 *
 * T16–T19 UI components are NOT wired here; mount-point comments are left
 * in StoryboardPageWorkspace where the real components will plug in.
 */

import type React from 'react';

import type { Edge as FlowEdge, Node } from '@xyflow/react';

import type { StoryboardPlanGenerationStatus, StoryboardIllustrationLifecycleStatus, StoryboardIllustrationLifecyclePhase } from '@/features/storyboard/types';
import type { PhaseStatus } from '@/features/storyboard/api';

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

/** Map a pipeline PhaseStatus → StoryboardPlanGenerationStatus. */
function mapPhaseToPlantStatus(phaseStatus: PhaseStatus): StoryboardPlanGenerationStatus {
  switch (phaseStatus) {
    case 'queued': return 'queued';
    case 'running': return 'running';
    case 'awaiting_review': return 'running';
    case 'completed': return 'completed';
    case 'skipped': return 'completed';
    case 'failed': return 'failed';
    case 'idle':
    default:
      return 'idle';
  }
}

/** Map a pipeline PhaseStatus → StoryboardIllustrationLifecycleStatus. */
function mapPhaseToIllustrationStatus(phaseStatus: PhaseStatus): StoryboardIllustrationLifecycleStatus {
  switch (phaseStatus) {
    case 'queued': return 'queued';
    case 'running': return 'running';
    case 'awaiting_review': return 'running';
    case 'completed': return 'completed';
    case 'skipped': return 'completed';
    case 'failed': return 'failed';
    case 'idle':
    default:
      return 'idle';
  }
}

/** Derive an illustration lifecycle phase from the illustration status. */
function deriveIllustrationPhase(illustrationStatus: StoryboardIllustrationLifecycleStatus): StoryboardIllustrationLifecyclePhase {
  if (illustrationStatus === 'running' || illustrationStatus === 'queued') return 'scene';
  if (illustrationStatus === 'completed') return 'completed';
  if (illustrationStatus === 'failed') return 'failed';
  return 'idle';
}

export function useStoryboardGenerationFlow({
  draftId,
}: UseStoryboardGenerationFlowArgs) {
  const { state } = usePipelineState(draftId);

  const scenePhaseStatus: PhaseStatus = state?.phases?.scene?.status ?? 'idle';
  const sceneImagePhaseStatus: PhaseStatus = state?.phases?.scene_image?.status ?? 'idle';

  const planStatus = mapPhaseToPlantStatus(scenePhaseStatus);
  const illustrationStatus = mapPhaseToIllustrationStatus(sceneImagePhaseStatus);
  const illustrationPhase = deriveIllustrationPhase(illustrationStatus);

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
