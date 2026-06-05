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

import type {
  SceneBlockNodeData,
  StoryboardMusicBlock,
} from '@/features/storyboard/types';
import { toStoryboardMusicBlockSaveInputs } from '@/features/storyboard/utils/musicBlockSaveInput';

import type { StoryboardMusicSaveOverride } from './useStoryboardAutosave';

// ── Args / result ──────────────────────────────────────────────────────────────

type UseHandleRestoreArgs = {
  /** Dispatch-setter for React Flow nodes state. */
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  /** Dispatch-setter for React Flow edges state. */
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** Pushes a CanvasSnapshot onto the local undo/redo stack (async — captures thumbnail). */
  pushSnapshot: (
    nodes: Node[],
    edges: Edge[],
    options?: { musicBlocks?: StoryboardMusicBlock[] },
  ) => Promise<void>;
  /** Removes a node (and its connected edges) from React state. */
  removeNode: (nodeId: string) => void;
  /** Flushes the autosave debounce and persists immediately. */
  saveNow: (override?: StoryboardMusicSaveOverride) => Promise<void>;
  /**
   * Checkpoint push for the PRE-RESTORE checkpoint (AC-12): called with the
   * CURRENT canvas before it is replaced, so the pre-restore work stays
   * restorable. Optional — wired by StoryboardPage (T14).
   */
  pushPreRestoreCheckpoint?: (nodes: Node[], edges: Edge[]) => Promise<boolean>;
  /** True when changes are newer than the latest checkpoint (scheduler dirty). */
  hasChangesSinceLastCheckpoint?: () => boolean;
  /** Reads the canvas state as it is right now, before the restore replaces it. */
  getCurrentCanvas?: () => { nodes: Node[]; edges: Edge[] };
};

/**
 * Options for the `handleRestore` callback.
 */
type HandleRestoreOptions = {
  /**
   * When `true`, skips the `saveNow()` call at the end of the restore.
   *
   * Use this on the auto-restore path (page-load seed) to avoid overwriting the
   * DB with the pre-restore React Flow state. At the point `saveNow` would fire,
   * `nodesRef.current` in `useStoryboardAutosave` still holds the stale
   * sentinel-only state because `setNodes` hasn't propagated through the render
   * cycle yet. Skipping the save prevents oscillating DB corruption.
   *
   * Manual restores (via `StoryboardHistoryPanel`) should leave this `false` (the
   * default) so the restored state is immediately persisted to the server.
   */
  skipSave?: boolean;
  /**
   * When `true`, skips adding the restored graph as a new history entry.
   *
   * Use this for keyboard undo/redo: those actions move the existing history
   * cursor and must not create a new snapshot head.
   */
  skipSnapshot?: boolean;
  /**
   * When `true`, defers `saveNow()` until after React has had a chance to commit
   * the restored nodes/edges into local state.
   */
  deferSave?: boolean;
  /** Snapshot music blocks to persist with a manual restore or keyboard undo/redo. */
  musicBlocks?: StoryboardMusicBlock[];
};

type UseHandleRestoreResult = {
  /**
   * Callback passed as `onRestore` to `StoryboardHistoryPanel`.
   * Receives the reconstructed nodes/edges from the external store and
   * syncs them into React state with a correctly wired `onRemove` handler.
   *
   * On a MANUAL restore with changes newer than the latest checkpoint it
   * first pushes a pre-restore checkpoint of the current state (AC-12); a
   * failed push never blocks the restore. The promise resolves once the
   * restore has been applied.
   *
   * Pass `{ skipSave: true }` on the auto-restore / seed path to prevent
   * overwriting the DB with pre-restore state.
   */
  handleRestore: (
    nodes: Node[],
    edges: Edge[],
    options?: HandleRestoreOptions,
  ) => Promise<void>;
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
  pushPreRestoreCheckpoint,
  hasChangesSinceLastCheckpoint,
  getCurrentCanvas,
}: UseHandleRestoreArgs): UseHandleRestoreResult {
  const handleRestore = useCallback(
    async (nodes: Node[], edges: Edge[], options?: HandleRestoreOptions): Promise<void> => {
      // AC-12: a MANUAL restore (neither the seed path nor undo/redo) with
      // changes newer than the latest checkpoint first checkpoints the CURRENT
      // state so the pre-restore work stays restorable. The capture must finish
      // BEFORE the canvas is replaced; a failed push never blocks the restore.
      const isManualRestore = !options?.skipSave && !options?.skipSnapshot;
      if (
        isManualRestore &&
        pushPreRestoreCheckpoint &&
        getCurrentCanvas &&
        (hasChangesSinceLastCheckpoint?.() ?? false)
      ) {
        const current = getCurrentCanvas();
        try {
          await pushPreRestoreCheckpoint(current.nodes, current.edges);
        } catch {
          // Never blocks the restore (AC-12 tail).
        }
      }

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
      if (!options?.skipSnapshot) {
        void pushSnapshot(rewiredNodes, edges, { musicBlocks: options?.musicBlocks });
      }
      const musicBlocksForSave = toStoryboardMusicBlockSaveInputs(options?.musicBlocks);

      // Skip the immediate save on the auto-restore / seed path. At the point
      // saveNow would fire, nodesRef.current in useStoryboardAutosave still has
      // the pre-restore state (setNodes hasn't propagated yet), so calling it
      // would persist stale sentinel-only nodes to the DB.
      if (!options?.skipSave) {
        if (options?.deferSave) {
          setTimeout(() => void saveNow({ musicBlocks: musicBlocksForSave }), 0);
        } else {
          void saveNow({ musicBlocks: musicBlocksForSave });
        }
      }
    },
    [setNodes, setEdges, pushSnapshot, removeNode, saveNow],
  );

  return { handleRestore };
}
