import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';

const { mockPublishStoryboardPlanStatus } = vi.hoisted(() => ({
  mockPublishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/realtime.js', () => ({
  publishStoryboardPlanStatus: mockPublishStoryboardPlanStatus,
}));

import type {
  PromptDoc,
  StoryboardPlan,
  StoryboardPlanJobPayload,
} from '@ai-video-editor/project-schema';
import { STORYBOARD_PLAN_SCHEMA_VERSION } from '@ai-video-editor/project-schema';

import {
  processStoryboardPlanJob,
  type StoryboardPlanOpenAiClient,
} from './storyboardPlan.job.js';
import type { StoryboardPlanResolvedContext } from './storyboardPlan.context.types.js';
import type { StoryboardPlanJobRepository } from './storyboardPlan.repository.js';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const pool = {} as Pool;

function makeJob(): Job<StoryboardPlanJobPayload> {
  return {
    data: {
      jobId: JOB_ID,
      draftId: DRAFT_ID,
      userId: USER_ID,
    },
  } as Job<StoryboardPlanJobPayload>;
}

function makePlan(): StoryboardPlan {
  return {
    schemaVersion: STORYBOARD_PLAN_SCHEMA_VERSION,
    videoLengthSeconds: 30,
    sceneCount: 5,
    scenes: Array.from({ length: 5 }, (_, index) => ({
      sceneNumber: index + 1,
      prompt: `Scene ${index + 1}`,
      visualPrompt: `Visual ${index + 1}`,
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    })),
    musicSegments: [],
  };
}

function makeContext(): StoryboardPlanResolvedContext {
  return {
    promptDoc: {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'Create a product launch.' }],
    } satisfies PromptDoc,
    text: 'Create a product launch.',
    media: [],
    openAiMediaInputs: [],
  };
}

function makeOpenAi(content: string): StoryboardPlanOpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

function makeRepository(): StoryboardPlanJobRepository {
  return {
    markRunning: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('processStoryboardPlanJob realtime publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes running and completed status only after repository writes', async () => {
    const repository = makeRepository();

    await processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAi(JSON.stringify(makePlan())),
      pool,
      repository,
      resolveContext: vi.fn().mockResolvedValue(makeContext()),
    });

    expect(mockPublishStoryboardPlanStatus).toHaveBeenCalledTimes(2);
    expect(mockPublishStoryboardPlanStatus).toHaveBeenNthCalledWith(1, { pool, jobId: JOB_ID });
    expect(repository.markRunning).toHaveBeenCalledWith(JOB_ID);
    expect(
      vi.mocked(repository.markRunning).mock.invocationCallOrder[0]!,
    ).toBeLessThan(mockPublishStoryboardPlanStatus.mock.invocationCallOrder[0]!);
    expect(repository.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      jobId: JOB_ID,
      plan: makePlan(),
    }));
    expect(
      vi.mocked(repository.markCompleted).mock.invocationCallOrder[0]!,
    ).toBeLessThan(mockPublishStoryboardPlanStatus.mock.invocationCallOrder[1]!);
  });

  it('publishes failed status only after the failure is persisted', async () => {
    const repository = makeRepository();

    await expect(processStoryboardPlanJob(makeJob(), {
      openai: makeOpenAi('not json'),
      pool,
      repository,
      resolveContext: vi.fn().mockResolvedValue(makeContext()),
    })).rejects.toThrow();

    expect(repository.markFailed).toHaveBeenCalledWith(JOB_ID, expect.any(Error));
    expect(mockPublishStoryboardPlanStatus).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(repository.markFailed).mock.invocationCallOrder[0]!,
    ).toBeLessThan(mockPublishStoryboardPlanStatus.mock.invocationCallOrder[1]!);
  });
});
