import { useEffect } from 'react';
import type React from 'react';

import type { Edge as FlowEdge, Node } from '@xyflow/react';

import type { SceneBlockNodeData } from '@/features/storyboard/types';

import { useStoryboardIllustrations } from './useStoryboardIllustrations';
import { useStoryboardPlanGeneration } from './useStoryboardPlanGeneration';

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

export function useStoryboardGenerationFlow({
  draftId,
  nodes,
  isLoading,
  error,
  autoStartedPlanDraftRef,
  setNodes,
  setEdges,
  removeNode,
  reloadStoryboard,
}: UseStoryboardGenerationFlowArgs) {
  const planGeneration = useStoryboardPlanGeneration(draftId, { onRemoveNode: removeNode });
  const illustrationGeneration = useStoryboardIllustrations(draftId, { onStoryboardUpdated: reloadStoryboard });
  const isPlanBlocking = (
    planGeneration.status === 'queued'
    || planGeneration.status === 'running'
    || planGeneration.status === 'applying'
  );
  const isGenerationBlocking = isPlanBlocking || illustrationGeneration.isBlocking;
  const isStep3Disabled = isGenerationBlocking;

  useEffect(() => {
    if (!planGeneration.canvasState || planGeneration.status !== 'completed') return;
    setNodes(planGeneration.canvasState.nodes);
    setEdges(planGeneration.canvasState.edges);
  }, [planGeneration.canvasState, planGeneration.status, setEdges, setNodes]);

  useEffect(() => {
    if (planGeneration.status !== 'completed') return;
    void illustrationGeneration.start();
  }, [illustrationGeneration.start, planGeneration.status]);

  useEffect(() => {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (node.type !== 'scene-block') return node;
        const data = node.data as SceneBlockNodeData;
        const illustration = illustrationGeneration.byBlockId.get(node.id);
        if (
          data.illustration === illustration
          && data.onRetryIllustration === illustrationGeneration.retryBlock
        ) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: { ...data, illustration, onRetryIllustration: illustrationGeneration.retryBlock },
        };
      });
      return changed ? next : prev;
    });
  }, [illustrationGeneration.byBlockId, illustrationGeneration.retryBlock, nodes, setNodes]);

  useEffect(() => {
    if (!draftId || isLoading || error) return;
    if (planGeneration.status !== 'idle') return;
    if (autoStartedPlanDraftRef.current === draftId) return;
    if (nodes.length !== 2) return;

    const nodeTypes = new Set(nodes.map((node) => node.type));
    if (!nodeTypes.has('start') || !nodeTypes.has('end')) return;

    autoStartedPlanDraftRef.current = draftId;
    void planGeneration.start();
  }, [autoStartedPlanDraftRef, draftId, error, isLoading, nodes, planGeneration]);

  return {
    planGeneration,
    illustrationGeneration,
    isPlanBlocking,
    isGenerationBlocking,
    isStep3Disabled,
  };
}
