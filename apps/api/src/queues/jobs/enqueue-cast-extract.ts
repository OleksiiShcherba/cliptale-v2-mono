import { storyboardPlanQueue } from '@/queues/bullmq.js';

export type CastExtractJobPayload = {
  jobId: string;
  draftId: string;
  userId: string;
};

/**
 * Enqueues a cast-extract job on the storyboard-plan queue (ADR-0002, events.md).
 * Uses the already-persisted DB job ID as the BullMQ jobId for idempotency.
 */
export async function enqueueCastExtract(payload: CastExtractJobPayload): Promise<void> {
  await storyboardPlanQueue.add('cast-extract', payload, {
    jobId: payload.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: false,
    removeOnFail: false,
  });
}
