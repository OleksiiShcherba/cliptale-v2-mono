import type { RealtimeClientMessage, RealtimeRedisEvent } from '@ai-video-editor/project-schema';

import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';

export function subscriptionKeyForMessage(
  message: RealtimeClientMessage,
  userId: string,
): string {
  if (message.scope === 'draft-storyboard') {
    return `draft-storyboard:${userId}:${message.draftId}`;
  }
  return `ai-job:${userId}:${message.jobId}`;
}

export function resourceIdForMessage(message: RealtimeClientMessage): string {
  return message.scope === 'draft-storyboard' ? message.draftId : message.jobId;
}

export function subscriptionKeyForEvent(event: RealtimeRedisEvent): string {
  if (event.type === 'storyboard.status.updated') {
    return `draft-storyboard:${event.userId}:${event.draftId}`;
  }
  return `ai-job:${event.userId}:${event.jobId}`;
}

export async function assertOwnsSubscription(
  message: RealtimeClientMessage,
  userId: string,
): Promise<void> {
  if (message.type !== 'subscribe') {
    return;
  }

  if (message.scope === 'draft-storyboard') {
    const draft = await generationDraftRepository.findDraftById(message.draftId);
    if (!draft || draft.userId !== userId) {
      throw new Error('not_found');
    }
    return;
  }

  const job = await aiGenerationJobRepository.getJobById(message.jobId);
  if (!job || job.userId !== userId) {
    throw new Error('not_found');
  }
}
