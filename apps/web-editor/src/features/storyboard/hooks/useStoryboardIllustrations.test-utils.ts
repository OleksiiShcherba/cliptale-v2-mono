import { act } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

import type {
  StoryboardIllustrationReferenceStatus,
  StoryboardIllustrationStatusItem,
  StoryboardIllustrationStatusResponse,
} from '@/features/storyboard/types';

export const DRAFT_ID = 'draft-1';
export const NEXT_DRAFT_ID = 'draft-2';

const storyboardIllustrationMocks = vi.hoisted(() => ({
  mockFetchStoryboardIllustrations: vi.fn(),
  mockStartStoryboardIllustrations: vi.fn(),
  mockStartStoryboardBlockIllustration: vi.fn(),
  mockDraftSubscriptionHandlers: [] as Array<{
    onEvent: (event: {
      type: 'storyboard.status.updated';
      draftId: string;
      userId: string;
      payload: Record<string, unknown>;
    }) => void;
    onReconnect?: () => void;
  }>,
}));

export const {
  mockFetchStoryboardIllustrations,
  mockStartStoryboardIllustrations,
  mockStartStoryboardBlockIllustration,
  mockDraftSubscriptionHandlers,
} = storyboardIllustrationMocks;

vi.mock('@/features/storyboard/api', () => ({
  fetchStoryboardIllustrations: mockFetchStoryboardIllustrations,
  startStoryboardIllustrations: mockStartStoryboardIllustrations,
  startStoryboardBlockIllustration: mockStartStoryboardBlockIllustration,
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn((_draftId: string | null, handlers: {
    onEvent: (event: {
      type: 'storyboard.status.updated';
      draftId: string;
      userId: string;
      payload: Record<string, unknown>;
    }) => void;
    onReconnect?: () => void;
  }) => {
    mockDraftSubscriptionHandlers.push(handlers);
  }),
}));

export function item(
  overrides: Partial<StoryboardIllustrationStatusItem> = {},
): StoryboardIllustrationStatusItem {
  return {
    blockId: 'block-1',
    status: 'queued',
    jobId: null,
    outputFileId: null,
    errorMessage: null,
    ...overrides,
  };
}

export function reference(
  overrides: Partial<StoryboardIllustrationReferenceStatus> = {},
): StoryboardIllustrationReferenceStatus {
  return {
    status: 'queued',
    jobId: null,
    outputFileId: null,
    sourceReferenceFileIds: [],
    approvalStatus: 'pending',
    errorMessage: null,
    ...overrides,
  };
}

export function response(
  overrides: Partial<StoryboardIllustrationStatusResponse> = {},
): StoryboardIllustrationStatusResponse {
  return {
    reference: reference(),
    items: [item()],
    ...overrides,
  } as StoryboardIllustrationStatusResponse;
}

export function emitIllustrationStatus(status: StoryboardIllustrationStatusResponse): void {
  act(() => {
    mockDraftSubscriptionHandlers.at(-1)?.onEvent({
      type: 'storyboard.status.updated',
      draftId: DRAFT_ID,
      userId: 'user-1',
      payload: {
        resource: 'storyboardIllustrations',
        status,
      },
    });
  });
}

export function setupStoryboardIllustrationsTestLifecycle(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftSubscriptionHandlers.length = 0;
    mockFetchStoryboardIllustrations.mockResolvedValue(response());
    mockStartStoryboardIllustrations.mockResolvedValue(response({
      items: [item({ status: 'queued', jobId: 'job-1' })],
    }));
    mockStartStoryboardBlockIllustration.mockResolvedValue(response({
      items: [item({ status: 'queued', jobId: 'job-2' })],
    }));
  });
}
