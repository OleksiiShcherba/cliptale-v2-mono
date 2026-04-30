/**
 * useStoryboardDrag — ghost drag and auto-insert-on-edge behaviours.
 *
 * Ghost drag:
 *   - When a SCENE block drag starts, set `dragState` so the canvas can render
 *     a fixed-position portal clone that follows the cursor.
 *   - The dragged node's opacity is set to 0.3 (ghost) while dragging.
 *   - On drag end, restore full opacity.
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

import { BORDER } from '@/features/storyboard/components/storyboardPageStyles';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Opacity applied to the original node while it is being dragged (ghost). */
const GHOST_OPACITY = 0.3;

/**
 * Pixel radius around an edge midpoint within which a dropped node centre
 * is considered "on" that edge and triggers auto-insert.
 */
const EDGE_HIT_TOLERANCE = 40;

// ── Types ──────────────────────────────────────────────────────────────────────

export type GhostDragState = {
  /** Node currently being dragged. */
  node: Node;
  /** Current cursor X in viewport pixels. */
  clientX: number;
  /** Current cursor Y in viewport pixels. */
  clientY: number;
  /** Width of the dragged node (px) — used to size the portal clone. */
  nodeWidth: number;
  /** Height of the dragged node (px) — used to size the portal clone. */
  nodeHeight: number;
};

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
  /** Non-null while a SCENE node is being dragged. Render a portal clone using this. */
  dragState: GhostDragState | null;
  /** Keeps internal node/edge refs up-to-date. Call this whenever nodes or edges change. */
  syncRefs: (nodes: Node[], edges: Edge[]) => void;
  /** Bind to ReactFlow `onNodeDragStart`. */
  handleNodeDragStart: OnNodeDrag;
  /** Bind to ReactFlow `onNodeDrag`. */
  handleNodeDrag: OnNodeDrag;
  /** Bind to ReactFlow `onNodeDragStop`. */
  handleNodeDragStop: OnNodeDrag;
};

// ── Edge midpoint helpers ──────────────────────────────────────────────────────

/**
 * Returns the canvas-space midpoint of an edge.
 * Uses node position + half measured size to approximate node centre.
 */
function edgeMidpoint(edge: Edge, nodes: Node[]): XYPosition | null {
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  if (!source || !target) return null;

  const sx = source.position.x + (source.measured?.width ?? 0) / 2;
  const sy = source.position.y + (source.measured?.height ?? 0) / 2;
  const tx = target.position.x + (target.measured?.width ?? 0) / 2;
  const ty = target.position.y + (target.measured?.height ?? 0) / 2;

  return { x: (sx + tx) / 2, y: (sy + ty) / 2 };
}

/** Euclidean distance between two 2-D points. */
function dist(a: XYPosition, b: XYPosition): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Provides node drag event handlers that implement ghost drag and edge
 * auto-insert for the storyboard canvas.
 */
export function useStoryboardDrag({
  setNodes,
  setEdges,
  pushSnapshot,
  saveNow,
}: UseStoryboardDragArgs): UseStoryboardDragResult {
  const [dragState, setDragState] = useState<GhostDragState | null>(null);

  // Mutable refs so the dragStop handler reads the latest nodes/edges
  // without being recreated on every state update.
  const edgesRef = useRef<Edge[]>([]);
  const nodesRef = useRef<Node[]>([]);

  const syncRefs = useCallback((nodes: Node[], edges: Edge[]): void => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, []);

  // ── onNodeDragStart ────────────────────────────────────────────────────────

  const handleNodeDragStart: OnNodeDrag = useCallback(
    (_event, node) => {
      // Ghost drag only applies to SCENE blocks.
      if (node.type !== 'scene-block') return;

      const nodeWidth = node.measured?.width ?? 220;
      const nodeHeight = node.measured?.height ?? 120;

      // Dim the original node to 30% opacity (ghost).
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? { ...n, style: { ...n.style, opacity: GHOST_OPACITY } }
            : n,
        ),
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
    if (node.type !== 'scene-block') return;

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
      if (node.type !== 'scene-block') {
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
        const { opacity: _removed, ...restStyle } = (n.style ?? {}) as Record<string, unknown>;
        return {
          ...n,
          // Restore opacity and commit the final dropped position.
          style: restStyle as React.CSSProperties,
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
        const d = dist(droppedCentre, mid);
        if (d < EDGE_HIT_TOLERANCE && d < minDist) {
          minDist = d;
          hitEdge = edge;
        }
      }

      if (hitEdge) {
        // Auto-insert: replace the hit edge with two new edges.
        const oldEdge = hitEdge;
        setEdges((prev) => {
          const withoutOld = prev.filter((e) => e.id !== oldEdge.id);
          const edgeStyle = { stroke: BORDER, strokeWidth: 2 };
          const newEdge1: Edge = {
            id: crypto.randomUUID(),
            source: oldEdge.source,
            sourceHandle: 'exit',
            target: node.id,
            targetHandle: 'income',
            style: edgeStyle,
          };
          const newEdge2: Edge = {
            id: crypto.randomUUID(),
            source: node.id,
            sourceHandle: 'exit',
            target: oldEdge.target,
            targetHandle: 'income',
            style: edgeStyle,
          };
          return [...withoutOld, newEdge1, newEdge2];
        });
      }

      // Defence-in-depth: trigger a history snapshot and autosave directly from
      // drag-stop.  This is the authoritative save path for position changes —
      // it runs regardless of whether React Flow's own `dragging:false`
      // onNodesChange event fires (which can be unreliable under ghost-drag with
      // the original node at 30% opacity).
      void pushSnapshot(updatedNodes, currentEdges);
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
