import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createRender, getRenderStatus } from '@/features/export/api';
import { DEV_PROJECT_ID } from '@/lib/constants';
import type { RenderJob, RenderJobStatus, RenderPresetKey } from '@/features/export/types';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const exportKeys = {
  /** Polling key for a single render job — enabled only while it's active. */
  job: (jobId: string) => ['render-job', jobId] as const,
};

/** Statuses that require continued polling. */
const POLLING_STATUSES: RenderJobStatus[] = ['queued', 'processing'];

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

export type UseExportRenderResult = {
  /** Submit a new render job for the given preset. */
  startRender: (presetKey: RenderPresetKey) => Promise<void>;
  /** Whether a render is currently being submitted (before the job ID is returned). */
  isSubmitting: boolean;
  /** The job ID of the most recently submitted render (null before first submit). */
  activeJobId: string | null;
  /** Live status of the active render job — undefined until polling starts. */
  activeJob: RenderJob | undefined;
  /** Whether the render job is being polled. */
  isPolling: boolean;
  /** Error from submitting or polling. */
  error: Error | null;
  /** Reset all state (e.g. when the modal is closed). */
  reset: () => void;
};

// ---------------------------------------------------------------------------
// useExportRender
// ---------------------------------------------------------------------------

/**
 * Manages the full export lifecycle:
 * 1. Submits the render job via POST /projects/:id/renders.
 * 2. Polls GET /renders/:jobId every 3 seconds while status is queued/processing.
 * 3. Stops polling when status reaches complete or failed.
 * 4. Exposes the active job data (including downloadUrl when complete).
 */
export function useExportRender(versionId: number): UseExportRenderResult {
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Poll the active job while it is in a non-terminal status.
  const { data: activeJob, isFetching: isPolling } = useQuery({
    queryKey: activeJobId ? exportKeys.job(activeJobId) : ['render-job-idle'],
    queryFn: () => getRenderStatus(activeJobId!),
    enabled: activeJobId !== null,
    // Refresh every 3 seconds while the job is still in progress.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && POLLING_STATUSES.includes(status) ? 3_000 : false;
    },
    staleTime: 0,
  });

  const startRender = useCallback(
    async (presetKey: RenderPresetKey): Promise<void> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await createRender(DEV_PROJECT_ID, versionId, presetKey);
        setActiveJobId(response.jobId);
        // Seed the query cache with the initial queued state so the UI
        // shows progress immediately without waiting for the first poll.
        await queryClient.invalidateQueries({ queryKey: exportKeys.job(response.jobId) });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to start render'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [queryClient, versionId],
  );

  const reset = useCallback((): void => {
    setActiveJobId(null);
    setError(null);
    setIsSubmitting(false);
  }, []);

  return {
    startRender,
    isSubmitting,
    activeJobId,
    activeJob,
    isPolling,
    error,
    reset,
  };
}
