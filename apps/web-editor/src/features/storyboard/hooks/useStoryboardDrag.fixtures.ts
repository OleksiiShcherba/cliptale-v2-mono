/**
 * Shared test fixtures for useStoryboardDrag tests.
 */

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardDrag } from './useStoryboardDrag';

// ── Node / edge builders ───────────────────────────────────────────────────────

export function makeSceneNode(
  id: string,
  x: number,
  y = 200,
  width = 220,
  height = 120,
): Node {
  return {
    id,
    type: 'scene-block',
    position: { x, y },
    measured: { width, height },
    data: {},
  };
}

export function makeEdge(source: string, target: string): Edge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
  };
}

// ── Event-fire helpers ─────────────────────────────────────────────────────────

/** Simulates firing handleNodeDragStart with a given node. */
export function fireDragStart(
  handler: ReturnType<typeof useStoryboardDrag>['handleNodeDragStart'],
  node: Node,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler({} as any, node, []);
}

/** Simulates firing handleNodeDrag with cursor coords. */
export function fireDrag(
  handler: ReturnType<typeof useStoryboardDrag>['handleNodeDrag'],
  node: Node,
  clientX: number,
  clientY: number,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler({ clientX, clientY } as any, node, []);
}

/** Simulates firing handleNodeDragStop with a given node. */
export function fireDragStop(
  handler: ReturnType<typeof useStoryboardDrag>['handleNodeDragStop'],
  node: Node,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler({} as any, node, []);
}

// ── UUID v4 regex ──────────────────────────────────────────────────────────────

/**
 * Strict RFC 4122 v4 UUID pattern.
 * Rejects strings that are merely 36 characters of hex-and-hyphens.
 */
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
