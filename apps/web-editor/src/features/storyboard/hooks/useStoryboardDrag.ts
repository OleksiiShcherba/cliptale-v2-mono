/**
 * useStoryboardDrag — node drag styling and auto-insert-on-edge behaviours.
 *
 * Drag styling:
 *   - When a scene, music, START, or END block drag starts, dim the original
 *     moving node while React Flow applies controlled dragging:true position changes.
 *   - On drag end, restore the node's pre-drag style.
 *
 * Auto-insert on edge drop:
 *   - On `onNodeDragStop`, hit-test the dropped node centre against all
 *     existing edge midpoints.  If within HIT_TOLERANCE px, remove the
 *     hit edge and insert two new ones: source→node and node→target.
 *
 * React Flow v12 exposes drag events via `onNodeDragStart`, `onNodeDrag`,
 * `onNodeDragStop` props on <ReactFlow>.  We use those plus a mutable ref
 * (syncRefs) to read the latest nodes/edges in the stop handler without
 * stale closures.
 */

import React, { useState, useCallback, useRef } from 'react';

import type { Node, Edge, OnNodeDrag, XYPosition } from '@xyflow/react';

import {
  DRAGGED_NODE_OPACITY,
  EDGE_HIT_TOLERANCE,
  createAutoInsertEdges,
  distanceBetweenPoints,
  edgeMidpoint,
  isDragStyledNode,
  restoreNodeStyle,
  type StoryboardDragState,
} from './useStoryboardDrag.helpers';

type UseStoryboardDragArgs = {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /**
   * Called once after a node is dropped to push a history snapshot.
   * Receives the updated nodes array (with opacity restored) and current edges.
   * Providing this ensures drag-end is a first-class save trigger independent of
   * whether React Flow's `dragging:false` onNodesChange event fires correctly
   * under ghost-drag conditions.
   */
  pushSnapshot: (nodes: Node[], edges: Edge[]) => Promise<void>;
  /**
   * Called once after a node is dropped to trigger an immediate autosave.
   * Uses the same `setTimeout(() => void saveNow(), 0)` pattern as other save
   * triggers so the autosave hook reads from an up-to-date nodesRef.
   */
  saveNow: () => Promise<void>;
};

type UseStoryboardDragResult = {
  /** Non-null while a supported storyboard node is being dragged. */
  dragState: StoryboardDragState | null;
  /** Keeps internal node/edge refs up-to-date. Call this whenever nodes or edges change. */
  syncRefs: (nodes: Node[], edges: Edge[]) => void;
  /** Bind to ReactFlow `onNodeDragStart`. */
  handleNodeDragStart: OnNodeDrag;
  /** Bind to ReactFlow `onNodeDrag`. */
  handleNodeDrag: OnNodeDrag;
  /** Bind to ReactFlow `onNodeDragStop`. */
  handleNodeDragStop: OnNodeDrag;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Provides node drag event handlers that commit dropped positions for all nodes,
 * with ghost drag and edge auto-insert for scene blocks.
 */
export function useStoryboardDrag({
  setNodes,
  setEdges,
  pushSnapshot,
  saveNow,
}: UseStoryboardDragArgs): UseStoryboardDragResult {
  const [dragState, setDragState] = useState<StoryboardDragState | null>(null);

  // Mutable refs so the dragStop handler reads the latest nodes/edges
  // without being recreated on every state update.
  const edgesRef = useRef<Edge[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const originalNodeStylesRef = useRef<Map<string, React.CSSProperties | undefined>>(new Map());

  const syncRefs = useCallback((nodes: Node[], edges: Edge[]): void => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, []);

  // ── onNodeDragStart ────────────────────────────────────────────────────────

  const handleNodeDragStart: OnNodeDrag = useCallback(
    (_event, node) => {
      if (!isDragStyledNode(node)) return;

      const nodeWidth = node.measured?.width ?? 220;
      const nodeHeight = node.measured?.height ?? 120;

      if (!originalNodeStylesRef.current.has(node.id) && node.style?.opacity !== DRAGGED_NODE_OPACITY) {
        originalNodeStylesRef.current.set(node.id, node.style ? { ...node.style } : undefined);
      }

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== node.id) return n;
          if (!originalNodeStylesRef.current.has(n.id)) {
            originalNodeStylesRef.current.set(n.id, n.style ? { ...n.style } : undefined);
          }
          return { ...n, style: { ...n.style, opacity: DRAGGED_NODE_OPACITY } };
        }),
      );

      setDragState({
        node,
        clientX: 0,
        clientY: 0,
        nodeWidth,
        nodeHeight,
      });
    },
    [setNodes],
  );

  // ── onNodeDrag ─────────────────────────────────────────────────────────────

  const handleNodeDrag: OnNodeDrag = useCallback((event, node) => {
    if (!isDragStyledNode(node)) return;

    // React Flow v12 passes a native DOM event (from d3-drag's sourceEvent),
    // NOT a React synthetic event.  The TypeScript declaration says
    // React.MouseEvent but the runtime value is a raw MouseEvent / PointerEvent
    // which has no `.nativeEvent` property.  Accessing `event.nativeEvent`
    // therefore returns `undefined`, causing "Cannot read properties of
    // undefined (reading 'clientX')".
    //
    // Fix: read clientX/clientY directly from the event object — both
    // MouseEvent and PointerEvent expose these as own numeric properties.
    // We cast via `unknown` to a plain coordinate bag to stay type-safe
    // without depending on the DOM lib's MouseEvent interface.
    const ev = event as unknown as { clientX?: number; clientY?: number };
    const clientX = ev.clientX ?? 0;
    const clientY = ev.clientY ?? 0;

    setDragState((prev) =>
      prev
        ? {
            ...prev,
            node,
            clientX,
            clientY,
          }
        : null,
    );
  }, []);

  // ── onNodeDragStop ─────────────────────────────────────────────────────────

  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const isSceneBlock = node.type === 'scene-block';
      if (!isSceneBlock) {
        const droppedId = node.id;
        const droppedPosition = node.position;
        const updatedNodes: Node[] = nodesRef.current.map((n) => {
          if (n.id !== droppedId) return n;
          return {
            ...restoreNodeStyle(n, originalNodeStylesRef),
            position: droppedPosition,
          };
        });

        setNodes(() => updatedNodes);
        void pushSnapshot(updatedNodes, edgesRef.current);
        setTimeout(() => void saveNow(), 0);
        setDragState(null);
        return;
      }

      // Compute the post-drop nodes from the ref synchronously so we can pass
      // the same array to both setNodes and pushSnapshot.  nodesRef.current is
      // kept up-to-date by the syncRefs useEffect in StoryboardPage on every
      // render, so it is current as of the last React commit cycle.
      const droppedId = node.id;
      const droppedPosition = node.position;
      const updatedNodes: Node[] = nodesRef.current.map((n) => {
        if (n.id !== droppedId) return n;
        return {
          ...restoreNodeStyle(n, originalNodeStylesRef),
          position: droppedPosition,
        };
      });

      // Commit the updated state to React Flow.
      setNodes(() => updatedNodes);

      // Hit-test: dropped node centre vs. all edge midpoints.
      const droppedCentre: XYPosition = {
        x: node.position.x + (node.measured?.width ?? 0) / 2,
        y: node.position.y + (node.measured?.height ?? 0) / 2,
      };

      const currentEdges = edgesRef.current;
      const currentNodes = nodesRef.current;

      // Candidate edges: exclude any already connected to this node.
      const candidates = currentEdges.filter(
        (e) => e.source !== node.id && e.target !== node.id,
      );

      let hitEdge: Edge | null = null;
      let minDist = Infinity;

      for (const edge of candidates) {
        const mid = edgeMidpoint(edge, currentNodes);
        if (!mid) continue;
        const d = distanceBetweenPoints(droppedCentre, mid);
        if (d < EDGE_HIT_TOLERANCE && d < minDist) {
          minDist = d;
          hitEdge = edge;
        }
      }

      if (hitEdge) {
        // Auto-insert: replace the hit edge with two new edges.
        const oldEdge = hitEdge;
        const withoutOld = currentEdges.filter((e) => e.id !== oldEdge.id);
        const updatedEdges = [...withoutOld, ...createAutoInsertEdges(oldEdge, node.id)];
        setEdges(() => updatedEdges);
        void pushSnapshot(updatedNodes, updatedEdges);
      } else {
        void pushSnapshot(updatedNodes, currentEdges);
      }

      // Defence-in-depth: trigger a history snapshot and autosave directly from
      // drag-stop.  This is the authoritative save path for position changes —
      // it runs regardless of whether React Flow's own `dragging:false`
      // onNodesChange event fires. Mid-drag `dragging:true` node changes only
      // update controlled React Flow state and never persist.
      setTimeout(() => void saveNow(), 0);

      setDragState(null);
    },
    [setNodes, setEdges, pushSnapshot, saveNow],
  );

  return {
    dragState,
    syncRefs,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
  };
}
