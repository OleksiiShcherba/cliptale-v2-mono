import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RealtimeAiJobEvent, RealtimeSubscribeMessage } from '@ai-video-editor/project-schema';

import { getJobStatus } from '@/shared/ai-generation/api';
import type { AiGenerationJob, AiJobStatus } from '@/shared/ai-generation/types';
import { useRealtimeSubscription } from '@/shared/hooks/useRealtimeSubscription';

/** Return type for the useJobPolling hook. */
export type UseJobPollingResult = {
  /** Latest job state from the server snapshot or realtime event. */
  job: AiGenerationJob | null;
  /** Whether a realtime subscription is currently active for a non-terminal job. */
  isPolling: boolean;
};

const TERMINAL_STATUSES = new Set<AiJobStatus>(['completed', 'failed']);

function isTerminalStatus(status: AiJobStatus | null | undefined): boolean {
  return status ? TERMINAL_STATUSES.has(status) : false;
}

function isAiJobStatus(value: unknown): value is AiJobStatus {
  return value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed';
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function applyJobUpdate(
  previous: AiGenerationJob | null,
  next: AiGenerationJob,
): AiGenerationJob {
  if (
    previous?.jobId === next.jobId &&
    isTerminalStatus(previous.status) &&
    !isTerminalStatus(next.status)
  ) {
    return previous;
  }
  return next;
}

function jobFromRealtimeEvent(
  event: RealtimeAiJobEvent,
  previous: AiGenerationJob | null,
): AiGenerationJob | null {
  const payload = event.payload;
  const status = payload['status'];
  if (!isAiJobStatus(status)) return null;

  return {
    jobId: event.jobId,
    status,
    progress: numberOrDefault(payload['progress'], previous?.progress ?? 0),
    resultAssetId: nullableString(payload['resultAssetId']) ??
      nullableString(payload['outputFileId']) ??
      previous?.resultAssetId ??
      null,
    errorMessage: nullableString(payload['errorMessage']),
  };
}

/**
 * Subscribes to realtime AI job updates while the job is `queued` or `processing`.
 *
 * A single GET snapshot is used on subscription start and reconnect to cover
 * events emitted before the socket is ready. Repeated timed status checks are
 * intentionally not used.
 */
export function useJobPolling(
  jobId: string | null,
  initialJob: AiGenerationJob | null = null,
): UseJobPollingResult {
  const [job, setJob] = useState<AiGenerationJob | null>(null);

  const subscriptionMessage = useMemo<RealtimeSubscribeMessage | null>(() => (
    jobId && !isTerminalStatus(job?.status)
      ? { type: 'subscribe', scope: 'ai-job', jobId }
      : null
  ), [job?.status, jobId]);

  const refreshSnapshot = useCallback(() => {
    if (!jobId) {
      return undefined;
    }

    let active = true;
    void getJobStatus(jobId)
      .then((data) => {
        if (!active) return;
        setJob((previous) => applyJobUpdate(previous, data));
      })
      .catch(() => {
        // Transient snapshot errors are covered by the active websocket stream.
      });

    return () => {
      active = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return undefined;
    }

    setJob(initialJob);
    return refreshSnapshot();
  }, [initialJob, jobId, refreshSnapshot]);

  useRealtimeSubscription(subscriptionMessage, {
    enabled: subscriptionMessage !== null,
    onEvent: (event) => {
      if (event.type !== 'ai.job.updated' || event.jobId !== jobId) return;
      setJob((previous) => {
        const next = jobFromRealtimeEvent(event, previous);
        return next ? applyJobUpdate(previous, next) : previous;
      });
    },
    onReconnect: () => {
      refreshSnapshot();
    },
  });

  return { job, isPolling: subscriptionMessage !== null };
}
