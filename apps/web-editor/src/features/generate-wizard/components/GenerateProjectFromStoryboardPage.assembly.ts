import type { RealtimeStoryboardEvent } from '@ai-video-editor/project-schema';

import {
  createProjectFromStoryboard,
  fetchStoryboardMusic,
  fetchStoryboardVideos,
  generatePendingStoryboardMusic,
} from '@/features/storyboard/api';
import type {
  StoryboardMusicResponse,
  StoryboardProjectAssemblyMode,
  StoryboardVideoStatusResponse,
} from '@/features/storyboard/types';
import { getRealtimeClient } from '@/lib/realtime-client';

export const GENERATE_NOW_NOT_READY_ERROR =
  'A music block set to Generate now is not ready. Go back to Step 2, generate it, then retry Step 3.';
export const MUSIC_PREPARATION_ERROR =
  'Background music could not be prepared. Go back to Step 2, review the music block, then retry Step 3.';
export const STORYBOARD_MUSIC_ENDPOINT_ERROR_PATTERN =
  /\b(?:GET|POST|PUT|PATCH)\s+\/storyboards\/[^/\s]+\/music\b/i;

const inFlightByDraft = new Map<string, Promise<string>>();

export function resetStoryboardProjectAssemblyRequestsForTests(): void {
  inFlightByDraft.clear();
}

export function clearStoryboardProjectAssemblyRequest(
  draftId: string,
  mode: StoryboardProjectAssemblyMode,
): void {
  inFlightByDraft.delete(getInFlightKey(draftId, mode));
}

export function getInFlightKey(draftId: string, mode: StoryboardProjectAssemblyMode): string {
  return `${draftId}:${mode}`;
}

function videosAreReady(status: StoryboardVideoStatusResponse): boolean {
  return status.items.length > 0 && status.items.every((item) => item.status === 'ready' && item.outputFileId);
}

function getVideoFailure(status: StoryboardVideoStatusResponse): string | null {
  const failed = status.items.find((item) => item.status === 'failed');
  return failed?.errorMessage ?? (failed ? 'Storyboard video generation failed.' : null);
}

function musicIsReady(status: StoryboardMusicResponse): boolean {
  return status.items.every((item) => item.generationStatus === 'ready' && item.outputFileId);
}

function getMusicFailure(status: StoryboardMusicResponse): string | null {
  const failed = status.items.find((item) => item.generationStatus === 'failed');
  if (!failed) return null;
  if (/generate this music block|generate now|not ready/i.test(failed.errorMessage ?? '')) {
    return GENERATE_NOW_NOT_READY_ERROR;
  }
  return MUSIC_PREPARATION_ERROR;
}

type StoryboardStatusPayload = {
  resource?: unknown;
  status?: unknown;
  storyboardBindings?: unknown;
};

function isStoryboardVideoStatusResponse(value: unknown): value is StoryboardVideoStatusResponse {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items));
}

function isStoryboardMusicResponse(value: unknown): value is StoryboardMusicResponse {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items));
}

function eventMatchesResource(event: RealtimeStoryboardEvent, resource: 'storyboardVideos' | 'storyboardMusic'): boolean {
  const payload = event.payload as StoryboardStatusPayload;
  if (payload.resource === resource) return true;
  if (payload.resource !== 'aiGenerationJob' || !Array.isArray(payload.storyboardBindings)) return false;
  return payload.storyboardBindings.some((binding) => (
    binding &&
    typeof binding === 'object' &&
    (binding as { resource?: unknown }).resource === resource
  ));
}

type StoryboardRealtimeResource<TStatus> = {
  resource: 'storyboardVideos' | 'storyboardMusic';
  initial: () => Promise<TStatus>;
  refresh: () => Promise<TStatus>;
  isReady: (status: TStatus) => boolean;
  failure: (status: TStatus) => string | null;
  isStatusPayload: (value: unknown) => value is TStatus;
};

function waitForStoryboardResource<TStatus>(
  draftId: string,
  resource: StoryboardRealtimeResource<TStatus>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      callback();
    };
    const rejectOnce = (reason: unknown) => finish(() => reject(reason));
    const resolveOnce = () => finish(resolve);
    const inspect = (status: TStatus) => {
      const failure = resource.failure(status);
      if (failure) {
        rejectOnce(new Error(failure));
        return;
      }
      if (resource.isReady(status)) {
        resolveOnce();
      }
    };
    const refresh = () => {
      resource.refresh().then(inspect).catch(rejectOnce);
    };

    unsubscribe = getRealtimeClient().subscribe(
      { type: 'subscribe', scope: 'draft-storyboard', draftId },
      {
        onEvent: (event) => {
          if (event.type !== 'storyboard.status.updated' || !eventMatchesResource(event, resource.resource)) {
            return;
          }
          const payload = event.payload as StoryboardStatusPayload;
          if (payload.resource === resource.resource && resource.isStatusPayload(payload.status)) {
            inspect(payload.status);
            return;
          }
          refresh();
        },
        onReconnect: refresh,
      },
    );

    resource.initial().then(inspect).catch(rejectOnce);
  });
}

async function waitForStoryboardVideos(draftId: string): Promise<void> {
  await waitForStoryboardResource(draftId, {
    resource: 'storyboardVideos',
    initial: () => fetchStoryboardVideos(draftId),
    refresh: () => fetchStoryboardVideos(draftId),
    isReady: videosAreReady,
    failure: getVideoFailure,
    isStatusPayload: isStoryboardVideoStatusResponse,
  });
}

async function waitForStoryboardMusic(draftId: string): Promise<void> {
  await waitForStoryboardResource(draftId, {
    resource: 'storyboardMusic',
    initial: () => generatePendingStoryboardMusic(draftId),
    refresh: () => fetchStoryboardMusic(draftId),
    isReady: musicIsReady,
    failure: getMusicFailure,
    isStatusPayload: isStoryboardMusicResponse,
  });
}

export function startAssembly(draftId: string, mode: StoryboardProjectAssemblyMode): Promise<string> {
  const key = getInFlightKey(draftId, mode);
  const existing = inFlightByDraft.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (mode === 'videos') {
      await Promise.all([
        waitForStoryboardVideos(draftId),
        waitForStoryboardMusic(draftId),
      ]);
    } else {
      await waitForStoryboardMusic(draftId);
    }
    return createProjectFromStoryboard(draftId, mode);
  })()
    .then((result) => result.projectId)
    .catch((err: unknown) => {
      inFlightByDraft.delete(key);
      throw err;
    });
  inFlightByDraft.set(key, promise);
  return promise;
}
