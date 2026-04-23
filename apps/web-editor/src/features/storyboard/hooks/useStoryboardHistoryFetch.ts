/**
 * useStoryboardHistoryFetch — React Query hook for loading server-persisted
 * storyboard history snapshots.
 *
 * The query is enabled only when `draftId` is non-empty. Stale time is 30 s
 * so navigating back to the panel does not trigger a refetch within that window.
 */

import { useQuery } from '@tanstack/react-query';

import { fetchHistorySnapshots } from '../api';
import type { StoryboardHistorySnapshot } from '../api';

// ── Types ──────────────────────────────────────────────────────────────────────

export type UseStoryboardHistoryFetchResult = {
  /** The list of history entries from the server (newest last). */
  entries: StoryboardHistorySnapshot[];
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** True when the query has entered an error state. */
  isError: boolean;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fetches the last 50 server-persisted storyboard snapshots for `draftId`.
 *
 * Returns `entries`, `isLoading`, and `isError` — consumers should handle all
 * three states before rendering the entry list.
 *
 * @param draftId - The generation draft ID. The query is disabled when empty.
 */
export function useStoryboardHistoryFetch(draftId: string): UseStoryboardHistoryFetchResult {
  const { data, isLoading, isError } = useQuery<StoryboardHistorySnapshot[]>({
    queryKey: ['storyboard-history', draftId],
    queryFn: () => fetchHistorySnapshots(draftId),
    staleTime: 30_000,
    enabled: !!draftId,
  });

  return {
    entries: data ?? [],
    isLoading,
    isError,
  };
}
