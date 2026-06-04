/**
 * FlowCanvas — the @xyflow/react canvas for the Generate AI flow (T17).
 *
 * Renders content / generation / result blocks as typed nodes and the typed connections
 * between them. Connection rules are server-authoritative-aligned and enforced at connect
 * time by the pure validators in useFlowCanvas:
 *   - incompatible drops (modality mismatch) are REFUSED with the expected-modality hint
 *     (AC-02), via xyflow's isValidConnection (drop blocked) + onConnect (rejection report);
 *   - a result block's output wired into a compatible input is accepted (AC-18);
 *   - changing a generation block's model rebuilds its handles, prunes incompatible edges
 *     and reports which were removed, preserving result blocks (AC-07, wired through the
 *     hook's changeModel — surfaced by the inspector in T18).
 *
 * The canvas state lives in useFlowCanvas and serializes to the project-schema FlowCanvas
 * shape (content params.contentType/text|fileId, generation params.modelId, result
 * params.sourceBlockId) so the backend gate/generate accept it unchanged.
 *
 * T18 (inspector + content input) and T20 (generation/result live rendering) extend the
 * node `data` and the toolbar through the seams left here (onSelectModel, the typed-handle
 * map, blockOutputModality for result nodes).
 */

import React, { useCallback, useMemo } from 'react';

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  applyNodeChanges,
} from '@xyflow/react';
import type {
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  NodeMouseHandler,
  EdgeMouseHandler,
} from '@xyflow/react';
import type { FlowCanvas as FlowCanvasDoc } from '@ai-video-editor/project-schema';

import { FLOW_NODE_TYPES } from './flowNodeTypes';
import { BORDER, PRIMARY, SURFACE } from './flowNodeStyles';
import {
  blockOutputModality,
  useFlowCanvas,
  type UseFlowCanvasOptions,
} from '../hooks/useFlowCanvas';

const FLOW_CONTAINER_STYLE: React.CSSProperties = { width: '100%', height: '100%' };
const REACT_FLOW_STYLE: React.CSSProperties = { background: SURFACE };

export type FlowCanvasProps = {
  initialCanvas?: FlowCanvasDoc;
  /** Bubbles up the live canvas controller (connect/changeModel/serialize) for T18–T20. */
  onCanvasReady?: (controller: ReturnType<typeof useFlowCanvas>) => void;
  /** Fired when a node is clicked (drives the Inspector selection). */
  onSelectBlock?: (blockId: string) => void;
  /** The currently-selected block id — the matching node renders a selected outline. */
  selectedBlockId?: string | null;
  /** Fired when the empty canvas (pane) is clicked — clears the Inspector selection. */
  onPaneClick?: () => void;
  /** Fired whenever the live canvas document changes (drives autosave + inspector). */
  onCanvasChange?: (canvas: FlowCanvasDoc) => void;
} & Pick<UseFlowCanvasOptions, 'onEdgesPruned' | 'onConnectionRejected'>;

function InnerFlowCanvas({
  initialCanvas,
  onEdgesPruned,
  onConnectionRejected,
  onCanvasReady,
  onCanvasChange,
  onSelectBlock,
  selectedBlockId,
  onPaneClick,
}: FlowCanvasProps): React.ReactElement {
  const controller = useFlowCanvas({ initialCanvas, onEdgesPruned, onConnectionRejected });
  const { canvas, setCanvas, connect, isValidConnection, removeBlock, removeEdge } = controller;

  // Ephemeral edge selection (node selection is driven by selectedBlockId from above).
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null);

  // Expose the controller ONCE (its methods are stable); the live canvas is streamed
  // separately via onCanvasChange so consumers don't re-store a fresh controller object
  // on every change (which would loop).
  const readyFiredRef = React.useRef(false);
  React.useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    onCanvasReady?.(controller);
  }, [controller, onCanvasReady]);

  // Stream canvas changes to the consumer for autosave when content OR layout changes.
  // Positions are part of the signature: the doc only receives a position on the final
  // drag-stop commit (xyflow owns live drag positions), so a block move is exactly one
  // debounced autosave — no per-tick churn — and a re-arranged layout survives reload.
  // xyflow's load-time measurement settling never writes positions into the doc.
  const contentSignature = useMemo(() => {
    const blocks = canvas.blocks
      .map(
        (b) =>
          `${b.blockId}:${b.type}:${b.position.x},${b.position.y}:${JSON.stringify(b.params ?? {})}`,
      )
      .join('|');
    const edges = canvas.edges
      .map((e) => `${e.edgeId}:${e.sourceBlockId}>${e.sourceHandle}->${e.targetBlockId}>${e.targetHandle}`)
      .join('|');
    return `${blocks}#${edges}`;
  }, [canvas]);

  const lastSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Skip the initial content (the loaded document is not an edit).
    if (lastSigRef.current === null) {
      lastSigRef.current = contentSignature;
      return;
    }
    if (lastSigRef.current === contentSignature) return;
    lastSigRef.current = contentSignature;
    onCanvasChange?.(canvas);
    // canvas is intentionally read fresh (full doc incl. positions) when content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSignature, onCanvasChange]);

  // ── Map the canvas document → xyflow nodes/edges ────────────────────────────
  //
  // xyflow OWNS the rendered nodes (rfNodes): it keeps each node's live drag position
  // and measured size, so dragging is smooth and does not re-measure every node. The
  // canvas document remains the source of truth for STRUCTURE (which blocks/edges exist,
  // their type/params/selection) and is reconciled into rfNodes below WITHOUT clobbering
  // xyflow's positions/measurements. Final drag positions are written back to the doc on
  // drag stop. (Previously nodes were re-derived from the doc on every drag tick, which
  // reset initialWidth/Height on all nodes → handle anchors jumped → all edges jittered.)
  const buildNode = useCallback(
    (block: FlowCanvasDoc['blocks'][number], full: FlowCanvasDoc): Node => ({
      id: block.blockId,
      type: block.type,
      position: block.position,
      initialWidth: 220,
      initialHeight: 120,
      selected: block.blockId === selectedBlockId,
      data:
        block.type === 'result'
          ? { block, modality: blockOutputModality(block, full) }
          : { block },
    }),
    [selectedBlockId],
  );

  const [rfNodes, setRfNodes] = React.useState<Node[]>(() =>
    canvas.blocks.map((b) => buildNode(b, canvas)),
  );

  // Reconcile structure/selection/data into rfNodes when they change — but NOT on a bare
  // position move (contentSignature excludes positions), so a drag never re-runs this and
  // never overrides xyflow's live node positions/sizes. Existing nodes keep their
  // xyflow-owned position + measured fields; new nodes take the doc position; removed
  // nodes drop out.
  React.useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return canvas.blocks.map((block) => {
        const base = buildNode(block, canvas);
        const existing = prevById.get(block.blockId);
        return existing
          ? { ...existing, type: base.type, data: base.data, selected: base.selected }
          : base;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSignature, selectedBlockId, buildNode]);

  const edges = useMemo<Edge[]>(
    () =>
      canvas.edges.map((e) => ({
        id: e.edgeId,
        source: e.sourceBlockId,
        sourceHandle: e.sourceHandle,
        target: e.targetBlockId,
        targetHandle: e.targetHandle,
        selected: e.edgeId === selectedEdgeId,
        // A selected connection is highlighted; double-click it to delete (handlers below).
        style: e.edgeId === selectedEdgeId ? { stroke: PRIMARY, strokeWidth: 2 } : undefined,
      })),
    [canvas.edges, selectedEdgeId],
  );

  // Apply xyflow's node changes to the xyflow-owned rfNodes (smooth drag + stable
  // measurement). `select` is driven by selectedBlockId (above) so it is dropped here to
  // keep a single source of truth; `remove` (Delete key) is also applied to the canvas
  // doc so the block + its incident edges are dropped.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const ch of changes) {
        if (ch.type === 'remove') removeBlock(ch.id);
      }
      const applied = changes.filter((ch) => ch.type !== 'select');
      if (applied.length === 0) return;
      setRfNodes((nds) => applyNodeChanges(applied, nds));
    },
    [removeBlock],
  );

  // Commit the final drag position to the canvas document. The commit streams through
  // contentSignature (positions included) → one debounced autosave per move, so a
  // re-arranged layout persists without any other content edit.
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setCanvas((c) => {
        let mutated = false;
        const blocks = c.blocks.map((b) => {
          if (b.blockId !== node.id) return b;
          if (b.position.x === node.position.x && b.position.y === node.position.y) return b;
          mutated = true;
          return { ...b, position: { x: node.position.x, y: node.position.y } };
        });
        return mutated ? { ...c, blocks } : c;
      });
    },
    [setCanvas],
  );

  // Edge removals (Delete/Backspace on a selected connection). We ignore xyflow's
  // select/other edge-change events — only removals mutate the canvas document.
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const ch of changes) {
        if (ch.type === 'remove') removeEdge(ch.id);
      }
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      connect(conn);
    },
    [connect],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      onSelectBlock?.(node.id);
      setSelectedEdgeId(null); // selecting a block clears any edge selection
    },
    [onSelectBlock],
  );

  // Clicking an edge highlights it (and clears the block/Inspector selection).
  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      setSelectedEdgeId(edge.id);
      onPaneClick?.(); // deselect any block so only the edge is selected
    },
    [onPaneClick],
  );

  // Double-click an edge to delete the connection (AC: canvas editing UX).
  const onEdgeDoubleClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      event.stopPropagation();
      removeEdge(edge.id);
      setSelectedEdgeId(null);
    },
    [removeEdge],
  );

  // Clicking the empty canvas (pane) clears the selection → closes the Inspector.
  const handlePaneClick = useCallback(() => {
    onPaneClick?.();
    setSelectedEdgeId(null);
  }, [onPaneClick]);

  return (
    <div style={FLOW_CONTAINER_STYLE} data-testid="flow-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        nodeTypes={FLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={handlePaneClick}
        isValidConnection={isValidConnection}
        style={REACT_FLOW_STYLE}
        proOptions={{ hideAttribution: true }}
        fitView
        minZoom={0.25}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} color={BORDER} gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps): React.ReactElement {
  return (
    <ReactFlowProvider>
      <InnerFlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
