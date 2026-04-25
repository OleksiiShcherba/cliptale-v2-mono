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
 * call `restoreFromSnapshot` (external store), then call `handleRestore` with
 * `{ skipSave: true }` so React Flow state is updated WITHOUT overwriting the DB.
 * The deferred autosave (30 s) will eventually write the correct restored state.
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
  /**
   * Callback returned by `useHandleRestore`. Called with `{ skipSave: true }`
   * so that the auto-restore path does NOT write back to the DB immediately.
   */
  handleRestore: (nodes: Node[], edges: Edge[], options?: { skipSave?: boolean }) => void;
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
  handleRestore,
}: UseStoryboardHistorySeedArgs): void {
  const { entries, isLoading } = useStoryboardHistoryFetch(draftId);
  const hasSeeded = useRef(false);

  useEffect(() => {
    // Wait until the history fetch has resolved and we haven't already seeded.
    if (isLoading || hasSeeded.current || entries.length === 0) return;

    hasSeeded.current = true;

    // The entries array is oldest-first; the last entry is the most recent.
    const latest = entries[entries.length - 1];

    // Apply the snapshot to the external store. This reconstructs React Flow
    // Node[] and Edge[] from the serialisable StoryboardBlock[] / StoryboardEdge[].
    // `positions` is optional on CanvasSnapshot — the cast is safe because
    // StoryboardState is a valid CanvasSnapshot subset (positions absent → fallback
    // to block.positionX/Y in restoreFromSnapshot).
    const snapshot = latest.snapshot as CanvasSnapshot;
    restoreFromSnapshot(snapshot);

    // Read back the reconstructed React Flow state and hand it to handleRestore.
    // Pass { skipSave: true } so the DB is NOT overwritten at this point — the
    // nodesRef in useStoryboardAutosave hasn't updated yet (setNodes not yet
    // propagated), and saving now would persist the pre-restore sentinel-only state.
    const { nodes: storeNodes, edges: storeEdges } = getSnapshot();
    handleRestore(storeNodes, storeEdges, { skipSave: true });
  }, [entries, isLoading, handleRestore]);
}
