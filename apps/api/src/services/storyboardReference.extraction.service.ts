import { randomUUID } from 'node:crypto';

import { NotFoundError } from '@/lib/errors.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as storyboardReferenceRepository from '@/repositories/storyboardReference.repository.js';
import { enqueueCastExtract } from '@/queues/jobs/enqueue-cast-extract.js';

/** Typed error thrown by startExtraction when the draft already has reference blocks (AC-01b). */
export class CastAlreadyExtractedError extends Error {
  readonly statusCode = 409;
  constructor(message = 'Draft already has reference blocks; cast cannot be re-extracted') {
    super(message);
    this.name = 'CastAlreadyExtractedError';
  }
}

export type StartExtractionResult = {
  jobId: string;
  /**
   * Idempotent start (ADR-0001): a fresh start returns `queued`; a converged-on
   * existing extraction returns its current `running` / `completed` status.
   */
  status: 'queued' | 'running' | 'completed';
};

export type GetExtractionResult = {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  proposalJson: unknown | null;
  /** AC-02: whether the proposal was trimmed to the cast size limit (F4). */
  truncated: boolean;
  aggregateEstimateCredits: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
} | null;

/**
 * Resolve draft with owner check — denies without revealing existence (AC-13).
 */
async function resolveDraftOwner(userId: string, draftId: string) {
  const draft = await generationDraftRepository.findDraftById(draftId);
  if (!draft || draft.userId !== userId) {
    throw new NotFoundError(`Generation draft ${draftId} not found`);
  }
  return draft;
}

/**
 * Start cast extraction for a draft (AC-01, AC-01b, AC-13).
 *
 * - Owner check (AC-13): not-found on missing or non-owned draft.
 * - Guard (AC-01b): if draft already has reference blocks, throws CastAlreadyExtractedError.
 * - Idempotent per draft (AC-05, ADR-0001): if the latest job is queued/running/completed,
 *   returns it untouched — no second row. A `failed` (or absent) latest is treated as
 *   not-existing, so a fresh start is allowed (AC-07).
 * - Otherwise creates a queued job row, then enqueues the cast-extract job (AC-01).
 */
export async function startExtraction(
  userId: string,
  draftId: string,
): Promise<StartExtractionResult> {
  await resolveDraftOwner(userId, draftId);

  // AC-01b: guard — if blocks exist, extraction cannot be re-run (wins over the idempotent return)
  const existingBlocks = await storyboardReferenceRepository.listReferenceBlocksByDraftId({
    draftId,
    userId,
  });
  if (existingBlocks.length > 0) {
    throw new CastAlreadyExtractedError();
  }

  // AC-05 (ADR-0001): idempotent per draft — converge on the existing non-failed extraction
  // instead of inserting a second row. `failed` = not-existing → fall through to a fresh start.
  const latest = await storyboardReferenceRepository.findLatestCastExtractionJobForDraft({
    draftId,
    userId,
  });
  if (latest && latest.status !== 'failed') {
    return { jobId: latest.id, status: latest.status };
  }

  // AC-01 / AC-07: persist job row before enqueue
  const jobId = randomUUID();
  const job = await storyboardReferenceRepository.createCastExtractionJob({
    id: jobId,
    draftId,
    userId,
  });

  await enqueueCastExtract({ jobId: job.id, draftId, userId });

  return { jobId: job.id, status: 'queued' };
}

/**
 * Get the latest extraction job for a draft (AC-01, AC-13).
 *
 * Returns null if no job exists yet (reattach-fallback realtime).
 */
export async function getExtraction(
  userId: string,
  draftId: string,
): Promise<GetExtractionResult> {
  await resolveDraftOwner(userId, draftId);

  const job = await storyboardReferenceRepository.findLatestCastExtractionJobForDraft({
    draftId,
    userId,
  });

  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    status: job.status,
    proposalJson: job.proposalJson,
    truncated: job.truncated,
    aggregateEstimateCredits: job.aggregateEstimateCredits,
    errorMessage: job.errorMessage,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    createdAt: job.createdAt,
  };
}
