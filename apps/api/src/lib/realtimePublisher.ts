import { randomUUID } from 'node:crypto';

import {
  REALTIME_REDIS_CHANNEL,
  type PipelineState,
  type RealtimeAiJobEvent,
  type RealtimeStoryboardEvent,
} from '@ai-video-editor/project-schema';

import { redis } from '@/lib/redis.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import type { AiGenerationJob } from '@/repositories/aiGenerationJob.repository.js';

type PublishableRealtimeEvent = RealtimeAiJobEvent | RealtimeStoryboardEvent;

function withEnvelope<T extends PublishableRealtimeEvent>(event: T): T {
  return {
    ...event,
    eventId: event.eventId ?? randomUUID(),
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };
}

async function publishRealtimeEvent(event: PublishableRealtimeEvent): Promise<void> {
  try {
    await redis.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(withEnvelope(event)));
  } catch (error) {
    console.error('[realtime] Failed to publish status event:', error);
  }
}

export async function publishStoryboardStatusUpdated(params: {
  userId: string;
  draftId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await publishRealtimeEvent({
    type: 'storyboard.status.updated',
    userId: params.userId,
    draftId: params.draftId,
    payload: params.payload,
  });
}

/**
 * Publish the FULL projected pipeline state on `storyboard.status.updated` (AC-05,
 * ADR-0004). The payload IS the version-stamped PipelineState, so every observer tab
 * converges on the latest transition and can ignore any event with an older `version`.
 * Best-effort: a publish failure never propagates (publishRealtimeEvent swallows it).
 */
export async function publishPipelineState(params: {
  userId: string;
  draftId: string;
  state: PipelineState;
}): Promise<void> {
  await publishStoryboardStatusUpdated({
    userId: params.userId,
    draftId: params.draftId,
    payload: params.state as unknown as Record<string, unknown>,
  });
}

export async function publishAiJobUpdated(job: AiGenerationJob): Promise<void> {
  await publishRealtimeEvent({
    type: 'ai.job.updated',
    userId: job.userId,
    jobId: job.jobId,
    draftId: job.draftId,
    payload: {
      jobId: job.jobId,
      draftId: job.draftId,
      status: job.status,
      progress: job.progress,
      outputFileId: job.outputFileId,
      resultUrl: job.resultUrl,
      errorMessage: job.errorMessage,
      modelId: job.modelId,
      capability: job.capability,
    },
  });
}

export async function publishAiJobUpdatedById(
  jobId: string,
  storyboardPayload?: Record<string, unknown>,
): Promise<void> {
  const job = await aiGenerationJobRepository.getJobById(jobId);
  if (!job) return;

  await publishAiJobUpdated(job);
  if (!job.draftId || !storyboardPayload) return;

  await publishStoryboardStatusUpdated({
    userId: job.userId,
    draftId: job.draftId,
    payload: storyboardPayload,
  });
}
