import { randomUUID } from 'node:crypto';

import { aiGenerateQueue } from '@/queues/bullmq.js';
import type { AiCapability } from '@/repositories/aiGenerationJob.repository.js';
import type { AiProvider } from '@ai-video-editor/api-contracts';

/**
 * Payload sent to the ai-generate BullMQ worker.
 *
 * The worker owns all provider API keys via its own config — the API layer
 * never forwards credentials through the queue. `provider` is a discriminator
 * so the worker can branch by provider without needing to re-derive it from
 * the capability.
 */
export type AiGenerateJobPayload = {
  jobId: string;
  userId: string;
  projectId: string;
  modelId: string;
  capability: AiCapability;
  provider: AiProvider;
  prompt: string;
  options: Record<string, unknown>;
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
