import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import { mediaIngestQueue } from '@/queues/bullmq.js';

export type { MediaIngestJobPayload };

/**
 * Enqueues a `media-ingest` job for the given asset.
 *
 * Uses `fileId` as the BullMQ `jobId` to guarantee idempotency — if a
 * non-finished job for this asset already exists in the queue, no duplicate
 * is added. Re-enqueue is allowed only when the previous attempt failed or
 * completed.
 */
export async function enqueueIngestJob(payload: MediaIngestJobPayload): Promise<void> {
  const existing = await mediaIngestQueue.getJob(payload.fileId);
  if (existing) {
    const state = await existing.getState();
    // Skip if the job is still waiting / active / delayed — it will run.
    if (state !== 'failed' && state !== 'completed') {
      return;
    }
  }
  await mediaIngestQueue.add('ingest', payload, {
    jobId: payload.fileId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
}
