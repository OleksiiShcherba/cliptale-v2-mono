/**
 * StoryboardCanvas — the React Flow canvas region rendered inside StoryboardPage.
 *
 * Extracted to keep StoryboardPage under the 300-line limit.
 * Receives all state and callbacks from StoryboardPage.
 *
 * Zoom range: 25%–200% (minZoom/maxZoom props + ZoomToolbar).
 * Pan: drag on empty canvas area (panOnDrag prop).
 */

import React, { useState, useCallback } from 'react';

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import type {
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  OnNodeDrag,
  Node,
  Edge,
  Connection,
  Edge as FlowEdge,
  Viewport,
  NodeMouseHandler,
  EdgeMouseHandler,
} from '@xyflow/react';

import { CanvasToolbar } from './CanvasToolbar';
import { GhostDragPortal } from './GhostDragPortal';
import { ZoomToolbar } from './ZoomToolbar';
import type { GhostDragState } from '../hooks/useStoryboardDrag';
import { SURFACE, BORDER } from './storyboardPageStyles';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum zoom fraction — matches ZoomToolbar.MIN_ZOOM_PCT / 100. */
const MIN_ZOOM = 0.25;

/** Maximum zoom fraction — matches ZoomToolbar.MAX_ZOOM_PCT / 100. */
const MAX_ZOOM = 2.0;

/** Default zoom fraction on initial render (100%). */
const DEFAULT_ZOOM = 1.0;

// ── Stable style constants ─────────────────────────────────────────────────────

const FLOW_CONTAINER_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const REACT_FLOW_STYLE: React.CSSProperties = {
  background: SURFACE,
};

/** Applied to the ReactFlow wrapper <div> when knife mode is active. */
const KNIFE_CURSOR_STYLE: React.CSSProperties = { cursor: 'crosshair' };

// ── Props ──────────────────────────────────────────────────────────────────────

interface StoryboardCanvasProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  isValidConnection: (connection: FlowEdge | Connection) => boolean;
  onNodeDragStart: OnNodeDrag;
  onNodeDrag: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  dragState: GhostDragState | null;
  onAddBlock: () => void;
  /** Optional click handler forwarded to ReactFlow's onNodeClick. */
  onNodeClick?: NodeMouseHandler<Node>;
  /**
   * Controls the active interaction mode.
   * `'knife'` applies a crosshair cursor, disables pan-on-drag, and wires
   * `onEdgeClick` to `onCutEdge` so clicking an edge removes it.
   * Defaults to `'grab'` (normal pan/select behaviour).
   */
  cursorMode?: 'grab' | 'knife';
  /**
   * Called when an edge is clicked while `cursorMode === 'knife'`.
   * Receives the edge ID to remove.
   */
  onCutEdge?: (edgeId: string) => void;
}

// ── Inner canvas (needs ReactFlow context for useReactFlow) ────────────────────

interface InnerCanvasProps extends StoryboardCanvasProps {
  zoom: number;
  onZoomChange: (newZoom: number) => void;
}

/**
 * Inner component that can call useReactFlow (must be inside <ReactFlow>).
 * Handles the zoom toolbar interaction via the React Flow instance API.
 */
function InnerCanvas({
  dragState,
  onAddBlock,
  zoom,
  onZoomChange,
}: Pick<InnerCanvasProps, 'dragState' | 'onAddBlock' | 'zoom' | 'onZoomChange'>): React.ReactElement {
  const { zoomTo } = useReactFlow();

  const handleZoomChange = useCallback(
    (newZoom: number): void => {
      onZoomChange(newZoom);
      zoomTo(newZoom, { duration: 150 });
    },
    [zoomTo, onZoomChange],
  );

  return (
    <>
      {dragState && <GhostDragPortal dragState={dragState} />}
      <ZoomToolbar currentZoom={zoom} onZoomChange={handleZoomChange} />
      <CanvasToolbar onAddBlock={onAddBlock} />
    </>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * React Flow canvas region with zoom/pan, ghost drag portal, zoom toolbar,
 * and canvas toolbar. Extracted from StoryboardPage to stay under 300 lines.
 */
export function StoryboardCanvas({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  dragState,
  onAddBlock,
  onNodeClick,
  cursorMode = 'grab',
  onCutEdge,
}: StoryboardCanvasProps): React.ReactElement {
  // Track zoom locally so ZoomToolbar percentage display stays in sync.
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);

  const isKnifeActive = cursorMode === 'knife';

  const handleViewportChange = useCallback((viewport: Viewport): void => {
    setZoom(viewport.zoom);
  }, []);

  // When knife mode is active, clicking an edge fires onCutEdge.
  const handleEdgeClick: EdgeMouseHandler | undefined = isKnifeActive && onCutEdge
    ? (_event, edge) => { onCutEdge(edge.id); }
    : undefined;

  return (
    <div style={FLOW_CONTAINER_STYLE}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={isKnifeActive ? undefined : onNodeClick}
        onEdgeClick={handleEdgeClick}
        // Disable pan-on-drag in knife mode so a click-drag does not start a pan
        // while the user is trying to click an edge.
        panOnDrag={!isKnifeActive}
        // Disable node dragging in knife mode to prevent accidental node moves
        // when clicking near a node to reach an edge.
        nodesDraggable={!isKnifeActive}
        style={isKnifeActive ? { ...REACT_FLOW_STYLE, ...KNIFE_CURSOR_STYLE } : REACT_FLOW_STYLE}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        zoomOnScroll
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onViewportChange={handleViewportChange}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color={BORDER}
          gap={20}
          size={1}
        />

        <InnerCanvas
          dragState={dragState}
          onAddBlock={onAddBlock}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </ReactFlow>
    </div>
  );
}
