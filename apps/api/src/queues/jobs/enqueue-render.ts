import type { RenderVideoJobPayload } from '@ai-video-editor/project-schema';

import { renderQueue } from '@/queues/bullmq.js';

export type { RenderVideoJobPayload };

/**
 * Enqueues a `render` job for the given payload.
 *
 * Uses `jobId` as the BullMQ `jobId` to guarantee idempotency — if a
 * non-finished job for this render already exists in the queue, no duplicate
 * is added. Re-enqueue is allowed only when the previous attempt failed or
 * completed.
 *
 * Retries up to 2 additional times (3 total) with exponential backoff,
 * matching the render worker's expected retry semantics.
 */
export async function enqueueRenderJob(payload: RenderVideoJobPayload): Promise<void> {
  const existing = await renderQueue.getJob(payload.jobId);
  if (existing) {
    const state = await existing.getState();
    // Skip if the job is still waiting / active / delayed — it will run.
    if (state !== 'failed' && state !== 'completed') {
      return;
    }
  }
  await renderQueue.add('render', payload, {
    jobId: payload.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
  });
}
