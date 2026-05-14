import '@xyflow/react/dist/style.css';

import React, { useState, useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type {
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
  NodeChange,
  EdgeChange,
  Connection,
  Edge as FlowEdge,
  Node,
  NodeMouseHandler,
} from '@xyflow/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useAddBlock } from '@/features/storyboard/hooks/useAddBlock';
import { useHandleAddFromLibrary } from '@/features/storyboard/hooks/useHandleAddFromLibrary';
import { useStoryboardCanvas } from '@/features/storyboard/hooks/useStoryboardCanvas';
import { useHandleAddBlock } from '@/features/storyboard/hooks/useHandleAddBlock';
import { useHandleRestore } from '@/features/storyboard/hooks/useHandleRestore';
import { useSceneModal } from '@/features/storyboard/hooks/useSceneModal';
import { useStoryboardHistorySeed } from '@/features/storyboard/hooks/useStoryboardHistorySeed';
import { useStoryboardAutosave } from '@/features/storyboard/hooks/useStoryboardAutosave';
import { useStoryboardDrag } from '@/features/storyboard/hooks/useStoryboardDrag';
import { useStoryboardHistoryPush } from '@/features/storyboard/hooks/useStoryboardHistoryPush';
import { useStoryboardKeyboard } from '@/features/storyboard/hooks/useStoryboardKeyboard';
import { useStoryboardKnifeTool } from '@/features/storyboard/hooks/useStoryboardKnifeTool';
import { useStoryboardIllustrations } from '@/features/storyboard/hooks/useStoryboardIllustrations';
import { useStoryboardPlanGeneration } from '@/features/storyboard/hooks/useStoryboardPlanGeneration';
import {
  storyboardHistoryStore,
  initHistoryStore,
  destroyHistoryStore,
} from '@/features/storyboard/store/storyboard-history-store';
import { setSelectedBlock, useStoryboardStore } from '@/features/storyboard/store/storyboard-store';
import type { StoryboardSidebarTab, SceneBlockNodeData } from '@/features/storyboard/types';
import { EndNode } from './EndNode';
import { SceneBlockNode } from './SceneBlockNode';
import { SceneModal } from './SceneModal';
import { StartNode } from './StartNode';
import { StoryboardPageFooter } from './StoryboardPageFooter';
import { StoryboardPageWorkspace } from './StoryboardPageWorkspace';
import { StoryboardTopBar } from './StoryboardPage.topBar';
import { storyboardPageStyles as s, BORDER } from './storyboardPageStyles';

const NODE_TYPES: NodeTypes = {
  start: StartNode,
  end: EndNode,
  'scene-block': SceneBlockNode,
};

export function StoryboardPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { draftId } = useParams<{ draftId: string }>();
  const autoStartPlanRef = useRef(false);

  const [activeTab, setActiveTab] = useState<StoryboardSidebarTab>('storyboard');
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const safeDraftId = draftId ?? '';
  const { nodes, edges, isLoading, error, setNodes, setEdges, removeNode, reload } =
    useStoryboardCanvas(safeDraftId);
  const reloadStoryboard = useCallback(async (): Promise<void> => {
    await reload?.();
  }, [reload]);

  const { selectedBlockId } = useStoryboardStore();
  const planGeneration = useStoryboardPlanGeneration(safeDraftId, { onRemoveNode: removeNode });
  const isPlanBlocking = (
    planGeneration.status === 'queued'
    || planGeneration.status === 'running'
    || planGeneration.status === 'applying'
  );
  const illustrationGeneration = useStoryboardIllustrations(safeDraftId, {
    onStoryboardUpdated: reloadStoryboard,
  });
  const isGenerationBlocking = isPlanBlocking || illustrationGeneration.isBlocking;

  useEffect(() => {
    initHistoryStore(safeDraftId);
    return () => {
      destroyHistoryStore();
    };
  }, [safeDraftId]);

  const { saveLabel, saveNow } = useStoryboardAutosave(safeDraftId, nodes, edges);

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
          data: {
            ...data,
            illustration,
            onRetryIllustration: illustrationGeneration.retryBlock,
          } satisfies SceneBlockNodeData,
        };
      });
      return changed ? next : prev;
    });
  }, [illustrationGeneration.byBlockId, illustrationGeneration.retryBlock, nodes, setNodes]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldAutoStart = (
      searchParams.get('generateScenes') === '1'
      || searchParams.get('startStoryboardPlan') === '1'
      || (location.state as { startStoryboardPlan?: boolean } | null)?.startStoryboardPlan === true
    );

    if (!shouldAutoStart || autoStartPlanRef.current) return;
    autoStartPlanRef.current = true;
    void planGeneration.start();
  }, [location.search, location.state, planGeneration]);

  const { editingBlock, openModal, handleSave, handleDelete, handleClose } = useSceneModal(setNodes, saveNow);

  useEffect(() => {
    if (isGenerationBlocking && editingBlock !== null) handleClose();
  }, [editingBlock, handleClose, isGenerationBlocking]);

  const handleNodeClick: NodeMouseHandler<Node> = useCallback(
    (_event, node) => {
      if (isGenerationBlocking) return;
      if (node.type !== 'scene-block') return;
      const blockData = node.data as SceneBlockNodeData;
      setSelectedBlock(node.id);
      openModal(blockData.block);
    },
    [isGenerationBlocking, openModal],
  );

  const { pushSnapshot } = useStoryboardHistoryPush(safeDraftId);
  const handlePersistAddHistory = useCallback(
    async (nextNodes: Node[], nextEdges: FlowEdge[]): Promise<void> => {
      try {
        await pushSnapshot(nextNodes, nextEdges, { persistImmediately: true });
        await queryClient.invalidateQueries({ queryKey: ['storyboard-history', safeDraftId] });
      } catch (err: unknown) {
        console.error('[StoryboardPage] Failed to persist add-block history:', err);
      }
    },
    [pushSnapshot, queryClient, safeDraftId],
  );
  const { addBlock } = useAddBlock({
    nodes,
    edges,
    setNodes,
    draftId: safeDraftId,
    onRemoveNode: removeNode,
    saveNow,
    onAfterAdd: handlePersistAddHistory,
  });
  const { handleAddBlock: handleManualAddBlock } = useHandleAddBlock({ addBlock });
  const handleAddBlock = useCallback((): void => {
    if (isGenerationBlocking) return;
    handleManualAddBlock();
  }, [handleManualAddBlock, isGenerationBlocking]);
  const { handleRestore } = useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow });
  useStoryboardHistorySeed({
    draftId: safeDraftId,
    currentNodes: nodes,
    canvasIsLoading: isLoading,
    handleRestore,
  });

  useStoryboardKeyboard({
    nodes,
    onRemoveNode: removeNode,
    historyStore: storyboardHistoryStore,
    enabled: !isGenerationBlocking,
    onApplyHistorySnapshot: ({ nodes: restoredNodes, edges: restoredEdges }) => {
      handleRestore(restoredNodes, restoredEdges, { skipSnapshot: true, deferSave: true });
    },
  });

  const { dragState, syncRefs, handleNodeDragStart, handleNodeDrag, handleNodeDragStop } =
    useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow });

  useEffect(() => {
    syncRefs(nodes, edges);
  }, [nodes, edges, syncRefs]);

  const { isKnifeActive, cutEdge } = useStoryboardKnifeTool({ nodes, setEdges, pushSnapshot, saveNow });

  const isValidConnection = useCallback(
    (connection: FlowEdge | Connection): boolean => {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      if (edges.some((e) => e.target === target)) return false;
      if (edges.some((e) => e.source === source)) return false;
      return true;
    },
    [edges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isGenerationBlocking) return;
      setEdges((prev) => {
        const next = addEdge(
          {
            ...connection,
            id: crypto.randomUUID(),
            sourceHandle: connection.sourceHandle ?? 'exit',
            targetHandle: connection.targetHandle ?? 'income',
            style: { stroke: BORDER, strokeWidth: 2 },
          },
          prev,
        );
        void pushSnapshot(nodes, next);
        return next;
      });
      setTimeout(() => void saveNow(), 0);
    },
    [isGenerationBlocking, setEdges, nodes, pushSnapshot, saveNow],
  );

  const handleAddFromLibraryInternal = useHandleAddFromLibrary({
    draftId: safeDraftId,
    nodes,
    edges,
    setNodes,
    removeNode,
    saveNow,
    onAfterAdd: handlePersistAddHistory,
  });
  const handleAddFromLibrary = useCallback(
    async (templateId: string): Promise<void> => {
      if (isGenerationBlocking) return;
      await handleAddFromLibraryInternal(templateId);
    },
    [handleAddFromLibraryInternal, isGenerationBlocking],
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isGenerationBlocking) return;
      const nonPositionChanges = changes.filter((c) => c.type !== 'position');
      setNodes((prev) => applyNodeChanges(nonPositionChanges, prev));
    },
    [isGenerationBlocking, setNodes],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isGenerationBlocking) return;
      const hasStructuralChange = changes.some((c) => c.type === 'add' || c.type === 'remove');
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev);
        if (hasStructuralChange) void pushSnapshot(nodes, next);
        return next;
      });
      if (hasStructuralChange) setTimeout(() => void saveNow(), 0);
    },
    [isGenerationBlocking, setEdges, nodes, pushSnapshot, saveNow],
  );

  const handleBack = (): void => { navigate(draftId ? `/generate?draftId=${draftId}` : '/generate'); };
  const handleNext = (): void => {
    if (isGenerationBlocking) return;
    navigate('/generate/road-map');
  };

  return (
    <div style={s.page} data-testid="storyboard-page">
      <StoryboardTopBar
        saveLabel={saveLabel}
        isHistoryOpen={isHistoryOpen}
        onHistoryToggle={() => setIsHistoryOpen((v) => !v)}
        onNavigateHome={() => { navigate('/'); }}
      />

      <StoryboardPageWorkspace
        activeTab={activeTab} setActiveTab={setActiveTab} draftId={safeDraftId}
        selectedBlockId={selectedBlockId} onAddTemplate={handleAddFromLibrary}
        isLoading={isLoading} error={error} nodes={nodes} edges={edges}
        nodeTypes={NODE_TYPES} onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
        onConnect={handleConnect} isValidConnection={isValidConnection}
        onNodeDragStart={handleNodeDragStart} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop}
        dragState={dragState} onAddBlock={handleAddBlock} onNodeClick={handleNodeClick}
        isKnifeActive={isKnifeActive} onCutEdge={cutEdge} isHistoryOpen={isHistoryOpen}
        onCloseHistory={() => setIsHistoryOpen(false)} onRestore={handleRestore}
        planGeneration={planGeneration} illustrationGeneration={illustrationGeneration}
        isPlanBlocking={isPlanBlocking}
      />

      <StoryboardPageFooter isNextDisabled={isGenerationBlocking} onBack={handleBack} onNext={handleNext} />

      {editingBlock !== null && (
        <SceneModal
          mode="block"
          block={editingBlock}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={handleClose}
          uploadDraftId={safeDraftId}
        />
      )}
    </div>
  );
}
