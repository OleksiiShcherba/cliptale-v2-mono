/**
 * storyboard-store — hand-rolled external store for the storyboard canvas state.
 *
 * Holds the canonical { blocks, edges, positions } state shared by the canvas,
 * autosave hook, and history store. Uses `useSyncExternalStore` for React
 * subscriptions — no Zustand, no Redux.
 *
 * Design: a single module-level state object mutated via exported setters.
 * Subscribers (React components, hooks) are notified synchronously after each
 * mutation and re-read the state via `getSnapshot()`.
 */

import { useSyncExternalStore } from 'react';

import type { Node, Edge } from '@xyflow/react';

// ── Types ──────────────────────────────────────────────────────────────────────

/** The canonical storyboard canvas state tracked by this store. */
export type StoryboardCanvasState = {
  /** React Flow nodes (includes START, END, and SCENE nodes). */
  nodes: Node[];
  /** React Flow edges between nodes. */
  edges: Edge[];
  /**
   * Position map: nodeId → { x, y }. Mirrors node positions but is kept
   * separately so snapshots can omit React-Flow-specific node metadata.
   */
  positions: Record<string, { x: number; y: number }>;
};

// ── Store internals ────────────────────────────────────────────────────────────

let state: StoryboardCanvasState = {
  nodes: [],
  edges: [],
  positions: {},
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to store changes.
 * Returns an unsubscribe function — pass directly to `useSyncExternalStore`.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the current store snapshot.
 * Pass directly to `useSyncExternalStore` as `getSnapshot`.
 * The same reference is returned until `setState` is called.
 */
export function getSnapshot(): StoryboardCanvasState {
  return state;
}

/**
 * Replaces the entire store state and notifies subscribers.
 * Called by history undo/redo to restore a previous snapshot.
 */
export function setState(next: StoryboardCanvasState): void {
  state = next;
  notify();
}

/**
 * Updates only the nodes, rebuilding the positions map from node positions.
 * Does NOT notify — caller should call `setState` or use `setNodes`/`setEdges`.
 */
export function setNodes(nodes: Node[]): void {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  state = { ...state, nodes, positions };
  notify();
}

/**
 * Updates only the edges.
 */
export function setEdges(edges: Edge[]): void {
  state = { ...state, edges };
  notify();
}

/**
 * Updates both nodes and edges atomically (used on canvas hydration).
 * Rebuilds positions map from node positions.
 */
export function setCanvasState(nodes: Node[], edges: Edge[]): void {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  state = { nodes, edges, positions };
  notify();
}

/**
 * Resets the store to its initial empty state.
 * Called when the storyboard page unmounts.
 */
export function resetStore(): void {
  state = { nodes: [], edges: [], positions: {} };
  // Do not notify — callers who need a reset are typically unmounting.
}

// ── React hook ─────────────────────────────────────────────────────────────────

/**
 * Returns the current storyboard canvas state and re-renders the component
 * whenever it changes.
 *
 * Use this hook inside React components that need to read canvas state.
 * For writing state, use the exported setters directly.
 */
export function useStoryboardStore(): StoryboardCanvasState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
