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
  /**
   * The id of the currently selected/focused scene-block node.
   * Null when no block is focused. Used by EffectsPanel to gate
   * "Apply to this scene" and by the canvas to highlight the active block.
   */
  selectedBlockId: string | null;
};

// ── Store internals ────────────────────────────────────────────────────────────

let state: StoryboardCanvasState = {
  nodes: [],
  edges: [],
  positions: {},
  selectedBlockId: null,
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
  // Preserve selectedBlockId — hydrating canvas does not change selection.
  state = { nodes, edges, positions, selectedBlockId: state.selectedBlockId };
  notify();
}

/**
 * Updates the `data.block` of a single scene-block node in-place.
 * Notifies subscribers so React Flow and autosave see the new values.
 *
 * @param blockId - The node id (= storyboard block id).
 * @param patch   - Partial block fields to merge into the existing block data.
 */
export function updateBlock(
  blockId: string,
  patch: Partial<import('../types').StoryboardBlock>,
): void {
  const nodes = state.nodes.map((n) => {
    if (n.id !== blockId) return n;
    return {
      ...n,
      data: {
        ...n.data,
        block: { ...(n.data as { block: import('../types').StoryboardBlock }).block, ...patch },
      },
    };
  });
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  state = { ...state, nodes, positions };
  notify();
}

/**
 * Removes a single scene-block node and any edges connected to it.
 * START and END nodes cannot be removed via this action — callers should guard.
 *
 * @param blockId - The node id to remove.
 */
export function removeBlock(blockId: string): void {
  const nodes = state.nodes.filter((n) => n.id !== blockId);
  const edges = state.edges.filter(
    (e) => e.source !== blockId && e.target !== blockId,
  );
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  // Clear selectedBlockId if the removed block was selected.
  const selectedBlockId = state.selectedBlockId === blockId ? null : state.selectedBlockId;
  state = { nodes, edges, positions, selectedBlockId };
  notify();
}

/**
 * Inserts a new scene-block node into the canvas state.
 * Used when "Add to Storyboard" returns a new StoryboardBlock from the API.
 *
 * @param block    - The StoryboardBlock returned by the API.
 * @param onRemove - The remove callback to wire into the node's data.
 */
export function addBlockNode(
  block: import('../types').StoryboardBlock,
  onRemove: (nodeId: string) => void,
): void {
  const newNode: import('@xyflow/react').Node = {
    id: block.id,
    type: 'scene-block',
    position: { x: block.positionX, y: block.positionY },
    data: { block, onRemove } as import('../types').SceneBlockNodeData,
    draggable: true,
    deletable: true,
  };
  const nodes = [...state.nodes, newNode];
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  state = { ...state, nodes, positions };
  notify();
}

/**
 * Sets the currently focused/selected scene-block id.
 * Called when the user clicks a scene-block node on the canvas.
 * Passing null clears the selection.
 *
 * @param blockId - The node id that is now focused, or null to deselect.
 */
export function setSelectedBlock(blockId: string | null): void {
  state = { ...state, selectedBlockId: blockId };
  notify();
}

/**
 * Applies a visual style to a single scene-block node.
 * Updates the `block.style` field of the target node in-place.
 *
 * @param blockId - The node id to update.
 * @param styleId - The style slug from STORYBOARD_STYLES (e.g. 'cyberpunk').
 */
export function applyStyleToBlock(blockId: string, styleId: string): void {
  const nodes = state.nodes.map((n) => {
    if (n.id !== blockId) return n;
    return {
      ...n,
      data: {
        ...n.data,
        block: {
          ...(n.data as { block: import('../types').StoryboardBlock }).block,
          style: styleId,
        },
      },
    };
  });
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  state = { ...state, nodes, positions };
  notify();
}

/**
 * Applies a visual style to all SCENE-type block nodes.
 * START and END sentinel nodes are skipped.
 *
 * @param styleId - The style slug from STORYBOARD_STYLES.
 */
export function applyStyleToAllBlocks(styleId: string): void {
  const nodes = state.nodes.map((n) => {
    if (n.type !== 'scene-block') return n;
    return {
      ...n,
      data: {
        ...n.data,
        block: {
          ...(n.data as { block: import('../types').StoryboardBlock }).block,
          style: styleId,
        },
      },
    };
  });
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }
  state = { ...state, nodes, positions };
  notify();
}

/**
 * Resets the store to its initial empty state.
 * Called when the storyboard page unmounts.
 */
export function resetStore(): void {
  state = { nodes: [], edges: [], positions: {}, selectedBlockId: null };
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
