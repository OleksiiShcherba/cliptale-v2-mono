/**
 * useStoryboardHistorySeed — seeds the in-memory undo/redo stack from server
 * history and auto-restores the most recent snapshot into the canvas on mount.
 *
 * Called once when the storyboard page finishes loading and the server history
 * has resolved. Subsequent re-fetches within the React Query stale window are
 * ignored via the `seededRef` guard.
 *
 * Steps performed on first successful load:
 *  1. `loadServerHistory(entries)` — seeds the undo/redo stack so keyboard
 *     undo/redo works across browser sessions.
 *  2. `restoreFromSnapshot(mostRecent.snapshot)` — applies the latest snapshot
 *     to the external canvas store.
 *  3. `handleRestore(nodes, edges)` — bridges the store state back into React
 *     Flow so the canvas re-renders with the restored graph.
 */

import { useEffect, useRef } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { loadServerHistory } from '../store/storyboard-history-store';
import { restoreFromSnapshot, getSnapshot } from '../store/storyboard-store';
import { useStoryboardHistoryFetch } from './useStoryboardHistoryFetch';

// ── Args ───────────────────────────────────────────────────────────────────────

type UseStoryboardHistorySeedArgs = {
  /** The generation draft ID — passed through to `useStoryboardHistoryFetch`. */
  draftId: string;
  /** True while the canvas initial fetch is still in-flight. */
  isCanvasLoading: boolean;
  /**
   * Callback that bridges store-restored nodes/edges back into React Flow state.
   * Provided by `useHandleRestore` from `StoryboardPage`.
   */
  handleRestore: (nodes: Node[], edges: Edge[]) => void;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fetches server history snapshots and seeds the in-memory undo/redo stack,
 * then auto-restores the most recent snapshot into the canvas on initial load.
 *
 * @param draftId         - Generation draft ID.
 * @param isCanvasLoading - Canvas loading state from `useStoryboardCanvas`.
 * @param handleRestore   - Restore bridge from `useHandleRestore`.
 */
export function useStoryboardHistorySeed({
  draftId,
  isCanvasLoading,
  handleRestore,
}: UseStoryboardHistorySeedArgs): void {
  const { entries, isLoading: isHistoryLoading } = useStoryboardHistoryFetch(draftId);

  // Guard: seed at most once per page lifecycle.
  const seededRef = useRef(false);

  useEffect(() => {
    // Wait until both the canvas and the history fetch have completed.
    if (isCanvasLoading || isHistoryLoading) return;
    // Only seed once per page lifecycle.
    if (seededRef.current) return;
    if (!entries.length) return;

    seededRef.current = true;

    // Seed the in-memory undo/redo stack from server snapshots.
    loadServerHistory(entries);

    // Auto-restore the most recent snapshot (last entry = newest) into the canvas.
    const mostRecent = entries[entries.length - 1];
    restoreFromSnapshot(mostRecent.snapshot);

    // Bridge the restored store state back into React Flow so the canvas re-renders.
    const { nodes, edges } = getSnapshot();
    handleRestore(nodes, edges);
  }, [isCanvasLoading, isHistoryLoading, entries, handleRestore]);
}
