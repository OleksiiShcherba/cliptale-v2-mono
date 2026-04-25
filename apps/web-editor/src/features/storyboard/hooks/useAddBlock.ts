/**
 * useAddBlock — finds the first storyboard block without an exit edge
 * and appends a new empty SCENE block immediately to its right.
 *
 * Rules:
 * 1. Scan blocks in ascending sort_order order.
 * 2. The first block whose `id` does not appear as an edge `source` is the
 *    insertion point.  START/END sentinel nodes are excluded from eligibility.
 * 3. The new block is placed 280px to the right of the insertion point,
 *    on the same Y baseline.
 * 4. The new block's default name is "SCENE N" where N = highest existing
 *    scene sort_order + 1.
 * 5. Two edges are NOT auto-created — the user must drag handles to connect.
 *    (Auto-insert on edge drop is handled by useStoryboardDrag.)
 */

import { useCallback } from 'react';

import type { Node, Edge } from '@xyflow/react';

import type { SceneBlockNodeData } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Horizontal offset applied to a newly appended block. */
const NEW_BLOCK_X_OFFSET = 280;

/** Default Y position when the canvas has no existing blocks. */
const FALLBACK_Y = 200;

/** Default X position when the canvas has no existing blocks. */
const FALLBACK_X = 60;

// ── Helper ─────────────────────────────────────────────────────────────────────

/**
 * Finds the insertion point for a new SCENE block.
 *
 * Returns the node after which the new block should be inserted.
 * Returns `null` if no suitable point exists (no scene/start nodes).
 *
 * @param nodes  Current React Flow node array.
 * @param edges  Current React Flow edge array.
 */
export function findInsertionPoint(nodes: Node[], edges: Edge[]): Node | null {
  // Build a set of node IDs that already have an exit edge (are edge sources).
  const sourceIds = new Set(edges.map((e) => e.source));

  // Filter to SCENE and START nodes only; END cannot be an insertion point.
  const eligible = nodes.filter(
    (n) => n.type === 'scene-block' || n.type === 'start',
  );

  // Sort by position X ascending (left-to-right order on canvas).
  const sorted = [...eligible].sort(
    (a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0),
  );

  // Return the first eligible node without an exit edge.
  const found = sorted.find((n) => !sourceIds.has(n.id));
  return found ?? null;
}

/**
 * Computes the next SCENE index (N) for the default block name.
 * Scans scene-block nodes whose `data.block.sortOrder` is the highest,
 * and returns that value + 1.
 *
 * Falls back to 1 when there are no scene blocks.
 */
export function nextSceneIndex(nodes: Node[]): number {
  const sceneNodes = nodes.filter((n) => n.type === 'scene-block');
  if (sceneNodes.length === 0) return 1;

  const maxOrder = Math.max(
    ...sceneNodes.map((n) => {
      const data = n.data as SceneBlockNodeData;
      return data?.block?.sortOrder ?? 0;
    }),
  );

  return maxOrder + 1;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

type UseAddBlockArgs = {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  draftId: string;
  /** Stable `onRemove` callback passed to new scene block nodes. */
  onRemoveNode: (nodeId: string) => void;
  /** Triggers an immediate autosave after the React re-render cycle completes. */
  saveNow: () => Promise<void>;
};

type UseAddBlockResult = {
  /** Appends a new SCENE block to the canvas. */
  addBlock: () => void;
};

/**
 * Provides an `addBlock` handler that appends a new empty SCENE block
 * to the React Flow node list without making any API call.
 *
 * The hook reads `nodes` and `edges` at call-time to locate the insertion
 * point and derive the next scene index.
 */
export function useAddBlock({
  nodes,
  edges,
  setNodes,
  draftId,
  onRemoveNode,
  saveNow,
}: UseAddBlockArgs): UseAddBlockResult {
  const addBlock = useCallback((): void => {
    const insertAfter = findInsertionPoint(nodes, edges);
    const sceneIndex = nextSceneIndex(nodes);

    // Compute new block position.
    const newX = insertAfter
      ? (insertAfter.position?.x ?? FALLBACK_X) + NEW_BLOCK_X_OFFSET
      : FALLBACK_X;
    const newY = insertAfter ? (insertAfter.position?.y ?? FALLBACK_Y) : FALLBACK_Y;

    // Generate a UUID immediately so the block can be persisted to the server
    // without ID reconciliation.  The server's PUT endpoint validates IDs as
    // UUIDs (z.string().uuid()), so a local-prefixed ID would fail validation.
    // crypto.randomUUID() is available in all modern browsers and in jsdom.
    const newId = crypto.randomUUID();

    const newNode: Node = {
      id: newId,
      type: 'scene-block',
      position: { x: newX, y: newY },
      data: {
        block: {
          id: newId,
          draftId,
          blockType: 'scene',
          name: `SCENE ${sceneIndex}`,
          prompt: null,
          durationS: 5,
          positionX: newX,
          positionY: newY,
          sortOrder: sceneIndex,
          style: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mediaItems: [],
        },
        onRemove: onRemoveNode,
      } satisfies SceneBlockNodeData,
      draggable: true,
      deletable: true,
    };

    setNodes((prev) => [...prev, newNode]);
    // Defer save until after React re-renders so nodesRef.current is up-to-date.
    setTimeout(() => void saveNow(), 0);
  }, [nodes, edges, setNodes, onRemoveNode, saveNow]);

  return { addBlock };
}
