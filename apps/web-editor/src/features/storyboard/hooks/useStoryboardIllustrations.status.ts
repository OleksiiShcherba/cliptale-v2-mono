import type { RealtimeStoryboardEvent } from '@ai-video-editor/project-schema';

import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationLifecycleStatus,
  StoryboardIllustrationStatusItem,
  StoryboardIllustrationStatusResponse,
} from '@/features/storyboard/types';

export function hasActiveJob(
  item: StoryboardIllustrationStatusItem,
): boolean {
  return item.jobId !== null && (item.status === 'queued' || item.status === 'running');
}

export function deriveStatus(
  response: StoryboardIllustrationStatusResponse,
): StoryboardIllustrationLifecycleStatus {
  const entries = response.items;
  if (entries.some(hasActiveJob)) {
    return entries.some((item) => item.jobId !== null && item.status === 'running') ? 'running' : 'queued';
  }
  if (entries.some((item) => item.status === 'failed')) return 'failed';
  if (
    response.items.length > 0 &&
    response.items.every((item) => item.jobId !== null && item.status === 'ready')
  ) {
    return 'completed';
  }
  return 'idle';
}

export function derivePhase(response: StoryboardIllustrationStatusResponse): StoryboardIllustrationLifecyclePhase {
  if (response.items.some(hasActiveJob)) {
    return 'scene';
  }
  if (response.items.some((item) => item.status === 'failed')) {
    return 'scene';
  }
  if (
    response.items.length > 0 &&
    response.items.every((item) => item.jobId !== null && item.status === 'ready')
  ) {
    return 'completed';
  }
  return 'idle';
}

// After AC-08 (T9) the principal-approval gate is removed; there is no client-side
// continuation needed between reference and scene phases. This function is retained
// for interface compatibility but always returns false.
export function hasPendingSceneStart(_response: StoryboardIllustrationStatusResponse): boolean {
  return false;
}

type StoryboardStatusPayload = {
  resource?: unknown;
  status?: unknown;
  storyboardBindings?: unknown;
};

export function isIllustrationStatusResponse(value: unknown): value is StoryboardIllustrationStatusResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'items' in value &&
      Array.isArray((value as { items?: unknown }).items),
  );
}

export function eventHasIllustrationBinding(event: RealtimeStoryboardEvent): boolean {
  const payload = event.payload as StoryboardStatusPayload;
  if (payload.resource === 'storyboardIllustrations') return true;
  if (payload.resource !== 'aiGenerationJob' || !Array.isArray(payload.storyboardBindings)) return false;
  return payload.storyboardBindings.some((binding) => (
    binding &&
    typeof binding === 'object' &&
    (binding as { resource?: unknown }).resource === 'storyboardIllustrations'
  ));
}
