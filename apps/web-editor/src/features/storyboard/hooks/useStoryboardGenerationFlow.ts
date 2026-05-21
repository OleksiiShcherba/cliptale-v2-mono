import { useCallback, useEffect, useState } from 'react';
import type React from 'react';

import type { Edge as FlowEdge, Node } from '@xyflow/react';

import {
  approveStoryboardPrincipalImage,
  editStoryboardPrincipalImage,
  replaceStoryboardPrincipalImage,
  setStoryboardPrincipalImageReferences,
} from '@/features/storyboard/api';
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
  const [isPrincipalImageModalOpen, setIsPrincipalImageModalOpen] = useState(false);
  const [principalImageActionError, setPrincipalImageActionError] = useState<string | null>(null);
  const [isPrincipalImageActionBusy, setIsPrincipalImageActionBusy] = useState(false);
  const [approvalContinuationFailed, setApprovalContinuationFailed] = useState(false);

  const planGeneration = useStoryboardPlanGeneration(draftId, { onRemoveNode: removeNode });
  const illustrationGeneration = useStoryboardIllustrations(draftId, { onStoryboardUpdated: reloadStoryboard });
  const isPlanBlocking = (
    planGeneration.status === 'queued'
    || planGeneration.status === 'running'
    || planGeneration.status === 'applying'
  );
  const isGenerationBlocking = isPlanBlocking || illustrationGeneration.isBlocking;
  const isAwaitingPrincipalApproval = illustrationGeneration.reference?.status === 'ready' &&
    illustrationGeneration.reference.approvalStatus !== 'approved';
  const isPrincipalImageRegeneratingInModal = isPrincipalImageModalOpen &&
    illustrationGeneration.reference !== null &&
    (illustrationGeneration.reference.status === 'queued' || illustrationGeneration.reference.status === 'running');
  const shouldShowPrincipalImageModal = isAwaitingPrincipalApproval || isPrincipalImageRegeneratingInModal;
  const shouldKeepPrincipalImageModalForError = approvalContinuationFailed &&
    illustrationGeneration.reference !== null;
  const isStep3Disabled = isGenerationBlocking ||
    isAwaitingPrincipalApproval ||
    approvalContinuationFailed ||
    illustrationGeneration.status !== 'completed';

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
    if (isAwaitingPrincipalApproval) {
      setIsPrincipalImageModalOpen(true);
    } else if (illustrationGeneration.reference?.approvalStatus === 'approved' && !approvalContinuationFailed) {
      setIsPrincipalImageModalOpen(false);
    }
  }, [approvalContinuationFailed, illustrationGeneration.reference?.approvalStatus, isAwaitingPrincipalApproval]);

  useEffect(() => {
    if (illustrationGeneration.isBlocking || illustrationGeneration.status === 'completed') {
      setApprovalContinuationFailed(false);
    }
  }, [illustrationGeneration.isBlocking, illustrationGeneration.status]);

  const runPrincipalImageAction = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setPrincipalImageActionError(null);
    setIsPrincipalImageActionBusy(true);
    try {
      await action();
      await illustrationGeneration.refresh();
    } catch (err) {
      setPrincipalImageActionError(err instanceof Error ? err.message : 'Principal image action failed');
      throw err;
    } finally {
      setIsPrincipalImageActionBusy(false);
    }
  }, [illustrationGeneration]);

  const handleApprovePrincipalImage = useCallback(async (): Promise<void> => {
    await runPrincipalImageAction(async () => {
      await approveStoryboardPrincipalImage(draftId);
      setApprovalContinuationFailed(false);
      await illustrationGeneration.start();
      const items = await illustrationGeneration.refresh();
      const hasStartedOrReadyScenes = items.some((item) => item.jobId !== null || item.status === 'ready');
      if (!hasStartedOrReadyScenes) {
        setApprovalContinuationFailed(true);
        throw new Error('Could not start illustration generation.');
      }
    });
  }, [draftId, illustrationGeneration, runPrincipalImageAction]);

  const handleEditPrincipalImage = useCallback(async (
    prompt: string,
    extraReferenceFileIds: string[],
  ): Promise<void> => {
    await runPrincipalImageAction(async () => {
      await editStoryboardPrincipalImage(draftId, { prompt, extraReferenceFileIds });
    });
  }, [draftId, runPrincipalImageAction]);

  const handleReplacePrincipalImage = useCallback(async (fileId: string): Promise<void> => {
    await runPrincipalImageAction(async () => {
      await replaceStoryboardPrincipalImage(draftId, fileId);
    });
  }, [draftId, runPrincipalImageAction]);

  const handleSetPrincipalImageReferences = useCallback(async (fileIds: string[]): Promise<void> => {
    await runPrincipalImageAction(async () => {
      await setStoryboardPrincipalImageReferences(draftId, fileIds);
    });
  }, [draftId, runPrincipalImageAction]);

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
  }, [illustrationGeneration.byBlockId, illustrationGeneration.retryBlock, setNodes]);

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
    principalImageModal: {
      shouldRender: shouldShowPrincipalImageModal || shouldKeepPrincipalImageModalForError,
      isBusy: isPrincipalImageActionBusy || illustrationGeneration.isBlocking,
      error: principalImageActionError,
      onApprove: handleApprovePrincipalImage,
      onEdit: handleEditPrincipalImage,
      onReplace: handleReplacePrincipalImage,
      onSetReferences: handleSetPrincipalImageReferences,
    },
  };
}
