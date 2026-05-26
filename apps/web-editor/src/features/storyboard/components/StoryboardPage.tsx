import '@xyflow/react/dist/style.css';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { Edge as FlowEdge, Node, NodeMouseHandler } from '@xyflow/react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAddBlock } from '@/features/storyboard/hooks/useAddBlock';
import { useAddMusicBlock } from '@/features/storyboard/hooks/useAddMusicBlock';
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
import { getSceneNodesInStoryOrder, useStoryboardMusic } from '@/features/storyboard/hooks/useStoryboardMusic';
import { useStoryboardMusicDecorations } from '@/features/storyboard/hooks/useStoryboardMusicDecorations';
import { useStoryboardPageCanvasHandlers } from '@/features/storyboard/hooks/useStoryboardPageCanvasHandlers';
import { useStoryboardGenerationFlow } from '@/features/storyboard/hooks/useStoryboardGenerationFlow';
import { useStep3Generation } from '@/features/storyboard/hooks/useStep3Generation';
import { storyboardHistoryStore, initHistoryStore, destroyHistoryStore } from '@/features/storyboard/store/storyboard-history-store';
import { setSelectedBlock, useStoryboardStore } from '@/features/storyboard/store/storyboard-store';
import type { StoryboardSidebarTab, SceneBlockNodeData } from '@/features/storyboard/types';
import { hasUnresolvedStep3Music } from '@/features/storyboard/utils/storyboardMusicStep3Gate';
import { MusicBlockModal } from './MusicBlockModal';
import { SceneModal } from './SceneModal';
import { PrincipalImageApprovalModal } from './PrincipalImageApprovalModal';
import { StoryboardPageFooter } from './StoryboardPageFooter';
import { StoryboardPageWorkspace } from './StoryboardPageWorkspace';
import { StoryboardTopBar } from './StoryboardPage.topBar';
import { STORYBOARD_NODE_TYPES } from './storyboardNodeTypes';
import { storyboardPageStyles as s } from './storyboardPageStyles';

export function StoryboardPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { draftId } = useParams<{ draftId: string }>();
  const autoStartedPlanDraftRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<StoryboardSidebarTab>('storyboard');
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const safeDraftId = draftId ?? '';
  const { openStep3Modal, step3Modal } = useStep3Generation(safeDraftId);
  const { nodes, edges, isLoading, error, setNodes, setEdges, removeNode, reload } =
    useStoryboardCanvas(safeDraftId);
  const reloadStoryboard = useCallback(async (): Promise<void> => {
    await reload?.();
  }, [reload]);

  const { selectedBlockId } = useStoryboardStore();
  const generationFlow = useStoryboardGenerationFlow({
    draftId: safeDraftId,
    nodes,
    isLoading,
    error,
    autoStartedPlanDraftRef,
    setNodes,
    setEdges,
    removeNode,
    reloadStoryboard,
  });
  const {
    planGeneration,
    illustrationGeneration,
    isPlanBlocking,
    isGenerationBlocking,
    isStep3Disabled,
    principalImageModal,
  } = generationFlow;

  useEffect(() => {
    initHistoryStore(safeDraftId);
    return () => { destroyHistoryStore(); };
  }, [safeDraftId]);

  const { saveLabel, saveNow } = useStoryboardAutosave(safeDraftId, nodes, edges);
  const [editingMusicBlockId, setEditingMusicBlockId] = useState<string | null>(null);
  const orderedScenes = useMemo(() => getSceneNodesInStoryOrder(nodes, edges), [nodes, edges]);
  const {
    musicBlocks,
    activeMusicBlockId,
    setActiveMusicBlockId,
    isGeneratingMusicBlockId,
    musicError,
    commitMusicBlock,
    generateMusicBlock,
  } = useStoryboardMusic({ draftId: safeDraftId, nodes, setNodes, saveNow });
  const editingMusicBlock = musicBlocks.find((block) => block.id === editingMusicBlockId) ?? null;

  const { editingBlock, openModal, handleSave, handleDelete, handleClose } = useSceneModal(setNodes, saveNow);

  useEffect(() => {
    if (isGenerationBlocking && editingBlock !== null) handleClose();
  }, [editingBlock, handleClose, isGenerationBlocking]);

  const handleNodeClick: NodeMouseHandler<Node> = useCallback(
    (_event, node) => {
      if (isGenerationBlocking) return;
      if (node.type === 'music-block') {
        setSelectedBlock(null);
        setActiveMusicBlockId(node.id);
        setEditingMusicBlockId(node.id);
        return;
      }
      if (node.type !== 'scene-block') return;
      const blockData = node.data as SceneBlockNodeData;
      setSelectedBlock(node.id);
      setActiveMusicBlockId(null);
      openModal(blockData.block);
    },
    [isGenerationBlocking, openModal, setActiveMusicBlockId],
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
    nodes, edges, setNodes, draftId: safeDraftId, onRemoveNode: removeNode,
    saveNow, onAfterAdd: handlePersistAddHistory,
  });
  const { handleAddBlock: handleManualAddBlock } = useHandleAddBlock({ addBlock });
  const handleAddBlock = useCallback((): void => {
    if (isGenerationBlocking) return;
    handleManualAddBlock();
  }, [handleManualAddBlock, isGenerationBlocking]);
  const { addMusicBlock, canAddMusicBlock } = useAddMusicBlock({
    draftId: safeDraftId, nodes, edges, orderedScenes, setNodes, saveNow,
    onAfterAdd: handlePersistAddHistory,
  });
  const handleAddMusicBlock = useCallback((): void => {
    if (isGenerationBlocking) return;
    const musicBlock = addMusicBlock();
    if (!musicBlock) return;
    setSelectedBlock(null);
    setActiveMusicBlockId(musicBlock.id);
    setEditingMusicBlockId(musicBlock.id);
  }, [addMusicBlock, isGenerationBlocking, setActiveMusicBlockId]);
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
    onApplyHistorySnapshot: ({ nodes: restoredNodes, edges: restoredEdges, musicBlocks }) => {
      handleRestore(restoredNodes, restoredEdges, {
        skipSnapshot: true,
        deferSave: true,
        musicBlocks,
      });
    },
  });

  const { dragState, syncRefs, handleNodeDragStart, handleNodeDrag, handleNodeDragStop } =
    useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow });

  useEffect(() => {
    syncRefs(nodes, edges);
  }, [nodes, edges, syncRefs]);

  useStoryboardMusicDecorations({
    activeMusicBlockId, editingMusicBlockId, musicBlocks, orderedScenes,
    setActiveMusicBlockId, setEditingMusicBlockId, setNodes,
  });

  const { isKnifeActive, cutEdge } = useStoryboardKnifeTool({ nodes, setEdges, pushSnapshot, saveNow });
  const { handleConnect, handleEdgesChange, handleNodesChange, isValidConnection } =
    useStoryboardPageCanvasHandlers({
      edges,
      isGenerationBlocking,
      nodes,
      pushSnapshot,
      saveNow,
      setEdges,
      setNodes,
    });

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

  const handleBack = (): void => { navigate(draftId ? `/generate?draftId=${draftId}` : '/generate'); };
  const isMusicBlockingStep3 = hasUnresolvedStep3Music(musicBlocks);

  const handleNext = (): void => {
    if (isMusicBlockingStep3) return;
    if (isStep3Disabled) return;
    openStep3Modal();
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
        nodeTypes={STORYBOARD_NODE_TYPES} onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
        onConnect={handleConnect} isValidConnection={isValidConnection}
        onNodeDragStart={handleNodeDragStart} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop}
        dragState={dragState} onAddBlock={handleAddBlock} onAddMusicBlock={handleAddMusicBlock}
        canAddMusicBlock={canAddMusicBlock} onNodeClick={handleNodeClick}
        isKnifeActive={isKnifeActive} onCutEdge={cutEdge} isHistoryOpen={isHistoryOpen}
        onCloseHistory={() => setIsHistoryOpen(false)} onRestore={handleRestore}
        planGeneration={planGeneration} illustrationGeneration={illustrationGeneration}
        isPlanBlocking={isPlanBlocking}
      />

      <StoryboardPageFooter isNextDisabled={isStep3Disabled || isMusicBlockingStep3} onBack={handleBack} onNext={handleNext} />

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

      {editingMusicBlock !== null && (
        <MusicBlockModal
          draftId={safeDraftId} block={editingMusicBlock} orderedScenes={orderedScenes}
          isGenerating={isGeneratingMusicBlockId === editingMusicBlock.id}
          error={musicError} onChange={commitMusicBlock} onGenerate={generateMusicBlock}
          onClose={() => {
            setEditingMusicBlockId(null);
            setActiveMusicBlockId(null);
          }}
        />
      )}

      {principalImageModal.shouldRender && illustrationGeneration.reference && (
        <PrincipalImageApprovalModal
          draftId={safeDraftId}
          reference={illustrationGeneration.reference}
          isBusy={principalImageModal.isBusy}
          error={principalImageModal.error}
          onApprove={principalImageModal.onApprove}
          onEdit={principalImageModal.onEdit}
          onReplace={principalImageModal.onReplace}
          onSetReferences={principalImageModal.onSetReferences}
        />
      )}

      {step3Modal}
    </div>
  );
}
