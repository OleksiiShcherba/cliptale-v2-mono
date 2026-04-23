/**
 * StoryboardPage — the /storyboard/:draftId page shell (Step 2 of the wizard).
 *
 * Renders:
 * - Top bar: ClipTale logo (left) + WizardStepper centered + autosave indicator
 *   + gear/help icon buttons (right)
 * - Left sidebar with three icon tabs: STORYBOARD (default active), LIBRARY, EFFECTS
 * - Canvas area: React Flow canvas (see StoryboardCanvas.tsx)
 * - Bottom bar: Back button + "STEP 2: STORYBOARD" label + "Next: Step 3 →" button
 * - SceneModal: opens when a scene-block node is clicked
 *
 * React Flow CSS import: the ONE exception to the no-CSS-import rule — third-party lib.
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

import { WizardStepper } from '@/features/generate-wizard/components/WizardStepper';

import { useStoryboardCanvas } from '../hooks/useStoryboardCanvas';
import { useAddBlock } from '../hooks/useAddBlock';
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
import type { StoryboardSidebarTab, SceneBlockNodeData } from '../types';
import { EndNode } from './EndNode';
import { SceneBlockNode } from './SceneBlockNode';
import { SceneModal } from './SceneModal';
import { SidebarTab } from './SidebarTab';
import { StartNode } from './StartNode';
import { StoryboardCanvas } from './StoryboardCanvas';
import {
  EffectsIcon,
  GearIcon,
  HelpIcon,
  LibraryIcon,
  StoryboardIcon,
} from './storyboardIcons';
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

  const safeDraftId = draftId ?? '';
  const { nodes, edges, isLoading, error, setNodes, setEdges, removeNode } =
    useStoryboardCanvas(safeDraftId);

  // ── SceneModal ───────────────────────────────────────────────────────────────

  const { editingBlock, openModal, handleSave, handleDelete, handleClose } = useSceneModal();

  /**
   * Opens SceneModal when a scene-block node is clicked.
   * START/END nodes have type 'start'|'end' — they are skipped.
   */
  const handleNodeClick: NodeMouseHandler<Node> = useCallback(
    (_event, node) => {
      if (node.type !== 'scene-block') return;
      const blockData = node.data as SceneBlockNodeData;
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

  const { saveLabel } = useStoryboardAutosave(safeDraftId);

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

  // ── Add Block hook ───────────────────────────────────────────────────────────

  const { addBlock } = useAddBlock({ nodes, edges, setNodes, onRemoveNode: removeNode });

  // ── History push helper ──────────────────────────────────────────────────────

  const { pushSnapshot } = useStoryboardHistoryPush(safeDraftId);

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
    },
    [setEdges, nodes, pushSnapshot],
  );

  // ── Node / edge change handlers ──────────────────────────────────────────────

  const handleNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev);
        const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false);
        if (hasMoved) pushSnapshot(next, edges);
        return next;
      });
    },
    [setNodes, edges, pushSnapshot],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev);
        const hasStructuralChange = changes.some(
          (c) => c.type === 'add' || c.type === 'remove',
        );
        if (hasStructuralChange) pushSnapshot(nodes, next);
        return next;
      });
    },
    [setEdges, nodes, pushSnapshot],
  );

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleBack = (): void => {
    navigate(draftId ? `/generate?draftId=${draftId}` : '/generate');
  };

  const handleNext = (): void => {
    navigate('/generate/road-map');
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={s.page} data-testid="storyboard-page">
      {/* ── Top bar ── */}
      <header style={s.topBar}>
        <div style={s.topBarLeft}>
          <span style={s.logoText}>ClipTale</span>
        </div>
        <div style={s.topBarCenter}>
          <WizardStepper currentStep={2} />
        </div>
        <div style={s.topBarRight}>
          <span style={s.autosaveIndicator} aria-label="Autosave status" data-testid="autosave-indicator">
            {saveLabel}
          </span>
          <button type="button" style={s.iconButton} aria-label="Settings" title="Settings" data-testid="settings-icon-button">
            <GearIcon />
          </button>
          <button type="button" style={s.iconButton} aria-label="Help" title="Help" data-testid="help-icon-button">
            <HelpIcon />
          </button>
        </div>
      </header>

      {/* ── Body (sidebar + canvas) ── */}
      <div style={s.body}>
        {/* ── Left sidebar ── */}
        <nav style={s.sidebar} aria-label="Storyboard panel tabs" data-testid="storyboard-sidebar">
          <SidebarTab tab="storyboard" activeTab={activeTab} onSelect={setActiveTab} label="Storyboard" icon={<StoryboardIcon />} />
          <SidebarTab tab="library" activeTab={activeTab} onSelect={setActiveTab} label="Library" icon={<LibraryIcon />} />
          <SidebarTab tab="effects" activeTab={activeTab} onSelect={setActiveTab} label="Effects" icon={<EffectsIcon />} />
        </nav>

        {/* ── Canvas area ── */}
        <div style={s.canvasArea} data-testid="storyboard-canvas" aria-label="Storyboard canvas">
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
              onAddBlock={addBlock}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <footer style={s.bottomBar}>
        <button type="button" style={s.backButton} onClick={handleBack} aria-label="Back to Step 1" data-testid="back-button">
          ← Back
        </button>
        <span style={s.bottomBarLabel}>Step 2: Storyboard</span>
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
