import type { CSSProperties, MutableRefObject } from 'react';

import type { Edge, Node, XYPosition } from '@xyflow/react';

import { BORDER } from '@/features/storyboard/components/storyboardPageStyles';

/** Opacity applied to the original node while it is being dragged. */
export const DRAGGED_NODE_OPACITY = 0.3;

/**
 * Pixel radius around an edge midpoint within which a dropped node centre
 * is considered "on" that edge and triggers auto-insert.
 */
export const EDGE_HIT_TOLERANCE = 40;

/** Runtime state tracked while React Flow is dragging a supported storyboard node. */
export type StoryboardDragState = {
  /** Node currently being dragged. */
  node: Node;
  /** Current cursor X in viewport pixels. */
  clientX: number;
  /** Current cursor Y in viewport pixels. */
  clientY: number;
  /** Width of the dragged node (px). */
  nodeWidth: number;
  /** Height of the dragged node (px). */
  nodeHeight: number;
};

/** Returns the canvas-space midpoint of an edge using measured node centres. */
export function edgeMidpoint(edge: Edge, nodes: Node[]): XYPosition | null {
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
export function distanceBetweenPoints(a: XYPosition, b: XYPosition): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Returns true for storyboard nodes that receive drag opacity styling. */
export function isDragStyledNode(node: Node): boolean {
  return (
    node.type === 'scene-block' ||
    node.type === 'music-block' ||
    node.type === 'start' ||
    node.type === 'end'
  );
}

/** Restores the pre-drag style for a node, falling back to removing opacity. */
export function restoreNodeStyle(
  node: Node,
  originalStyles: MutableRefObject<Map<string, CSSProperties | undefined>>,
): Node {
  if (originalStyles.current.has(node.id)) {
    const originalStyle = originalStyles.current.get(node.id);
    originalStyles.current.delete(node.id);
    return {
      ...node,
      style: originalStyle ? { ...originalStyle } : {},
    };
  }

  const { opacity: _removed, ...restStyle } = (node.style ?? {}) as Record<string, unknown>;
  return {
    ...node,
    style: restStyle as CSSProperties,
  };
}

/** Creates the two replacement edges used when a scene is dropped on an edge. */
export function createAutoInsertEdges(oldEdge: Edge, nodeId: string): Edge[] {
  const edgeStyle = { stroke: BORDER, strokeWidth: 2 };
  return [
    {
      id: crypto.randomUUID(),
      source: oldEdge.source,
      sourceHandle: 'exit',
      target: nodeId,
      targetHandle: 'income',
      style: edgeStyle,
    },
    {
      id: crypto.randomUUID(),
      source: nodeId,
      sourceHandle: 'exit',
      target: oldEdge.target,
      targetHandle: 'income',
      style: edgeStyle,
    },
  ];
}
