/**
 * useEnhancePrompt — AI Enhance flow hook.
 *
 * Lifecycle:
 *   - `start(promptDoc)` POSTs to start the enhance job; status transitions to `queued`.
 *   - A `setInterval` at 1000 ms polls `getEnhanceStatus` until the job reaches
 *     `done` or `failed`, or until the 60 s timeout cap is hit.
 *   - On `done`, `proposedDoc` is populated and polling stops.
 *   - On `failed` (or timeout), `error` is populated and polling stops.
 *   - `reset()` returns everything to `idle` so the button is re-enabled.
 *   - The interval handle is stored in a `useRef` and cleared on unmount.
 *
 * §14: does not import from `features/ai-generation/`.
 * §5: no business logic in `.tsx`; this hook owns all side effects.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getEnhanceStatus, startEnhance } from '@/features/generate-wizard/api';

import type { EnhanceStatus, PromptDoc } from '@/features/generate-wizard/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Polling interval for getEnhanceStatus. */
const POLL_INTERVAL_MS = 1_000;

/** Maximum allowed duration before the poll is cancelled with a timeout error. */
const TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type UseEnhancePromptResult = {
  /** Start the enhance flow. No-op if status is not `idle`. */
  start: (promptDoc: PromptDoc) => void;
  /** Current lifecycle state. */
  status: EnhanceStatus;
  /** Populated only when `status === 'done'`. */
  proposedDoc: PromptDoc | null;
  /** Populated when `status === 'failed'`. */
  error: string | null;
  /** Resets status to `idle`, clears proposedDoc and error. */
  reset: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the AI Enhance lifecycle for a single generation draft.
 *
 * @param draftId - The draft to enhance, or `null` when none is created yet.
 */
export function useEnhancePrompt(draftId: string | null): UseEnhancePromptResult {
  const [status, setStatus] = useState<EnhanceStatus>('idle');
  const [proposedDoc, setProposedDoc] = useState<PromptDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable refs so interval callbacks always see current values without
  // closures capturing stale state.
  const isMountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Track mount state to avoid setState-after-unmount.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // stopPolling — tears down the interval
  // ---------------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // reset — public; returns hook to idle state
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    stopPolling();
    if (isMountedRef.current) {
      setStatus('idle');
      setProposedDoc(null);
      setError(null);
    }
  }, [stopPolling]);

  // ---------------------------------------------------------------------------
  // startPolling — sets up a 1000 ms interval; called after POST succeeds
  // ---------------------------------------------------------------------------

  const startPolling = useCallback(
    (draftIdArg: string, jobId: string) => {
      startedAtRef.current = Date.now();

      intervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - (startedAtRef.current ?? Date.now());

        if (elapsed >= TIMEOUT_MS) {
          stopPolling();
          if (isMountedRef.current) {
            setStatus('failed');
            setError('Timed out after 60s');
          }
          return;
        }

        void getEnhanceStatus(draftIdArg, jobId)
          .then((data) => {
            if (!isMountedRef.current) return;

            if (data.status === 'done') {
              stopPolling();
              setProposedDoc(data.result ?? null);
              setStatus('done');
            } else if (data.status === 'failed') {
              stopPolling();
              setError(data.error ?? 'Enhancement failed');
              setStatus('failed');
            } else {
              // queued or running — update status without stopping the interval
              setStatus(data.status);
            }
          })
          .catch(() => {
            // Transient network error — keep polling until the next tick.
          });
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  // ---------------------------------------------------------------------------
  // start — public; initiates the full POST → poll flow
  // ---------------------------------------------------------------------------

  const start = useCallback(
    (_promptDoc: PromptDoc): void => {
      // Guard: only start from idle; draftId must be available.
      if (status !== 'idle' || draftId === null) return;

      setStatus('queued');
      setProposedDoc(null);
      setError(null);

      startEnhance(draftId)
        .then((res) => {
          if (!isMountedRef.current) return;
          startPolling(draftId, res.jobId);
        })
        .catch((err: unknown) => {
          if (!isMountedRef.current) return;

          const message =
            err instanceof Error && err.message === 'rate-limited'
              ? 'You have sent too many enhance requests. Please wait before trying again.'
              : 'Failed to start AI Enhance. Please try again.';

          setError(message);
          setStatus('failed');
        });
    },
    [draftId, startPolling, status],
  );

  // ---------------------------------------------------------------------------

  return { start, status, proposedDoc, error, reset };
}
