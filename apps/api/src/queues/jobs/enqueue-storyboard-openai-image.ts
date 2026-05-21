import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';

import { storyboardOpenAIImageQueue } from '@/queues/bullmq.js';

export type { StoryboardOpenAIImageJobPayload };

/**
 * Enqueues direct OpenAI Images work for storyboard references/scenes.
 * The caller must persist the corresponding ai_generation_jobs row first.
 */
export async function enqueueStoryboardOpenAIImage(
  payload: StoryboardOpenAIImageJobPayload,
): Promise<void> {
  await storyboardOpenAIImageQueue.add('storyboard-openai-image', payload, {
    jobId: payload.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: false,
    removeOnFail: false,
  });
}
