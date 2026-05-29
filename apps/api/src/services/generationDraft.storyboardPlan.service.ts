import { randomUUID } from 'node:crypto';

import {
  promptDocSchema,
  type PromptDoc,
  type StoryboardPlanJobResult,
} from '@ai-video-editor/project-schema';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import { publishStoryboardStatusUpdated } from '@/lib/realtimePublisher.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import { enqueueStoryboardPlan } from '@/queues/jobs/enqueue-storyboard-plan.js';

export type StartStoryboardPlanResult = {
  jobId: string;
  status: 'queued' | 'running';
};

async function resolveDraft(userId: string, id: string): Promise<GenerationDraft> {
  const draft = await generationDraftRepository.findDraftById(id);
  if (!draft) {
    throw new NotFoundError(`Generation draft ${id} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own generation draft ${id}`);
  }
  return draft;
}

function assertValidPromptDoc(promptDoc: unknown): asserts promptDoc is PromptDoc {
  const result = promptDocSchema.safeParse(promptDoc);
  if (!result.success) {
    throw new UnprocessableEntityError(
      `Invalid PromptDoc: ${result.error.issues.map((i) => i.message).join(', ')}`,
    );
  }
}

function assertHasPlanningInput(promptDoc: PromptDoc): void {
  const hasText = promptDoc.blocks.some(
    (block) => block.type === 'text' && block.value.trim().length > 0,
  );
  const hasMedia = promptDoc.blocks.some((block) => block.type === 'media-ref');

  if (!hasText && !hasMedia) {
    throw new UnprocessableEntityError(
      'Storyboard planning requires a non-empty prompt or at least one media reference',
    );
  }
}

export async function startStoryboardPlan(
  userId: string,
  draftId: string,
): Promise<StartStoryboardPlanResult> {
  const draft = await resolveDraft(userId, draftId);
  assertValidPromptDoc(draft.promptDoc);
  assertHasPlanningInput(draft.promptDoc);

  const reservation = await storyboardPlanJobRepository.reserveQueuedJob({
    jobId: randomUUID(),
    draftId,
    userId,
    model: draft.promptDoc.settings?.modelPreference ?? null,
    promptSnapshot: draft.promptDoc,
  });
  if (!reservation.created) {
    await publishStoryboardStatusUpdated({
      userId,
      draftId,
      payload: {
        resource: 'storyboardPlan',
        jobId: reservation.jobId,
        status: reservation.status,
        errorMessage: null,
      },
    });
    return { jobId: reservation.jobId, status: reservation.status };
  }

  try {
    await enqueueStoryboardPlan({ jobId: reservation.jobId, draftId, userId });
  } catch (error) {
    await storyboardPlanJobRepository.markFailed(reservation.jobId, error);
    await publishStoryboardStatusUpdated({
      userId,
      draftId,
      payload: {
        resource: 'storyboardPlan',
        jobId: reservation.jobId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Failed to enqueue storyboard plan job',
      },
    });
    throw error;
  }

  await publishStoryboardStatusUpdated({
    userId,
    draftId,
    payload: {
      resource: 'storyboardPlan',
      jobId: reservation.jobId,
      status: 'queued',
      errorMessage: null,
    },
  });

  return { jobId: reservation.jobId, status: 'queued' };
}

export async function getStoryboardPlanStatus(
  userId: string,
  draftId: string,
  jobId: string,
): Promise<StoryboardPlanJobResult> {
  await resolveDraft(userId, draftId);

  const job = await storyboardPlanJobRepository.findByJobId(jobId);
  if (!job || job.draftId !== draftId || job.userId !== userId) {
    throw new NotFoundError(`Storyboard plan job ${jobId} not found`);
  }

  if (job.status === 'completed') {
    if (!job.plan) {
      throw new NotFoundError(`Storyboard plan job ${jobId} completed without a persisted plan`);
    }
    return {
      jobId: job.jobId,
      status: 'completed',
      plan: job.plan,
      errorMessage: null,
    };
  }

  if (job.status === 'failed') {
    return {
      jobId: job.jobId,
      status: 'failed',
      plan: null,
      errorMessage: job.errorMessage ?? 'Storyboard plan job failed',
    };
  }

  return {
    jobId: job.jobId,
    status: job.status,
    plan: null,
    errorMessage: null,
  };
}
