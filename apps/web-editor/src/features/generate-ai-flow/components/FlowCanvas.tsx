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
import type { Node, Edge, Connection, NodeChange } from '@xyflow/react';
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
} & Pick<UseFlowCanvasOptions, 'onEdgesPruned' | 'onConnectionRejected'>;

function InnerFlowCanvas({
  initialCanvas,
  onEdgesPruned,
  onConnectionRejected,
  onCanvasReady,
}: FlowCanvasProps): React.ReactElement {
  const controller = useFlowCanvas({ initialCanvas, onEdgesPruned, onConnectionRejected });
  const { canvas, setCanvas, connect, isValidConnection } = controller;

  React.useEffect(() => {
    onCanvasReady?.(controller);
    // controller identity is stable enough for a ready callback; re-run on canvas changes
    // so consumers always have a fresh serialize().
  }, [controller, onCanvasReady]);

  // ── Map the canvas document → xyflow nodes/edges ────────────────────────────
  const nodes = useMemo<Node[]>(
    () =>
      canvas.blocks.map((block) => ({
        id: block.blockId,
        type: block.type,
        position: block.position,
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

  // Persist node position changes back into the canvas document.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setCanvas((c) => {
        const applied = applyNodeChanges(
          changes,
          c.blocks.map((b) => ({ id: b.blockId, type: b.type, position: b.position, data: {} })),
        );
        const posById = new Map(applied.map((n) => [n.id, n.position]));
        return {
          ...c,
          blocks: c.blocks.map((b) => {
            const pos = posById.get(b.blockId);
            return pos ? { ...b, position: { x: pos.x, y: pos.y } } : b;
          }),
        };
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

  return (
    <div style={FLOW_CONTAINER_STYLE} data-testid="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={FLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
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
