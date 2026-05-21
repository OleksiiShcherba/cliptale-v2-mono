import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStoryboardOpenAIImageQueueAdd } = vi.hoisted(() => ({
  mockStoryboardOpenAIImageQueueAdd: vi.fn(),
}));

vi.mock('@/queues/bullmq.js', () => ({
  storyboardOpenAIImageQueue: { add: mockStoryboardOpenAIImageQueueAdd },
}));

import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';

import { enqueueStoryboardOpenAIImage } from './enqueue-storyboard-openai-image.js';

describe('enqueueStoryboardOpenAIImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues storyboard OpenAI Images work with the persisted job id', async () => {
    const payload: StoryboardOpenAIImageJobPayload = {
      jobId: 'job-1',
      userId: 'user-1',
      draftId: 'draft-1',
      kind: 'scene',
      blockId: 'block-1',
      prompt: 'Create this scene.',
      referenceFileIds: ['style-file'],
      previousSceneFileId: 'previous-file',
      size: '1024x1024',
    };

    await enqueueStoryboardOpenAIImage(payload);

    expect(mockStoryboardOpenAIImageQueueAdd).toHaveBeenCalledWith(
      'storyboard-openai-image',
      payload,
      {
        jobId: 'job-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  });
});
