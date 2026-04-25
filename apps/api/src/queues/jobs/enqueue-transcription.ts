import type { TranscriptionJobPayload } from '@ai-video-editor/project-schema';

import { transcriptionQueue } from '@/queues/bullmq.js';

export type { TranscriptionJobPayload };

/**
 * Enqueues a `transcription` job for the given asset.
 *
 * Uses `fileId` as the BullMQ `jobId` to guarantee idempotency — if a
 * non-finished job for this asset already exists in the queue, no duplicate
 * is added. Re-enqueue is allowed only when the previous attempt failed or
 * completed.
 *
 * Returns the BullMQ job ID (always equal to `fileId` for this queue).
 */
export async function enqueueTranscriptionJob(payload: TranscriptionJobPayload): Promise<string> {
  const existing = await transcriptionQueue.getJob(payload.fileId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'failed' && state !== 'completed') {
      return existing.id ?? payload.fileId;
    }
  }
  const job = await transcriptionQueue.add('transcribe', payload, {
    jobId: payload.fileId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
  return job.id ?? payload.fileId;
}
