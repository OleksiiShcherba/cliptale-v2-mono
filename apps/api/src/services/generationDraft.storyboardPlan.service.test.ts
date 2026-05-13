import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoryboardPlan } from '@ai-video-editor/project-schema';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import { enqueueStoryboardPlan } from '@/queues/jobs/enqueue-storyboard-plan.js';
import {
  DRAFT_ID,
  OTHER_USER_ID,
  USER_ID,
  VALID_PROMPT_DOC_WITH_SETTINGS,
  makeDraft,
} from './generationDraft.service.fixtures.js';
import {
  getStoryboardPlanStatus,
  startStoryboardPlan,
} from './generationDraft.storyboardPlan.service.js';

vi.mock('@/repositories/generationDraft.repository.js', () => ({
  findDraftById: vi.fn(),
}));

vi.mock('@/repositories/storyboardPlanJob.repository.js', () => ({
  createQueuedJob: vi.fn(),
  findByJobId: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-storyboard-plan.js', () => ({
  enqueueStoryboardPlan: vi.fn(),
}));

const VALID_PLAN: StoryboardPlan = {
  schemaVersion: 1,
  videoLengthSeconds: 30,
  sceneCount: 5,
  scenes: [
    {
      sceneNumber: 1,
      prompt: 'Open on the product.',
      visualPrompt: 'Clean hero product shot.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    },
    {
      sceneNumber: 2,
      prompt: 'Show the problem.',
      visualPrompt: 'User struggling before the solution.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    },
    {
      sceneNumber: 3,
      prompt: 'Show the feature.',
      visualPrompt: 'Close feature detail.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    },
    {
      sceneNumber: 4,
      prompt: 'Show the benefit.',
      visualPrompt: 'Happy user result.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    },
    {
      sceneNumber: 5,
      prompt: 'End with CTA.',
      visualPrompt: 'Final branded frame.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    },
  ],
};

describe('generationDraft.storyboardPlan.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a queued job before enqueueing the worker job', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(
      makeDraft({ promptDoc: VALID_PROMPT_DOC_WITH_SETTINGS }),
    );
    vi.mocked(storyboardPlanJobRepository.createQueuedJob).mockResolvedValue();
    vi.mocked(enqueueStoryboardPlan).mockResolvedValue();

    const result = await startStoryboardPlan(USER_ID, DRAFT_ID);

    expect(result.status).toBe('queued');
    expect(result.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(storyboardPlanJobRepository.createQueuedJob).toHaveBeenCalledWith({
      jobId: result.jobId,
      draftId: DRAFT_ID,
      userId: USER_ID,
      model: null,
      promptSnapshot: VALID_PROMPT_DOC_WITH_SETTINGS,
    });
    expect(enqueueStoryboardPlan).toHaveBeenCalledWith({
      jobId: result.jobId,
      draftId: DRAFT_ID,
      userId: USER_ID,
    });
    expect(
      vi.mocked(storyboardPlanJobRepository.createQueuedJob).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(enqueueStoryboardPlan).mock.invocationCallOrder[0]!);
  });

  it('rejects an empty prompt with no media before enqueueing', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(
      makeDraft({ promptDoc: { schemaVersion: 1, blocks: [{ type: 'text', value: '   ' }] } }),
    );

    await expect(startStoryboardPlan(USER_ID, DRAFT_ID)).rejects.toThrow(UnprocessableEntityError);
    expect(storyboardPlanJobRepository.createQueuedJob).not.toHaveBeenCalled();
    expect(enqueueStoryboardPlan).not.toHaveBeenCalled();
  });

  it('allows media-only prompt docs', async () => {
    const promptDoc = {
      schemaVersion: 1 as const,
      blocks: [
        {
          type: 'media-ref' as const,
          mediaType: 'image' as const,
          fileId: '00000000-0000-4000-8000-000000000001',
          label: 'hero.png',
        },
      ],
    };
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft({ promptDoc }));
    vi.mocked(storyboardPlanJobRepository.createQueuedJob).mockResolvedValue();
    vi.mocked(enqueueStoryboardPlan).mockResolvedValue();

    await expect(startStoryboardPlan(USER_ID, DRAFT_ID)).resolves.toMatchObject({
      status: 'queued',
    });
  });

  it('preserves missing draft and wrong owner behavior', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValueOnce(null);
    await expect(startStoryboardPlan(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);

    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValueOnce(
      makeDraft({ userId: OTHER_USER_ID }),
    );
    await expect(startStoryboardPlan(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);
  });

  it('maps persisted queued/running/completed/failed rows without BullMQ reads', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());

    for (const status of ['queued', 'running'] as const) {
      vi.mocked(storyboardPlanJobRepository.findByJobId).mockResolvedValueOnce({
        jobId: `job-${status}`,
        draftId: DRAFT_ID,
        userId: USER_ID,
        status,
        model: null,
        promptSnapshot: {},
        mediaContext: null,
        plan: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        failedAt: null,
      });
      await expect(getStoryboardPlanStatus(USER_ID, DRAFT_ID, `job-${status}`)).resolves.toEqual({
        jobId: `job-${status}`,
        status,
        plan: null,
        errorMessage: null,
      });
    }

    vi.mocked(storyboardPlanJobRepository.findByJobId).mockResolvedValueOnce({
      jobId: 'job-completed',
      draftId: DRAFT_ID,
      userId: USER_ID,
      status: 'completed',
      model: null,
      promptSnapshot: {},
      mediaContext: null,
      plan: VALID_PLAN,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
    });
    await expect(getStoryboardPlanStatus(USER_ID, DRAFT_ID, 'job-completed')).resolves.toEqual({
      jobId: 'job-completed',
      status: 'completed',
      plan: VALID_PLAN,
      errorMessage: null,
    });

    vi.mocked(storyboardPlanJobRepository.findByJobId).mockResolvedValueOnce({
      jobId: 'job-failed',
      draftId: DRAFT_ID,
      userId: USER_ID,
      status: 'failed',
      model: null,
      promptSnapshot: {},
      mediaContext: null,
      plan: null,
      errorMessage: 'model rejected invalid JSON',
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      failedAt: new Date(),
    });
    await expect(getStoryboardPlanStatus(USER_ID, DRAFT_ID, 'job-failed')).resolves.toEqual({
      jobId: 'job-failed',
      status: 'failed',
      plan: null,
      errorMessage: 'model rejected invalid JSON',
    });
  });
});
