import type { StoryboardPlanJobPayload } from '@ai-video-editor/project-schema';

import { storyboardPlanQueue } from '@/queues/bullmq.js';

export type { StoryboardPlanJobPayload };

/**
 * Enqueues a storyboard planning job using the already-persisted DB job ID.
 * Each POST creates a fresh job row, so this helper does not de-duplicate by draft.
 */
export async function enqueueStoryboardPlan(payload: StoryboardPlanJobPayload): Promise<void> {
  await storyboardPlanQueue.add('storyboard-plan', payload, {
    jobId: payload.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: false,
    removeOnFail: false,
  });
}
