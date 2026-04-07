import { useQuery } from '@tanstack/react-query';

import { listRenders } from '@/features/export/api';
import type { RenderJob, RenderJobStatus } from '@/features/export/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses that require continued polling. */
const POLLING_STATUSES: RenderJobStatus[] = ['queued', 'processing'];

/** How often to re-fetch while at least one job is active (ms). */
const POLL_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const listRendersKeys = {
  list: (projectId: string) => ['renders-list', projectId] as const,
};

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

export type UseListRendersResult = {
  /** All render jobs for the project, newest first. */
  renders: RenderJob[];
  /** Whether the list is currently being fetched. */
  isLoading: boolean;
  /** Error from fetching the list. */
  error: Error | null;
  /** Count of jobs that are currently queued or processing. */
  activeCount: number;
};

// ---------------------------------------------------------------------------
// useListRenders
// ---------------------------------------------------------------------------

/**
 * Fetches and polls the list of all render jobs for a project.
 *
 * Polls every 5 seconds while at least one job is queued or processing.
 * Stops polling when all jobs are in a terminal state (complete/failed).
 */
export function useListRenders(projectId: string): UseListRendersResult {
  const { data, isLoading, error } = useQuery({
    queryKey: listRendersKeys.list(projectId),
    queryFn: () => listRenders(projectId),
    // Only fetch when we have a real project ID.
    enabled: projectId !== '',
    // Poll while any job is still active.
    refetchInterval: (query) => {
      const renders = query.state.data;
      if (!renders) return false;
      const hasActive = renders.some((r) => POLLING_STATUSES.includes(r.status));
      return hasActive ? POLL_INTERVAL_MS : false;
    },
    staleTime: 0,
  });

  const renders = data ?? [];
  const activeCount = renders.filter((r) => POLLING_STATUSES.includes(r.status)).length;

  return {
    renders,
    isLoading,
    error: error instanceof Error ? error : error != null ? new Error(String(error)) : null,
    activeCount,
  };
}
