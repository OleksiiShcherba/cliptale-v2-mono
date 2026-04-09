import { randomUUID } from 'node:crypto';

import { aiGenerateQueue } from '@/queues/bullmq.js';

/** Payload sent to the ai-generate BullMQ worker. */
export type AiGenerateJobPayload = {
  jobId: string;
  userId: string;
  projectId: string;
  type: 'image' | 'video' | 'audio' | 'text';
  provider: string;
  apiKey: string;
  prompt: string;
  options: Record<string, unknown> | null;
};

/**
 * Enqueues an `ai-generate` job. Returns the generated job ID.
 *
 * Uses a random UUID as the BullMQ jobId — each generation request is unique
 * (unlike media ingest which is idempotent per asset).
 */
export async function enqueueAiGenerateJob(
  payload: Omit<AiGenerateJobPayload, 'jobId'>,
): Promise<string> {
  const jobId = randomUUID();
  await aiGenerateQueue.add('ai-generate', { ...payload, jobId }, {
    jobId,
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  });
  return jobId;
}
