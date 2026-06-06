/**
 * useStoryboardHistorySeed — auto-restores the most recent server-persisted
 * history snapshot onto the canvas on page load.
 *
 * Problem: the canvas hydrates from `GET /storyboards/:draftId` which returns
 * the raw DB state. If the DB was corrupted by a prior premature `saveNow`
 * (which wrote sentinel-only state), the hydrated canvas shows only START/END.
 * The user's actual scene blocks exist only in the history log.
 *
 * Solution: after the history entries are fetched, take the latest snapshot,
 * and restore it only when it recovers scene blocks missing from the server
 * canvas. History is not authoritative when the server state already contains
 * the same or more scene blocks, because history persistence can lag behind
 * `PUT /storyboards`.
 *
 * Guard: only fires once per mount (`hasSeeded` ref). Re-renders caused by
 * query state updates do not trigger repeated restores.
 *
 * Caller: `StoryboardPage` after `useStoryboardCanvas` and `useHandleRestore` are
 * both initialised, and after `initHistoryStore` has been called for the draft.
 */

import { useEffect, useRef } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { useStoryboardHistoryFetch } from './useStoryboardHistoryFetch';
import { restoreFromSnapshot, getSnapshot } from '../store/storyboard-store';
import type { CanvasSnapshot } from '../store/storyboard-history-store';

// ── Args ───────────────────────────────────────────────────────────────────────

type UseStoryboardHistorySeedArgs = {
  /** The generation draft ID used to fetch history snapshots. */
  draftId: string;
  /** React Flow nodes hydrated from the current storyboard endpoint. */
  currentNodes: Node[];
  /** True while the current storyboard endpoint is still hydrating the canvas. */
  canvasIsLoading: boolean;
  /**
   * Callback returned by `useHandleRestore`. The auto-restore path must not
   * write back to the DB immediately or create a synthetic history entry.
   */
  handleRestore: (
    nodes: Node[],
    edges: Edge[],
    options?: { skipSave?: boolean; skipSnapshot?: boolean },
  ) => void;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Applies the most recent server-persisted history snapshot to the canvas when
 * the history entries first become available after page load.
 *
 * If there are no history entries, or if the fetch is still in flight, this hook
 * is a no-op. It fires at most once per mount (guarded by a `hasSeeded` ref).
 *
 * @param draftId       - The draft whose history is fetched.
 * @param handleRestore - The restore callback from `useHandleRestore`.
 */
export function useStoryboardHistorySeed({
  draftId,
  currentNodes,
  canvasIsLoading,
  handleRestore,
}: UseStoryboardHistorySeedArgs): void {
  const { entries, isLoading } = useStoryboardHistoryFetch(draftId);
  const hasSeeded = useRef(false);

  useEffect(() => {
    if (isLoading || canvasIsLoading || hasSeeded.current || entries.length === 0) return;

    // Checkpoint-only model (T14): entries come straight from the server
    // (newest first) — no optimistic per-change rows are appended any more, so
    // pick the most recent entry explicitly instead of relying on array order.
    const latest = entries.reduce((newest, entry) =>
      new Date(entry.createdAt).getTime() > new Date(newest.createdAt).getTime()
        ? entry
        : newest,
    );
    const latestSceneCount = latest.snapshot.blocks.filter((block) => block.blockType === 'scene').length;
    const currentSceneCount = currentNodes.filter((node) => node.type === 'scene-block').length;

    hasSeeded.current = true;

    if (currentSceneCount >= latestSceneCount) return;

    // Apply the snapshot to the external store. This reconstructs React Flow
    // Node[] and Edge[] from the serialisable StoryboardBlock[] / StoryboardEdge[].
    // `positions` is optional on CanvasSnapshot — the cast is safe because
    // StoryboardState is a valid CanvasSnapshot subset (positions absent → fallback
    // to block.positionX/Y in restoreFromSnapshot).
    const snapshot = latest.snapshot as CanvasSnapshot;
    restoreFromSnapshot(snapshot);

    // Read back the reconstructed React Flow state and hand it to handleRestore.
    // The auto-seed path is recovery glue, not a user action: do not write back
    // immediately and do not add another history entry.
    const { nodes: storeNodes, edges: storeEdges } = getSnapshot();
    handleRestore(storeNodes, storeEdges, { skipSave: true, skipSnapshot: true });
  }, [entries, isLoading, canvasIsLoading, currentNodes, handleRestore]);
}
