/**
 * useFlowGeneration — orchestrates the spend-bearing Generate UX (T20).
 *
 * Flow (AC-01 / AC-11 / AC-08 / AC-08b / AC-09 / AC-12 / AC-13):
 *   start()    → fetch the best-effort estimate, move to `confirming` (the cost gate).
 *   cancel()   → back to idle. NO generate call, NO charge (AC-11).
 *   confirm()  → run the charged Generate with a STABLE Idempotency-Key (generated
 *                fresh per Generate press), then track the new job (phase `tracking`).
 *   retry()    → a FRESH Generate: a NEW Idempotency-Key + a fresh estimate→confirm
 *                (re-shows the cost, may charge again, counts against the rate limit) (AC-09).
 *
 * Live progress + the dominant media preview come from the SHARED useJobPolling hook
 * (we do NOT rebuild polling). On reopen, an `initialJobState` from the flow read
 * (GET /generation-flows/:id → jobs[]) seeds polling so a running job REATTACHES and a
 * done/failed job shows its last-known state (AC-08b).
 */

import { useCallback, useMemo, useState } from 'react';

import { useJobPolling } from '@/shared/ai-generation/hooks/useJobPolling';
import type { AiGenerationJob, AiJobStatus } from '@/shared/ai-generation/types';

import { estimateGeneration, generateBlock } from '../api';
import type { CostEstimate, JobState } from '../types';

export type GenerationPhase = 'idle' | 'estimating' | 'confirming' | 'submitting' | 'tracking';

export type UseFlowGenerationArgs = {
  flowId: string;
  blockId: string;
  /** the flow version the Creator generates against (stale → 409, AC-10b). */
  version: number;
  /** last-known job state from the flow read, for reattach on reopen (AC-08b). */
  initialJobState?: JobState | null;
};

export type UseFlowGenerationResult = {
  phase: GenerationPhase;
  estimate: CostEstimate | null;
  /** the resolved job (live from polling, or the seeded last-known state). */
  job: AiGenerationJob | null;
  /**
   * The job id ACCEPTED for the current run (set on confirm, before the first poll).
   * Unlike `job.jobId` it can never be the stale reattach seed — use it to bind the
   * run's result block (U5/AC-01 history).
   */
  liveJobId: string | null;
  /** the Idempotency-Key for the current/next Generate (fresh per press). */
  idempotencyKey: string;
  error: string | null;
  /** Press Generate → fetch estimate → show the confirm gate. */
  start: () => Promise<void>;
  /** Confirm the cost → run the charged Generate, then track the job. */
  confirm: () => Promise<void>;
  /** Cancel the gate → idle. NO generate call, NO charge. */
  cancel: () => void;
  /** Retry a failed run → fresh key + fresh estimate→confirm. */
  retry: () => Promise<void>;
};

/** Adapt a flow JobState (the reattach snapshot) to the shared polling job shape. */
function jobStateToAiJob(state: JobState | null | undefined): AiGenerationJob | null {
  if (!state) return null;
  return {
    jobId: state.jobId,
    // JobStatusEnum IS the DB/shared AiJobStatus (queued|processing|completed|failed) —
    // verbatim, no remapping (a remap once turned 'completed' into 'queued' on reload).
    status: state.status satisfies AiJobStatus,
    progress: state.progress,
    resultAssetId: state.outputFileId,
    errorMessage: state.errorMessage,
  };
}

function freshKey(): string {
  // crypto.randomUUID is available in jsdom + browsers; fall back for safety.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useFlowGeneration({
  flowId,
  blockId,
  version,
  initialJobState = null,
}: UseFlowGenerationArgs): UseFlowGenerationResult {
  const [phase, setPhase] = useState<GenerationPhase>('idle');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The key is stable across one press (start→confirm); a new one is minted per press/retry.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => freshKey());
  // The job id we are actively tracking after a Generate (overrides the reattach seed).
  const [liveJobId, setLiveJobId] = useState<string | null>(null);

  // Reattach seed: the last-known job from the flow read (AC-08b).
  const reattachJob = useMemo(() => jobStateToAiJob(initialJobState), [initialJobState]);

  // Track the active job: the freshly-submitted one, else the reattach seed's id.
  const trackedJobId = liveJobId ?? initialJobState?.jobId ?? null;
  const { job: polledJob } = useJobPolling(trackedJobId, reattachJob);

  const job = polledJob ?? reattachJob;

  const start = useCallback(async () => {
    setError(null);
    setIdempotencyKey(freshKey());
    setPhase('estimating');
    try {
      const est = await estimateGeneration(flowId, blockId);
      setEstimate(est);
      setPhase('confirming');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not estimate the cost.');
      setPhase('idle');
    }
  }, [flowId, blockId]);

  const cancel = useCallback(() => {
    // NO generate call, NO charge (AC-11).
    setEstimate(null);
    setPhase('idle');
  }, []);

  const confirm = useCallback(async () => {
    setError(null);
    setPhase('submitting');
    try {
      const accepted = await generateBlock(flowId, blockId, {
        idempotencyKey,
        version,
        acknowledgedCost: estimate?.estimate,
      });
      setLiveJobId(accepted.jobId);
      setEstimate(null);
      setPhase('tracking');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation could not be started.');
      // Stay on the gate so the Creator can retry the confirm.
      setPhase('confirming');
    }
  }, [flowId, blockId, idempotencyKey, version, estimate]);

  const retry = useCallback(async () => {
    // A fresh Generate: new key + fresh estimate→confirm (AC-09). start() mints the key.
    await start();
  }, [start]);

  return { phase, estimate, job, liveJobId, idempotencyKey, error, start, confirm, cancel, retry };
}
