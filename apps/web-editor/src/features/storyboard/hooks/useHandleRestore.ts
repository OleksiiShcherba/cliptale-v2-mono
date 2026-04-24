/**
 * useHandleRestore — wraps the history-restore flow for StoryboardPage.
 *
 * When `StoryboardHistoryPanel` calls `onRestore(nodes, edges)`, the nodes
 * received from the external store have `onRemove: () => undefined` as a
 * placeholder (set by `restoreFromSnapshot`). This hook re-wires the
 * `onRemove` callback for every scene-block node before committing to React
 * state, so node deletion works immediately after a restore.
 *
 * After re-wiring:
 * 1. Calls `setNodes(rewiredNodes)` — updates React Flow canvas.
 * 2. Calls `setEdges(edges)` — updates React Flow edges.
 * 3. Calls `pushSnapshot(rewiredNodes, edges)` — adds an undo entry so the
 *    restored state becomes the new head of the local history stack.
 * 4. Calls `void saveNow()` — immediately persists the restored state to the
 *    server, bypassing the 30 s autosave debounce.
 *
 * Extracted from `StoryboardPage` to keep that file at the 300-line cap.
 */

import { useCallback } from 'react';

import type { Node, Edge } from '@xyflow/react';

import type { SceneBlockNodeData } from '../types';

// ── Args / result ──────────────────────────────────────────────────────────────

type UseHandleRestoreArgs = {
  /** Dispatch-setter for React Flow nodes state. */
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  /** Dispatch-setter for React Flow edges state. */
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** Pushes a CanvasSnapshot onto the local undo/redo stack. */
  pushSnapshot: (nodes: Node[], edges: Edge[]) => void;
  /** Removes a node (and its connected edges) from React state. */
  removeNode: (nodeId: string) => void;
  /** Flushes the autosave debounce and persists immediately. */
  saveNow: () => Promise<void>;
};

type UseHandleRestoreResult = {
  /**
   * Callback passed as `onRestore` to `StoryboardHistoryPanel`.
   * Receives the reconstructed nodes/edges from the external store and
   * syncs them into React state with a correctly wired `onRemove` handler.
   */
  handleRestore: (nodes: Node[], edges: Edge[]) => void;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Returns a stable `handleRestore` callback that bridges the history-restore
 * external store update back into React Flow state.
 */
export function useHandleRestore({
  setNodes,
  setEdges,
  pushSnapshot,
  removeNode,
  saveNow,
}: UseHandleRestoreArgs): UseHandleRestoreResult {
  const handleRestore = useCallback(
    (nodes: Node[], edges: Edge[]): void => {
      // Re-wire onRemove for scene-block nodes. restoreFromSnapshot sets it to
      // `() => undefined` as a placeholder — replace with the real removeNode.
      const rewiredNodes = nodes.map((node) => {
        if (node.type !== 'scene-block') return node;
        return {
          ...node,
          data: {
            ...(node.data as SceneBlockNodeData),
            onRemove: removeNode,
          } satisfies SceneBlockNodeData,
        };
      });

      setNodes(rewiredNodes);
      setEdges(edges);
      pushSnapshot(rewiredNodes, edges);
      void saveNow();
    },
    [setNodes, setEdges, pushSnapshot, removeNode, saveNow],
  );

  return { handleRestore };
}
