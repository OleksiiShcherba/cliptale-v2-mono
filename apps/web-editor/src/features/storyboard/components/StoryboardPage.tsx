import '@xyflow/react/dist/style.css';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Edge as FlowEdge, Node, NodeMouseHandler } from '@xyflow/react';
import { useNavigate, useParams } from 'react-router-dom';

import { fetchDraft } from '@/features/generate-wizard/api';
import { startCastExtraction, confirmCast, retryReferenceBlockGeneration, updateReferenceBlock, saveReferenceSceneLinks, getLatestCastExtraction, cancelPhase, confirmPipelineCast, skipPhase, triggerPhase } from '@/features/storyboard/api';
import { useAddBlock } from '@/features/storyboard/hooks/useAddBlock';
import { useAddMusicBlock } from '@/features/storyboard/hooks/useAddMusicBlock';
import { useHandleAddFromLibrary } from '@/features/storyboard/hooks/useHandleAddFromLibrary';
import { useStoryboardCanvas, REFERENCE_BLOCK_Y_OFFSET } from '@/features/storyboard/hooks/useStoryboardCanvas';
import { useHandleAddBlock } from '@/features/storyboard/hooks/useHandleAddBlock';
import { useHandleRestore } from '@/features/storyboard/hooks/useHandleRestore';
import { useSceneModal } from '@/features/storyboard/hooks/useSceneModal';
import { castExtractionQueryKey } from '@/features/storyboard/hooks/useCastAutostart';
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
import { BlockingLoader } from './BlockingLoader';
import { PipelineFailureBanner } from './PipelineFailureBanner';
import { CheckpointCaptureOverlay } from './CheckpointCaptureOverlay';
import { CheckpointCountdownBar } from './CheckpointCountdownBar';
import { MusicBlockModal } from './MusicBlockModal';
import { SceneModal } from './SceneModal';
import { CastConfirmModal } from './CastConfirmModal';
import { ReviewCastProposalModal } from './ReviewCastProposalModal';
import { SceneImageOfferModal } from './SceneImageOfferModal';
import type { CastExtractionJob, CastProposalEntry } from './CastConfirmModal';
import { ReferenceDetailsModal } from './ReferenceDetailsModal';
import { StoryboardBulkStreamUrlProvider } from './SceneBlockNode.mediaThumbnail';
import { useStoryboardPageBulkStreamUrls } from './StoryboardPage.bulkStreamUrls';
import { ReferenceGateMessage, UnlinkedScenesMessage } from './ReferenceGateMessage';
import { StoryboardPageFooter } from './StoryboardPageFooter';
import { StoryboardPageWorkspace } from './StoryboardPageWorkspace';
import { StoryboardTopBar } from './StoryboardPage.topBar';
import { StepCorners } from './StepCorners';
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

  // Reference details modal: block click opens it (scene links adjustable +
  // prompt view-only); the flow page moved to the node's "View flow" button.
  const [detailsBlockId, setDetailsBlockId] = useState<string | null>(null);
  const handleOpenReferenceDetails = useCallback((blockId: string): void => {
    setDetailsBlockId(blockId);
  }, []);

  const { nodes, edges, isLoading, error, setNodes, setEdges, removeNode, reload } =
    useStoryboardCanvas(safeDraftId, {
      onOpenReferenceFlow: handleOpenReferenceFlow,
      onRetryReferenceBlock: handleRetryReferenceBlock,
      onOpenReferenceDetails: handleOpenReferenceDetails,
    });
  // Keep nodesRef in sync so handleOpenReferenceFlow always sees the latest nodes.
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // The reference block whose details modal is open (derived from the live nodes).
  const detailsNodeData = detailsBlockId
    ? (nodes.find((n) => n.id === detailsBlockId)?.data as ReferenceBlockNodeData | undefined)
    : undefined;

  // Persist the replacement scene-link list, then sync the node data in place
  // (sceneBlockIds + bumped compare-and-set version) — no full canvas reload.
  const handleSaveReferenceSceneLinks = useCallback(
    async (
      sceneBlockIds: string[],
      version: number,
    ): Promise<{ sceneBlockIds: string[]; version: number }> => {
      if (!detailsBlockId) throw new Error('No reference block selected');
      const saved = await saveReferenceSceneLinks(safeDraftId, detailsBlockId, sceneBlockIds, version);
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== detailsBlockId || n.type !== 'reference-block') return n;
          const data = n.data as ReferenceBlockNodeData;
          return {
            ...n,
            data: {
              ...data,
              sceneBlockIds: saved.sceneBlockIds,
              referenceBlock: { ...data.referenceBlock, version: saved.version },
            },
          };
        }),
      );
      return saved;
    },
    [detailsBlockId, safeDraftId, setNodes],
  );

  const reloadStoryboard = useCallback(async (): Promise<void> => {
    await reload?.();
  }, [reload]);

  // ── Cast extraction (AC-01, AC-05, AC-07) ─────────────────────────────────
  // T15: useCastAutostart retired. Cast extraction is now driven by the
  // server-side pipeline (usePipelineState in useStoryboardGenerationFlow).
  // The manual control (handleStartCastExtraction) and CastConfirmModal are
  // retained as-is; the query below fetches any existing extraction on demand.
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [hasExistingReferenceBlocks, setHasExistingReferenceBlocks] = useState(false);
  const castExtractionQuery = useQuery({
    queryKey: castExtractionQueryKey(safeDraftId),
    queryFn: () => getLatestCastExtraction(safeDraftId),
    enabled: safeDraftId !== '',
    staleTime: 30_000,
  });
  const castExtraction = castExtractionQuery.data ?? null;

  // The manual control always opens the modal and surfaces the existing
  // extraction. If auto-start never created one (a failed auto-start — AC-07),
  // it starts a fresh extraction now via the manual path (not gated by the
  // hook's auto-start guard).
  const handleStartCastExtraction = useCallback(async (): Promise<void> => {
    setCastModalOpen(true);
    if (castExtractionQuery.data) return; // existing extraction already surfaced
    try {
      const accepted = await startCastExtraction(safeDraftId);
      queryClient.setQueryData<CastExtractionJob>(castExtractionQueryKey(safeDraftId), {
        jobId: accepted.jobId,
        draftId: safeDraftId,
        status: accepted.status,
        proposal: null,
        aggregateEstimateCredits: null,
        errorMessage: null,
      });
    } catch (err) {
      console.error('[StoryboardPage] manual startCastExtraction failed:', err);
    }
  }, [castExtractionQuery.data, safeDraftId, queryClient]);

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
    pipelineState,
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
      // Reference-block positions live in their own table — the storyboard autosave
      // only persists scene/start/end nodes, so persist a dragged reference block
      // directly (versionless last-write-wins). Display y carries a +OFFSET, so
      // store display-y minus the offset to round-trip on reload.
      const draggedNode = args[1] as Node | undefined;
      if (draggedNode?.type === 'reference-block') {
        void updateReferenceBlock(safeDraftId, draggedNode.id, {
          positionX: draggedNode.position.x,
          positionY: draggedNode.position.y - REFERENCE_BLOCK_Y_OFFSET,
        }).catch((err) => {
          console.error('[StoryboardPage] failed to persist reference block position:', err);
        });
      }
    },
    [handleNodeDragStop, safeDraftId],
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

    // When reference blocks are present and illustrations haven't started (or a
    // gate error is showing), clicking "Next" starts/retries them.  Route through
    // the hook so gateError is set for structured 422 responses (AC-02) and cleared
    // on success (AC-01) — the hook catches internally.
    const shouldStartIllustrations =
      hasReferenceBlocks &&
      (illustrationGeneration.status === 'idle' || illustrationGeneration.gateError !== null);
    if (shouldStartIllustrations) {
      void illustrationGeneration.start()
        .catch((err: unknown) => {
          setIllustrationGateError(err instanceof Error ? err.message : String(err));
        });
      return;
    }

    openStep3Modal();
  }, [isMusicBlockingStep3, effectiveIsStep3Disabled, illustrationGeneration.status, illustrationGeneration.gateError, illustrationGeneration.start, hasReferenceBlocks, openStep3Modal]);

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
        {/* T16 BlockingLoader — mounts here when pipelineState?.active_run_phase != null */}
        <BlockingLoader
          state={pipelineState}
          onCancel={(phase) => {
            void cancelPhase(safeDraftId, phase).catch((err: unknown) => {
              console.error('cancelPhase failed', err);
            });
          }}
        />
        {/* F2 (AC-12): reference-phase failures have no status-block control of their
            own — surface what failed + a retry. */}
        <PipelineFailureBanner draftId={safeDraftId} state={pipelineState} />
        {/* T17 ReviewCastProposalModal */}
        <ReviewCastProposalModal
          state={pipelineState}
          onConfirm={() => {
            // Confirm as shown — no client body. The server re-validates the estimate
            // against the persisted value (review r3 F5 / ADR-0006).
            void confirmPipelineCast(safeDraftId).catch((err: unknown) => {
              console.error('confirmPipelineCast failed', err);
            });
          }}
          onSkip={() => {
            void skipPhase(safeDraftId, 'reference_data').catch((err: unknown) => {
              console.error('skipPhase failed', err);
            });
          }}
        />
        {/* T18 SceneImageOfferModal */}
        <SceneImageOfferModal
          state={pipelineState}
          onAccept={() => {
            void triggerPhase(safeDraftId, 'scene_image').catch((err: unknown) => {
              console.error('triggerPhase scene_image failed', err);
            });
          }}
          onSkip={() => {
            void skipPhase(safeDraftId, 'scene_image').catch((err: unknown) => {
              console.error('skipPhase scene_image failed', err);
            });
          }}
        />
        {/* T19 StepCorners */}
        <StepCorners draftId={safeDraftId} state={pipelineState} />
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

        {/* Reference details — scene links (adjustable) + prompt (view only). */}
        {detailsBlockId && detailsNodeData && (
          <ReferenceDetailsModal
            key={detailsBlockId}
            referenceBlock={detailsNodeData.referenceBlock}
            sceneBlockIds={detailsNodeData.sceneBlockIds}
            orderedScenes={orderedScenes}
            onSaveSceneLinks={handleSaveReferenceSceneLinks}
            onViewFlow={() => {
              setDetailsBlockId(null);
              handleOpenReferenceFlow(detailsBlockId);
            }}
            onClose={() => setDetailsBlockId(null)}
          />
        )}

        {step3Modal}

        {/* Full-screen loader for the checkpoint capture moment (AC-03). */}
        <CheckpointCaptureOverlay visible={inFlight} />
      </StoryboardBulkStreamUrlProvider>
    </div>
  );
}
