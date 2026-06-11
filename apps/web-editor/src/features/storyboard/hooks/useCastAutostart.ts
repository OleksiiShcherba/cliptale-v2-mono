/**
 * useCastAutostart — owns the Step-2 cast-extraction auto-start lifecycle
 * (reference-generation-autostart §4 choice 2; AC-01, AC-05).
 *
 * One TanStack Query entry (`['cast-extraction', draftId]`) is the single source
 * of truth for extraction state; both the auto path and the manual control read
 * it. On mount the hook runs the existence check and, finding no extraction,
 * issues exactly one silent start. A per-draft in-flight guard suppresses the
 * redundant POST on re-mount and prevents an auto-retry after a failed start
 * (failed auto-start is recovered only via the manual control — AC-07, OQ-1).
 * The server's idempotent start (ADR-0001) is the actual correctness mechanism.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { startCastExtraction, getLatestCastExtraction } from '@/features/storyboard/api';
import type { CastExtractionJob } from '../components/CastConfirmModal';

const POLL_INTERVAL_MS = 3000;

/**
 * Per-draft, per-session auto-start guard. Once auto-start has been attempted
 * for a draft we never auto-issue a second POST — not during the in-flight
 * window of a re-mount, nor as an auto-retry after a failed attempt. The manual
 * control is a separate path and is intentionally not gated by this guard.
 */
const attemptedAutostart = new Set<string>();

/** Test-only: clear the module-level auto-start guard between cases. */
export function __resetCastAutostartGuard(): void {
  attemptedAutostart.clear();
}

export function castExtractionQueryKey(draftId: string) {
  return ['cast-extraction', draftId] as const;
}

/**
 * Polling cadence for the extraction query: poll every 3s while the job is
 * non-terminal (queued/running); stop (false) once it is terminal
 * (completed/failed) or absent.
 */
export function castPollInterval(
  data: CastExtractionJob | null | undefined,
): number | false {
  if (!data) return false;
  return data.status === 'completed' || data.status === 'failed'
    ? false
    : POLL_INTERVAL_MS;
}

export function useCastAutostart(draftId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: castExtractionQueryKey(draftId),
    queryFn: () => getLatestCastExtraction(draftId),
    refetchInterval: (q) => castPollInterval(q.state.data),
  });

  const { isPending, data } = query;

  useEffect(() => {
    if (isPending) return; // wait for the existence check to resolve (AC-05)
    if (data) return; // an extraction already exists → no-op
    if (attemptedAutostart.has(draftId)) return; // in-flight / once guard
    attemptedAutostart.add(draftId);

    void startCastExtraction(draftId)
      .then((accepted) => {
        queryClient.setQueryData<CastExtractionJob>(castExtractionQueryKey(draftId), {
          jobId: accepted.jobId,
          draftId,
          status: accepted.status,
          proposal: null,
          aggregateEstimateCredits: null,
          errorMessage: null,
        });
      })
      .catch(() => {
        // Failed auto-start: swallow silently, no auto-retry — the Creator
        // recovers via the manual control (spec §1¶4, AC-07).
      });
  }, [isPending, data, draftId, queryClient]);

  return query;
}
