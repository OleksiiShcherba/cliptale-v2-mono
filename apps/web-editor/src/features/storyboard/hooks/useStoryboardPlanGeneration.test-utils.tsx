import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import type { StoryboardState } from '@/features/storyboard/types';

import { useStoryboardPlanGeneration } from './useStoryboardPlanGeneration';

export const DRAFT_ID = 'draft-abc';
export const JOB_ID = 'job-123';

export type PlanSubscriptionHandler = {
  onEvent: (event: {
    type: 'storyboard.status.updated';
    draftId: string;
    userId: string;
    payload: Record<string, unknown>;
  }) => void;
  onReconnect?: () => void;
};

export function makeState(options: { withMusic?: boolean } = {}): StoryboardState {
  return {
    blocks: [
      {
        id: 'start-1',
        draftId: DRAFT_ID,
        blockType: 'start',
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 0,
        positionX: 40,
        positionY: 200,
        sortOrder: 0,
        style: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        mediaItems: [],
      },
      {
        id: 'scene-1',
        draftId: DRAFT_ID,
        blockType: 'scene',
        name: 'Scene 1',
        prompt: 'Wide product reveal',
        videoPrompt: null,
        durationS: 6,
        positionX: 320,
        positionY: 200,
        sortOrder: 1,
        style: 'cinematic',
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        mediaItems: [],
      },
      {
        id: 'end-1',
        draftId: DRAFT_ID,
        blockType: 'end',
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 0,
        positionX: 600,
        positionY: 200,
        sortOrder: 999,
        style: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        mediaItems: [],
      },
    ],
    edges: [
      {
        id: 'edge-1',
        draftId: DRAFT_ID,
        sourceBlockId: 'start-1',
        targetBlockId: 'scene-1',
      },
      {
        id: 'edge-2',
        draftId: DRAFT_ID,
        sourceBlockId: 'scene-1',
        targetBlockId: 'end-1',
      },
    ],
    musicBlocks: options.withMusic
      ? [
          {
            id: 'music-1',
            draftId: DRAFT_ID,
            name: 'Opening music',
            sourceMode: 'generate_on_step3',
            prompt: 'Soft pulse',
            compositionPlan: null,
            existingFileId: null,
            startSceneBlockId: 'scene-1',
            endSceneBlockId: 'scene-1',
            positionX: 320,
            positionY: 520,
            sortOrder: 0,
            volume: 0.8,
            fadeInS: 0,
            fadeOutS: 1,
            loopMode: 'trim',
            generationStatus: null,
            generationJobId: null,
            outputFileId: null,
            errorMessage: null,
            createdAt: '2026-05-14T00:00:00.000Z',
            updatedAt: '2026-05-14T00:00:00.000Z',
          },
        ]
      : [],
  };
}

export function renderPlanHook(initialDraftId = DRAFT_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return {
    ...renderHook(
      ({ draftId }) => useStoryboardPlanGeneration(draftId),
      { initialProps: { draftId: initialDraftId }, wrapper },
    ),
    invalidateSpy,
  };
}

export function emitPlanStatus(
  handlers: PlanSubscriptionHandler[],
  status: 'queued' | 'running' | 'completed' | 'failed',
  jobId = JOB_ID,
): void {
  act(() => {
    handlers.at(-1)?.onEvent({
      type: 'storyboard.status.updated',
      draftId: DRAFT_ID,
      userId: 'user-1',
      payload: {
        resource: 'storyboardPlan',
        jobId,
        status,
      },
    });
  });
}

export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
