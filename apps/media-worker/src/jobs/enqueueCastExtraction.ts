/**
 * enqueueCastExtraction.ts — worker-side cast-extraction enqueue (B1 review fix, AC-02).
 *
 * SAD §6 Flow 1 chains scene generation → reference-data (cast proposal) generation:
 * once the scene-plan job completes and the pipeline advances reference_data → running,
 * the worker must ENQUEUE the cast-extract job so a cast proposal is actually produced.
 * Before this fix nothing enqueued it (the only `enqueueCastExtract` caller was the
 * inherited api extraction service, which the pipeline never invokes), so reference_data
 * sat `running` until the reaper failed it at the 10-min bound and the cast-proposal
 * modal (AC-02) was never reached.
 *
 * The worker self-enqueues (no HTTP hop to the api, consistent with ADR-0003). The job
 * row is created in storyboard_cast_extraction_jobs (status 'queued') and the job is
 * added to the storyboard-plan queue under the name 'cast-extract' — the SAME shape as
 * apps/api/src/queues/jobs/enqueue-cast-extract.ts, routed by the processor (R1).
 *
 * Idempotent: if a non-failed cast-extraction job already exists for the draft (e.g. a
 * redelivered scene job or the inherited manual flow), it is reused — never duplicated.
 */

import { randomUUID } from 'node:crypto';

import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { JobsOptions } from 'bullmq';

/** Job name the storyboard-plan queue uses to route a cast-extraction job (R1). */
export const CAST_EXTRACT_JOB_NAME = 'cast-extract';

/** The minimal BullMQ producer surface needed to enqueue (keeps this testable). */
export type CastExtractQueueProducer = {
  add(name: string, data: unknown, opts?: JobsOptions): Promise<unknown>;
};

export type EnqueueCastExtractionDeps = {
  pool: Pool;
  queue: CastExtractQueueProducer;
};

export type EnqueueCastExtractionResult = {
  /** true when a fresh job was created + enqueued; false when an existing one was reused. */
  enqueued: boolean;
  jobId: string;
};

/**
 * Create + enqueue a cast-extraction job for a draft (idempotent). Returns the job id
 * (fresh or reused). Mirrors enqueue-cast-extract.ts job options.
 */
export async function enqueueCastExtraction(
  params: { draftId: string; userId: string },
  deps: EnqueueCastExtractionDeps,
): Promise<EnqueueCastExtractionResult> {
  const { draftId, userId } = params;
  const { pool, queue } = deps;

  // Idempotency: a non-failed cast-extraction job already exists → reuse it.
  const [existing] = await pool.execute<Array<RowDataPacket & { id: string }>>(
    `SELECT id FROM storyboard_cast_extraction_jobs
      WHERE draft_id = ? AND status <> 'failed'
      ORDER BY created_at DESC
      LIMIT 1`,
    [draftId],
  );
  if (existing.length > 0) {
    return { enqueued: false, jobId: existing[0]!.id };
  }

  const jobId = randomUUID();
  await pool.execute(
    `INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status)
     VALUES (?, ?, ?, 'queued')`,
    [jobId, draftId, userId],
  );

  await queue.add(
    CAST_EXTRACT_JOB_NAME,
    { jobId, draftId, userId },
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: false,
      removeOnFail: false,
    },
  );

  return { enqueued: true, jobId };
}
