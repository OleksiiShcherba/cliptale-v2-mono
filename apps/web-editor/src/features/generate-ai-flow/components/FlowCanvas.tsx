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
} from '@xyflow/react';
import type { Node, Edge, Connection, NodeChange, NodeMouseHandler } from '@xyflow/react';
import type { FlowCanvas as FlowCanvasDoc } from '@ai-video-editor/project-schema';

import { FLOW_NODE_TYPES } from './flowNodeTypes';
import { BORDER, SURFACE } from './flowNodeStyles';
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
}: FlowCanvasProps): React.ReactElement {
  const controller = useFlowCanvas({ initialCanvas, onEdgesPruned, onConnectionRejected });
  const { canvas, setCanvas, connect, isValidConnection } = controller;

  // Expose the controller ONCE (its methods are stable); the live canvas is streamed
  // separately via onCanvasChange so consumers don't re-store a fresh controller object
  // on every change (which would loop).
  const readyFiredRef = React.useRef(false);
  React.useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    onCanvasReady?.(controller);
  }, [controller, onCanvasReady]);

  // Stream canvas changes to the consumer for autosave, but ONLY when the CONTENT
  // (blocks' type/params + edges) changes — never on a bare node-position move or on
  // xyflow's layout/measurement settling at load. Position churn would otherwise fire a
  // spurious autosave that corrupts the optimistic-lock version (AC-10b). The full
  // canvas (positions included) is still streamed; only the trigger is content-gated.
  const contentSignature = useMemo(() => {
    const blocks = canvas.blocks
      .map((b) => `${b.blockId}:${b.type}:${JSON.stringify(b.params ?? {})}`)
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
  const nodes = useMemo<Node[]>(
    () =>
      canvas.blocks.map((block) => ({
        id: block.blockId,
        type: block.type,
        position: block.position,
        // Seed dimensions so xyflow renders the node immediately (visible) instead of
        // keeping it visibility:hidden until a ResizeObserver measurement lands — which
        // races with fitView and otherwise leaves nodes hidden in fast/headless runs.
        initialWidth: 220,
        initialHeight: 120,
        data:
          block.type === 'result'
            ? { block, modality: blockOutputModality(block, canvas) }
            : { block },
      })),
    [canvas],
  );

  const edges = useMemo<Edge[]>(
    () =>
      canvas.edges.map((e) => ({
        id: e.edgeId,
        source: e.sourceBlockId,
        sourceHandle: e.sourceHandle,
        target: e.targetBlockId,
        targetHandle: e.targetHandle,
      })),
    [canvas.edges],
  );

  // Persist node POSITION changes back into the canvas document. We deliberately
  // ignore xyflow's dimension/select/measurement change events: applying them would
  // mint a new canvas object on every measurement tick and churn the canvas reference,
  // which re-arms the debounced autosave forever (it would never settle and save).
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges = changes.filter(
        (ch): ch is Extract<NodeChange, { type: 'position' }> =>
          ch.type === 'position' && ch.position != null,
      );
      if (positionChanges.length === 0) return;

      setCanvas((c) => {
        const posById = new Map(positionChanges.map((ch) => [ch.id, ch.position!]));
        let mutated = false;
        const blocks = c.blocks.map((b) => {
          const pos = posById.get(b.blockId);
          if (!pos || (pos.x === b.position.x && pos.y === b.position.y)) return b;
          mutated = true;
          return { ...b, position: { x: pos.x, y: pos.y } };
        });
        // Return the SAME canvas reference when nothing actually moved so consumers
        // (autosave debounce, node memo) don't see a spurious change.
        return mutated ? { ...c, blocks } : c;
      });
    },
    [setCanvas],
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
    },
    [onSelectBlock],
  );

  return (
    <div style={FLOW_CONTAINER_STYLE} data-testid="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={FLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
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
