import { useState, useEffect, useRef } from 'react';

import { getJobStatus } from '@/features/ai-generation/api';
import type { AiGenerationJob } from '@/features/ai-generation/types';

const POLL_INTERVAL_MS = 2500;

/** Return type for the useJobPolling hook. */
export type UseJobPollingResult = {
  /** Latest job state from the server, or null before first poll. */
  job: AiGenerationJob | null;
  /** Whether the polling interval is currently active. */
  isPolling: boolean;
};

/**
 * Polls GET /ai/jobs/:jobId every 2.5 s while the job is `queued` or `processing`.
 *
 * Stops automatically when the job reaches a terminal state (`completed` or `failed`).
 * Cleans up the interval on unmount or when jobId changes.
 * Follows the `useAssetPolling` pattern — ref-based callbacks, setInterval, active flag.
 */
export function useJobPolling(jobId: string | null): UseJobPollingResult {
  const [job, setJob] = useState<AiGenerationJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const jobRef = useRef(job);
  useEffect(() => {
    jobRef.current = job;
  });

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setIsPolling(false);
      return;
    }

    let active = true;
    setIsPolling(true);

    const poll = async () => {
      try {
        const data = await getJobStatus(jobId);
        if (!active) return;
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') {
          active = false;
          setIsPolling(false);
        }
      } catch {
        // transient network error — keep polling until next interval
      }
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(id);
      setIsPolling(false);
    };
  }, [jobId]);

  return { job, isPolling };
}
