import { randomUUID } from 'node:crypto';

import type { EnhancePromptJobPayload } from '@ai-video-editor/project-schema';

import { aiEnhanceQueue } from '@/queues/bullmq.js';

export type { EnhancePromptJobPayload };

/**
 * Enqueues an `ai-enhance` job that rewrites a prompt document via an LLM.
 * Returns the BullMQ job ID (a random UUID) that callers use to poll status.
 *
 * Retry config:
 * - `attempts: 3, backoff: exponential` — BullMQ retries on 5xx / transient errors.
 * - `removeOnComplete: { age: 3600 }` — keep completed jobs for 1 h so GET /enhance/:jobId
 *   returns a result for up to an hour after the job finishes.
 * - `removeOnFail: { age: 86400 }` — keep failed jobs for 24 h for debugging; prevents
 *   unbounded Redis growth without completely losing failure context.
 *
 * Each enhance request is unique (non-idempotent) — a user may call enhance multiple
 * times on the same draft, each producing a fresh proposed rewrite.
 */
export async function enqueueEnhancePrompt(
  payload: EnhancePromptJobPayload,
): Promise<string> {
  const jobId = randomUUID();
  await aiEnhanceQueue.add('enhance-prompt', payload, {
    jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  });
  return jobId;
}
