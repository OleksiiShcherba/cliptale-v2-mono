/**
 * storyboardPlanQueue.processor.ts — routing for the storyboard-plan BullMQ queue.
 *
 * The queue carries TWO job types (ADR-0002, events.md): storyboard planning and
 * cast extraction (enqueued under the name 'cast-extract', see
 * apps/api/src/queues/jobs/enqueue-cast-extract.ts). The worker MUST branch on
 * job.name. Previously the entrypoint called processStoryboardPlanJob for every
 * job, so processCastExtractJob was dead in production and AC-01 (cast extraction)
 * + AC-02 (overflow notice) never ran end-to-end (R1). This routing is exported so
 * the wiring is testable rather than buried in the side-effecting entrypoint
 * (cf. F3 buildStoryboardOpenAIImageJobDeps).
 */
import type { Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import type { StoryboardPlanJobPayload } from '@ai-video-editor/project-schema';

import {
  processStoryboardPlanJob,
  type StoryboardPlanOpenAiClient,
} from '@/jobs/storyboardPlan.job.js';
import {
  processCastExtractJob,
  type CastExtractJobPayload,
} from '@/jobs/cast-extract.job.js';
import { castExtractJobRepo } from '@/jobs/workerRepositories.js';

/** Job name the API uses when enqueuing cast extraction onto the storyboard-plan queue. */
export const CAST_EXTRACT_JOB_NAME = 'cast-extract';

export type StoryboardPlanQueueClients = {
  /** OpenAI client — structurally satisfies both the plan and cast-extract LLM ports. */
  openai: StoryboardPlanOpenAiClient;
  pool: Pool;
  /**
   * Enqueue cast extraction after the scene plan completes (B1 review fix, AC-02).
   * Optional so existing callers/tests still compile; the entrypoint wires the real one.
   */
  enqueueCastExtraction?: (params: { draftId: string; userId: string }) => Promise<void>;
};

/**
 * Dispatch a storyboard-plan queue job to the correct handler by job.name.
 * Cast-extract jobs run through processCastExtractJob with the real
 * castExtractJobRepo; everything else is a storyboard plan job.
 */
export function routeStoryboardPlanQueueJob(
  job: Job,
  clients: StoryboardPlanQueueClients,
): Promise<unknown> {
  if (job.name === CAST_EXTRACT_JOB_NAME) {
    return processCastExtractJob(job as Job<CastExtractJobPayload>, {
      llm: clients.openai,
      pool: clients.pool,
      repository: castExtractJobRepo,
    });
  }
  return processStoryboardPlanJob(job as Job<StoryboardPlanJobPayload>, {
    openai: clients.openai,
    pool: clients.pool,
    enqueueCastExtraction: clients.enqueueCastExtraction,
  });
}
