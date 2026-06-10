import '@xyflow/react/dist/style.css';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Edge as FlowEdge, Node, NodeMouseHandler } from '@xyflow/react';
import { useNavigate, useParams } from 'react-router-dom';

import { fetchDraft } from '@/features/generate-wizard/api';
import { startCastExtraction, getLatestCastExtraction, confirmCast, startStoryboardIllustrations, retryReferenceBlockGeneration } from '@/features/storyboard/api';
import { useAddBlock } from '@/features/storyboard/hooks/useAddBlock';
import { useAddMusicBlock } from '@/features/storyboard/hooks/useAddMusicBlock';
import { useHandleAddFromLibrary } from '@/features/storyboard/hooks/useHandleAddFromLibrary';
import { useStoryboardCanvas } from '@/features/storyboard/hooks/useStoryboardCanvas';
import { useHandleAddBlock } from '@/features/storyboard/hooks/useHandleAddBlock';
import { useHandleRestore } from '@/features/storyboard/hooks/useHandleRestore';
import { useSceneModal } from '@/features/storyboard/hooks/useSceneModal';
import { useStoryboardHistorySeed } from '@/features/storyboard/hooks/useStoryboardHistorySeed';
import { useStoryboardAutosave } from '@/features/storyboard/hooks/useStoryboardAutosave';
import {
  comparableBlocks,
  comparableEdges,
  musicBlocksForSave,
  stateKey,
} from '@/features/storyboard/hooks/useStoryboardAutosavePayload';
import { useCheckpointScheduler } from '@/features/storyboard/hooks/useCheckpointScheduler';
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
import type { StoryboardSidebarTab, SceneBlockNodeData, ReferenceBlockNodeData } from '@/features/storyboard/types';
import { hasUnresolvedStep3Music } from '@/features/storyboard/utils/storyboardMusicStep3Gate';
import { CheckpointCaptureOverlay } from './CheckpointCaptureOverlay';
import { CheckpointCountdownBar } from './CheckpointCountdownBar';
import { MusicBlockModal } from './MusicBlockModal';
import { SceneModal } from './SceneModal';
import { CastConfirmModal } from './CastConfirmModal';
import type { CastExtractionJob, CastProposalEntry } from './CastConfirmModal';
import { StoryboardBulkStreamUrlProvider } from './SceneBlockNode.mediaThumbnail';
import { useStoryboardPageBulkStreamUrls } from './StoryboardPage.bulkStreamUrls';
import { ReferenceGateMessage, UnlinkedScenesMessage } from './ReferenceGateMessage';
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
  // Draft owner id for the status-menu owner gate (AC-09). Cached by React Query.
  const { data: draftMeta } = useQuery({
    queryKey: ['generation-draft', safeDraftId],
    queryFn: () => fetchDraft(safeDraftId),
    enabled: safeDraftId !== '',
    staleTime: 5 * 60 * 1000,
  });
  const draftOwnerId = draftMeta?.userId ?? null;
  const { openStep3Modal, step3Modal } = useStep3Generation(safeDraftId);

  // Stable ref-forwarding callbacks for reference block node interactions.
  // Defined before useStoryboardCanvas so they can be passed as stable options.
  const nodesRef = useRef<Node[]>([]);
  const handleOpenReferenceFlow = useCallback((blockId: string): void => {
    const node = nodesRef.current.find((n) => n.id === blockId);
    const flowId = (node?.data as ReferenceBlockNodeData | undefined)?.referenceBlock?.flowId ?? null;
    if (flowId) {
      navigate(`/generate-ai/${flowId}`, { state: { fromDraft: safeDraftId, fromBlockId: blockId } });
    }
  }, [navigate, safeDraftId]);

  const handleRetryReferenceBlock = useCallback((_blockId: string): void => {
    // Retry is handled via the dedicated retry API (T15 / AC-04).
    // No-op at page level for now — the node button calls retryReferenceBlockGeneration directly.
  }, []);

  const { nodes, edges, isLoading, error, setNodes, setEdges, removeNode, reload } =
    useStoryboardCanvas(safeDraftId, {
      onOpenReferenceFlow: handleOpenReferenceFlow,
      onRetryReferenceBlock: handleRetryReferenceBlock,
    });
  // Keep nodesRef in sync so handleOpenReferenceFlow always sees the latest nodes.
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const reloadStoryboard = useCallback(async (): Promise<void> => {
    await reload?.();
  }, [reload]);

  // ── Cast extraction state (AC-01, AC-01b, AC-03) ──────────────────────────
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [castExtraction, setCastExtraction] = useState<CastExtractionJob | null>(null);
  const [hasExistingReferenceBlocks, setHasExistingReferenceBlocks] = useState(false);

  const handleStartCastExtraction = useCallback(async (): Promise<void> => {
    setCastModalOpen(true);
    try {
      // First check if there is an existing completed/running extraction to resume.
      const existing = await getLatestCastExtraction(safeDraftId);
      if (existing) {
        // Resume: show existing proposal (completed) or progress (queued/running).
        setCastExtraction(existing);
        return;
      }
      // No existing extraction — start a new one.
      const accepted = await startCastExtraction(safeDraftId);
      setCastExtraction({
        jobId: accepted.jobId,
        draftId: safeDraftId,
        status: accepted.status,
        proposal: null,
        aggregateEstimateCredits: null,
        errorMessage: null,
      });
    } catch (err) {
      console.error('[StoryboardPage] startCastExtraction failed:', err);
    }
  }, [safeDraftId]);

  // Poll for extraction completion while the modal is open and extraction is running.
  useEffect(() => {
    if (!castModalOpen || !castExtraction) return;
    if (castExtraction.status !== 'queued' && castExtraction.status !== 'running') return;

    const interval = setInterval(() => {
      void getLatestCastExtraction(safeDraftId).then((job) => {
        if (job) setCastExtraction(job);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [castModalOpen, castExtraction, safeDraftId]);

  const handleConfirmCast = useCallback(
    async (entries: CastProposalEntry[], acknowledgedAggregateCredits: number): Promise<void> => {
      await confirmCast(safeDraftId, entries, acknowledgedAggregateCredits);
      setHasExistingReferenceBlocks(true);
      setCastModalOpen(false);
      await reloadStoryboard();
    },
    [safeDraftId, reloadStoryboard],
  );
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
  } = generationFlow;
  const {
    fileIds: bulkStreamFileIds,
    urls: storyboardImageStreamUrls,
    error: storyboardImageStreamUrlError,
    missingFileIds: missingStoryboardImageStreamFileIds,
  } = useStoryboardPageBulkStreamUrls(nodes, illustrationGeneration);
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
  const { pushSnapshot, pushCheckpoint, inFlight } = useStoryboardHistoryPush(safeDraftId);

  // ── Two-tier saving (storyboard-autosave-checkpoints) ─────────────────────────
  // changeCounter feeds the checkpoint scheduler: it increments on every canvas
  // change AFTER hydration. Programmatic seed restores are suppressed — they
  // recover the latest checkpoint state, not a user change (AC-05).
  const [changeCounter, setChangeCounter] = useState(0);
  // Semantic content key (same comparable payload the autosave dedupes on) —
  // node-identity churn from decoration effects must NOT count as a change.
  const prevCanvasKeyRef = useRef<string | null>(null);
  const suppressChangeCountRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    const key = stateKey(
      comparableBlocks(nodes, safeDraftId),
      comparableEdges(edges, safeDraftId),
      musicBlocksForSave(nodes),
    );
    const prev = prevCanvasKeyRef.current;
    prevCanvasKeyRef.current = key;
    if (prev === null || prev === key) return; // hydration / no-op identity churn
    if (suppressChangeCountRef.current) {
      suppressChangeCountRef.current = false;
      return;
    }
    setChangeCounter((c) => c + 1);
  }, [nodes, edges, isLoading, safeDraftId]);

  // Drag/typing signal for the AC-03b deferral: node drags + open inspectors.
  const [isDraggingNode, setIsDraggingNode] = useState(false);

  // After an add/knife/connect mutation: in-memory undo entry only (AC-02 —
  // the per-change path never creates a server History entry).
  const handlePersistAddHistory = useCallback(
    async (nextNodes: Node[], nextEdges: FlowEdge[]): Promise<void> => {
      try {
        await pushSnapshot(nextNodes, nextEdges);
      } catch (err: unknown) {
        console.error('[StoryboardPage] Failed to push add-block undo entry:', err);
      }
    },
    [pushSnapshot],
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
  // Scheduler (ADR-0002): owns the checkpoint cadence; the push client (T9)
  // owns capture + POST + the in-flight guard.
  const schedulerPushCheckpoint = useCallback(
    (): Promise<boolean> => pushCheckpoint(nodes, edges),
    [pushCheckpoint, nodes, edges],
  );
  const isInteracting =
    isDraggingNode || editingBlock !== null || editingMusicBlock !== null;
  const checkpointScheduler = useCheckpointScheduler({
    changeCounter,
    isInteracting,
    inFlight,
    pushCheckpoint: schedulerPushCheckpoint,
  });

  const { handleRestore } = useHandleRestore({
    setNodes,
    setEdges,
    pushSnapshot,
    removeNode,
    saveNow,
    // AC-12: a manual restore with newer changes checkpoints the current state first.
    pushPreRestoreCheckpoint: pushCheckpoint,
    hasChangesSinceLastCheckpoint: () => !checkpointScheduler.idle,
    getCurrentCanvas: () => ({ nodes, edges }),
  });
  const handleSeedRestore = useCallback(
    (
      restoredNodes: Node[],
      restoredEdges: FlowEdge[],
      options?: { skipSave?: boolean; skipSnapshot?: boolean },
    ): void => {
      // The seed recovers the latest checkpoint state — not a user change.
      suppressChangeCountRef.current = true;
      void handleRestore(restoredNodes, restoredEdges, options);
    },
    [handleRestore],
  );
  useStoryboardHistorySeed({
    draftId: safeDraftId,
    currentNodes: nodes,
    canvasIsLoading: isLoading,
    handleRestore: handleSeedRestore,
  });
  useStoryboardKeyboard({
    nodes,
    onRemoveNode: removeNode,
    historyStore: storyboardHistoryStore,
    enabled: !isGenerationBlocking,
    onApplyHistorySnapshot: ({ nodes: restoredNodes, edges: restoredEdges, musicBlocks }) => {
      void handleRestore(restoredNodes, restoredEdges, {
        skipSnapshot: true,
        deferSave: true,
        musicBlocks,
      });
    },
  });

  const { syncRefs, handleNodeDragStart, handleNodeDrag, handleNodeDragStop } =
    useStoryboardDrag({ setNodes, setEdges, pushSnapshot, saveNow });
  // Wrap drag start/stop to feed the AC-03b interaction signal.
  const handleNodeDragStartWithSignal: typeof handleNodeDragStart = useCallback(
    (...args) => {
      setIsDraggingNode(true);
      handleNodeDragStart(...args);
    },
    [handleNodeDragStart],
  );
  const handleNodeDragStopWithSignal: typeof handleNodeDragStop = useCallback(
    (...args) => {
      setIsDraggingNode(false);
      handleNodeDragStop(...args);
    },
    [handleNodeDragStop],
  );
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

  // AC-08 / AC-09: star gate alert shown when POST /illustrations returns 422.
  const [illustrationGateError, setIllustrationGateError] = useState<string | null>(null);

  // When reference blocks are present and illustrations haven't started, allow clicking
  // "Next" to trigger the star gate check via POST /illustrations (AC-08 / AC-09).
  // This preserves the original disabled-until-complete behavior for non-reference flows.
  const hasReferenceBlocks = nodes.some((n) => n.type === 'reference-block');
  const effectiveIsStep3Disabled =
    (illustrationGeneration.status === 'idle' && hasReferenceBlocks && !isGenerationBlocking)
      ? false
      : isStep3Disabled;

  const handleNext = useCallback((): void => {
    if (isMusicBlockingStep3) return;
    if (effectiveIsStep3Disabled) return;
    setIllustrationGateError(null);

    // When reference blocks are present and illustrations haven't started,
    // clicking "Next" starts them. This enforces the star gate via the API (AC-08 / AC-09).
    if (illustrationGeneration.status === 'idle' && hasReferenceBlocks) {
      void startStoryboardIllustrations(safeDraftId)
        .then(() => { /* generation started — hook will poll and update */ })
        .catch((err: unknown) => {
          setIllustrationGateError(err instanceof Error ? err.message : String(err));
        });
      return;
    }

    openStep3Modal();
  }, [isMusicBlockingStep3, effectiveIsStep3Disabled, illustrationGeneration.status, hasReferenceBlocks, safeDraftId, openStep3Modal]);

  return (
    <div style={s.page} data-testid="storyboard-page">
      <StoryboardBulkStreamUrlProvider
        urls={storyboardImageStreamUrls}
        fileIds={bulkStreamFileIds}
        error={storyboardImageStreamUrlError}
        missingFileIds={missingStoryboardImageStreamFileIds}
      >
        <StoryboardTopBar
          saveLabel={saveLabel}
          isHistoryOpen={isHistoryOpen}
          onHistoryToggle={() => setIsHistoryOpen((v) => !v)}
          onNavigateHome={() => { navigate('/'); }}
          checkpointBar={
            <CheckpointCountdownBar
              idle={checkpointScheduler.idle}
              remainingMs={checkpointScheduler.remainingMs}
              canSaveNow={checkpointScheduler.canSaveNow}
              inFlight={inFlight}
              onSaveNow={() => void checkpointScheduler.triggerManualSave()}
            />
          }
        />
        <StoryboardPageWorkspace
          activeTab={activeTab} setActiveTab={setActiveTab} draftId={safeDraftId}
          selectedBlockId={selectedBlockId} onAddTemplate={handleAddFromLibrary}
          isLoading={isLoading} error={error} nodes={nodes} edges={edges}
          nodeTypes={STORYBOARD_NODE_TYPES} onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
          onConnect={handleConnect} isValidConnection={isValidConnection}
          onNodeDragStart={handleNodeDragStartWithSignal} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStopWithSignal}
          onAddBlock={handleAddBlock} onAddMusicBlock={handleAddMusicBlock}
          canAddMusicBlock={canAddMusicBlock} onNodeClick={handleNodeClick}
          isKnifeActive={isKnifeActive} onCutEdge={cutEdge} isHistoryOpen={isHistoryOpen}
          onCloseHistory={() => setIsHistoryOpen(false)} onRestore={handleRestore}
          planGeneration={planGeneration} illustrationGeneration={illustrationGeneration}
          isPlanBlocking={isPlanBlocking}
          draftOwnerId={draftOwnerId} hasMusic={musicBlocks.length > 0}
          onStartReferenceGeneration={handleStartCastExtraction}
        />
        {/* AC-08: gate error alerts when POST /illustrations returns 422 */}
        {illustrationGeneration.gateError?.code === 'references.reference_gate_failed' ? (
          <ReferenceGateMessage
            blocks={illustrationGeneration.gateError.details.blocks ?? []}
            onRetryBlock={(blockId) => void retryReferenceBlockGeneration(safeDraftId, blockId)}
            onDeleteBlock={removeNode}
          />
        ) : illustrationGeneration.gateError?.code === 'references.unlinked_scenes' ? (
          <UnlinkedScenesMessage
            scenes={illustrationGeneration.gateError.details.scenes ?? []}
          />
        ) : illustrationGateError !== null ? (
          <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '12px 16px', margin: '0 16px 8px', borderRadius: 6, fontSize: 14 }}>
            {illustrationGateError}
          </div>
        ) : null}
        <StoryboardPageFooter isNextDisabled={effectiveIsStep3Disabled || isMusicBlockingStep3} onBack={handleBack} onNext={handleNext} />
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

        {/* Cast confirmation modal — new reference flow entry point (T17, AC-01/AC-03). */}
        {castModalOpen && (
          <CastConfirmModal
            orderedScenes={orderedScenes}
            extraction={castExtraction}
            hasExistingBlocks={hasExistingReferenceBlocks}
            onConfirmCast={handleConfirmCast}
            onCancel={() => setCastModalOpen(false)}
          />
        )}

        {step3Modal}

        {/* Full-screen loader for the checkpoint capture moment (AC-03). */}
        <CheckpointCaptureOverlay visible={inFlight} />
      </StoryboardBulkStreamUrlProvider>
    </div>
  );
}
