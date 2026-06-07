/**
 * R1 — the storyboard-plan BullMQ queue carries TWO job types (ADR-0002):
 * storyboard planning AND cast extraction (enqueued under the name 'cast-extract').
 * The worker entrypoint previously called processStoryboardPlanJob for EVERY job,
 * so processCastExtractJob was dead in production and AC-01 (cast extraction) +
 * AC-02 (overflow notice) never ran end-to-end. This asserts the routing branches
 * on job.name and dispatches cast-extract jobs to the cast handler with the real
 * castExtractJobRepo (cf. F3 buildStoryboardOpenAIImageJobDeps — testable wiring,
 * not buried in the side-effecting entrypoint).
 *
 * Run:
 *   cd apps/media-worker && npx vitest run src/jobs/storyboardPlanQueue.processor.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const { mockProcessCast, mockProcessPlan, castExtractJobRepo } = vi.hoisted(() => ({
  mockProcessCast: vi.fn().mockResolvedValue({ cast: [], overflow: false }),
  mockProcessPlan: vi.fn().mockResolvedValue(undefined),
  castExtractJobRepo: { __tag: 'castExtractJobRepo' },
}));

vi.mock('./cast-extract.job.js', () => ({ processCastExtractJob: mockProcessCast }));
vi.mock('./storyboardPlan.job.js', () => ({ processStoryboardPlanJob: mockProcessPlan }));
vi.mock('./workerRepositories.js', () => ({ castExtractJobRepo }));

import {
  routeStoryboardPlanQueueJob,
  CAST_EXTRACT_JOB_NAME,
} from './storyboardPlanQueue.processor.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const openai = { chat: { completions: { create: vi.fn() } } } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = {} as any;

function makeJob(name: string, data: unknown = {}): Job {
  return { name, data } as unknown as Job;
}

describe('routeStoryboardPlanQueueJob (R1 — job.name routing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes cast-extract jobs to processCastExtractJob with the real castExtractJobRepo', async () => {
    const job = makeJob(CAST_EXTRACT_JOB_NAME, { jobId: 'j', draftId: 'd', userId: 'u' });

    await routeStoryboardPlanQueueJob(job, { openai, pool });

    expect(mockProcessCast).toHaveBeenCalledTimes(1);
    expect(mockProcessPlan).not.toHaveBeenCalled();
    const [routedJob, deps] = mockProcessCast.mock.calls[0]!;
    expect(routedJob).toBe(job);
    expect(deps.repository).toBe(castExtractJobRepo);
    expect(deps.llm).toBe(openai);
    expect(deps.pool).toBe(pool);
  });

  it('routes every other job on the queue to processStoryboardPlanJob', async () => {
    const job = makeJob('storyboard-plan', { jobId: 'j', draftId: 'd', userId: 'u' });

    await routeStoryboardPlanQueueJob(job, { openai, pool });

    expect(mockProcessPlan).toHaveBeenCalledTimes(1);
    expect(mockProcessCast).not.toHaveBeenCalled();
    const [routedJob, deps] = mockProcessPlan.mock.calls[0]!;
    expect(routedJob).toBe(job);
    expect(deps.openai).toBe(openai);
    expect(deps.pool).toBe(pool);
  });

  it('treats an unnamed job as a storyboard-plan job (back-compat default)', async () => {
    const job = makeJob('', { jobId: 'j', draftId: 'd', userId: 'u' });

    await routeStoryboardPlanQueueJob(job, { openai, pool });

    expect(mockProcessPlan).toHaveBeenCalledTimes(1);
    expect(mockProcessCast).not.toHaveBeenCalled();
  });
});
