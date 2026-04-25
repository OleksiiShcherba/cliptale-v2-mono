/**
 * StoryboardPage — /storyboard/:draftId shell (Step 2 of the wizard).
 * Renders top bar, sidebar tabs (STORYBOARD / LIBRARY / EFFECTS), canvas, bottom bar.
 * React Flow CSS import below is the one exception to the no-CSS-import rule.
 */

import '@xyflow/react/dist/style.css';

import React, { useState, useCallback, useEffect } from 'react';

import { addEdge } from '@xyflow/react';
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
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { useNavigate, useParams } from 'react-router-dom';

import { useStoryboardCanvas } from '../hooks/useStoryboardCanvas';
import { useAddBlock } from '../hooks/useAddBlock';
import { useHandleAddBlock } from '../hooks/useHandleAddBlock';
import { useHandleRestore } from '../hooks/useHandleRestore';
import { useSceneModal } from '../hooks/useSceneModal';
import { useStoryboardAutosave } from '../hooks/useStoryboardAutosave';
import { useStoryboardDrag } from '../hooks/useStoryboardDrag';
import { useStoryboardHistoryPush } from '../hooks/useStoryboardHistoryPush';
import { useStoryboardKeyboard } from '../hooks/useStoryboardKeyboard';
import {
  storyboardHistoryStore,
  initHistoryStore,
  destroyHistoryStore,
} from '../store/storyboard-history-store';
import { setSelectedBlock, useStoryboardStore } from '../store/storyboard-store';
import type { StoryboardSidebarTab, SceneBlockNodeData } from '../types';
import { EffectsPanel } from './EffectsPanel';
import { EndNode } from './EndNode';
import { LibraryPanel } from './LibraryPanel';
import { SceneBlockNode } from './SceneBlockNode';
import { SceneModal } from './SceneModal';
import { SidebarTab } from './SidebarTab';
import { StartNode } from './StartNode';
import { StoryboardAssetPanel } from './StoryboardAssetPanel';
import { StoryboardCanvas } from './StoryboardCanvas';
import {
  EffectsIcon,
  LibraryIcon,
  StoryboardIcon,
} from './storyboardIcons';
import { StoryboardHistoryPanel } from './StoryboardHistoryPanel';
import { StoryboardTopBar } from './StoryboardPage.topBar';
import { storyboardPageStyles as s, BORDER, ERROR } from './storyboardPageStyles';

// ── React Flow node type map ───────────────────────────────────────────────────

/**
 * nodeTypes must be stable (defined outside the component) to avoid React Flow
 * re-mounting nodes on every render.
 */
const NODE_TYPES: NodeTypes = {
  start: StartNode,
  end: EndNode,
  'scene-block': SceneBlockNode,
};

// ── StoryboardPage ─────────────────────────────────────────────────────────────

/**
 * Full-page shell for the storyboard editor (Step 2 of the video wizard).
 */
export function StoryboardPage(): React.ReactElement {
  const navigate = useNavigate();
  const { draftId } = useParams<{ draftId: string }>();

  const [activeTab, setActiveTab] = useState<StoryboardSidebarTab>('storyboard');
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const safeDraftId = draftId ?? '';
  const { nodes, edges, isLoading, error, setNodes, setEdges, removeNode } =
    useStoryboardCanvas(safeDraftId);

  const { selectedBlockId } = useStoryboardStore();

  // ── SceneModal ───────────────────────────────────────────────────────────────

  const { editingBlock, openModal, handleSave, handleDelete, handleClose } = useSceneModal();

  const handleNodeClick: NodeMouseHandler<Node> = useCallback(
    (_event, node) => {
      if (node.type !== 'scene-block') return;
      const blockData = node.data as SceneBlockNodeData;
      // Track selected block for EffectsPanel "Apply to this scene" action.
      setSelectedBlock(node.id);
      openModal(blockData.block);
    },
    [openModal],
  );

  // ── History store init/destroy ───────────────────────────────────────────────

  useEffect(() => {
    initHistoryStore(safeDraftId);
    return () => {
      destroyHistoryStore();
    };
  }, [safeDraftId]);

  // ── Autosave ─────────────────────────────────────────────────────────────────

  const { saveLabel, saveNow } = useStoryboardAutosave(safeDraftId, nodes, edges);

  // ── Drag hook ────────────────────────────────────────────────────────────────

  const { dragState, syncRefs, handleNodeDragStart, handleNodeDrag, handleNodeDragStop } =
    useStoryboardDrag({ setNodes, setEdges });

  // Keep drag-hook refs in sync with latest nodes/edges.
  useEffect(() => {
    syncRefs(nodes, edges);
  }, [nodes, edges, syncRefs]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useStoryboardKeyboard({
    nodes,
    onRemoveNode: removeNode,
    historyStore: storyboardHistoryStore,
  });

  // ── Add Block + History push + Restore ──────────────────────────────────────
  const { addBlock } = useAddBlock({ nodes, edges, setNodes, onRemoveNode: removeNode, saveNow });
  const { pushSnapshot } = useStoryboardHistoryPush(safeDraftId);
  const { handleAddBlock } = useHandleAddBlock({ addBlock, saveNow });
  const { handleRestore } = useHandleRestore({ setNodes, setEdges, pushSnapshot, removeNode, saveNow });

  // ── Edge connection callbacks ────────────────────────────────────────────────

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
      setEdges((prev) => {
        const next = addEdge(
          {
            ...connection,
            sourceHandle: connection.sourceHandle ?? 'exit',
            targetHandle: connection.targetHandle ?? 'income',
            style: { stroke: BORDER, strokeWidth: 2 },
          },
          prev,
        );
        pushSnapshot(nodes, next);
        return next;
      });
      setTimeout(() => void saveNow(), 0);
    },
    [setEdges, nodes, pushSnapshot, saveNow],
  );

  // ── Node / edge change handlers ──────────────────────────────────────────────

  const handleNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false);
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev);
        if (hasMoved) pushSnapshot(next, edges);
        return next;
      });
      if (hasMoved) setTimeout(() => void saveNow(), 0);
    },
    [setNodes, edges, pushSnapshot, saveNow],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const hasStructuralChange = changes.some((c) => c.type === 'add' || c.type === 'remove');
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev);
        if (hasStructuralChange) pushSnapshot(nodes, next);
        return next;
      });
      if (hasStructuralChange) setTimeout(() => void saveNow(), 0);
    },
    [setEdges, nodes, pushSnapshot, saveNow],
  );

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleBack = (): void => { navigate(draftId ? `/generate?draftId=${draftId}` : '/generate'); };
  const handleNext = (): void => { navigate('/generate/road-map'); };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={s.page} data-testid="storyboard-page">
      {/* ── Top bar ── */}
      <StoryboardTopBar
        saveLabel={saveLabel}
        isHistoryOpen={isHistoryOpen}
        onHistoryToggle={() => setIsHistoryOpen((v) => !v)}
        onNavigateHome={() => { navigate('/'); }}
      />

      {/* ── Body (sidebar + canvas) ── */}
      <div style={s.body}>
        {/* ── Left sidebar ── */}
        <nav style={s.sidebar} aria-label="Storyboard panel tabs" data-testid="storyboard-sidebar">
          <SidebarTab tab="storyboard" activeTab={activeTab} onSelect={setActiveTab} label="Storyboard" icon={<StoryboardIcon />} />
          <SidebarTab tab="library" activeTab={activeTab} onSelect={setActiveTab} label="Library" icon={<LibraryIcon />} />
          <SidebarTab tab="effects" activeTab={activeTab} onSelect={setActiveTab} label="Effects" icon={<EffectsIcon />} />
        </nav>

        {/* ── Asset panel — shown on STORYBOARD tab; provides asset browse + rename ── */}
        {activeTab === 'storyboard' && (
          <StoryboardAssetPanel draftId={safeDraftId} />
        )}

        {/* ── Library panel + Effects panel ── */}
        {activeTab === 'library' && <LibraryPanel draftId={safeDraftId} onSwitchToStoryboard={() => setActiveTab('storyboard')} />}
        {activeTab === 'effects' && <EffectsPanel selectedBlockId={selectedBlockId} />}

        {/* ── Canvas area ── */}
        <div
          style={s.canvasArea}
          data-testid="storyboard-canvas"
          aria-label="Storyboard canvas"
        >
          {isLoading ? (
            <div style={s.canvasPlaceholder} data-testid="canvas-loading">Loading storyboard…</div>
          ) : error ? (
            <div style={{ ...s.canvasPlaceholder, color: ERROR }} data-testid="canvas-error">{error}</div>
          ) : (
            <StoryboardCanvas
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onNodeDragStart={handleNodeDragStart}
              onNodeDrag={handleNodeDrag}
              onNodeDragStop={handleNodeDragStop}
              dragState={dragState}
              onAddBlock={handleAddBlock}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        {/* ── History panel — slides in from right when open ── */}
        {isHistoryOpen && (
          <StoryboardHistoryPanel
            draftId={safeDraftId}
            onClose={() => setIsHistoryOpen(false)}
            onRestore={handleRestore}
          />
        )}
      </div>

      {/* ── Bottom bar ── */}
      <footer style={s.bottomBar}>
        <button type="button" style={s.backButton} onClick={handleBack} aria-label="Back to Step 1" data-testid="back-button">
          ← Back
        </button>
        <span style={s.bottomBarLabel} data-testid="step-label">STEP 2: STORYBOARD</span>
        <button type="button" style={s.nextButton} onClick={handleNext} aria-label="Next: Step 3" data-testid="next-step3-button">
          Next: Step 3 →
        </button>
      </footer>

      {/* ── SceneModal ── */}
      {editingBlock !== null && (
        <SceneModal
          mode="block"
          block={editingBlock}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
