import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPublish, mockGetJobById } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(1),
  mockGetJobById: vi.fn(),
}));

vi.mock('@/lib/redis.js', () => ({
  redis: {
    publish: mockPublish,
  },
}));

vi.mock('@/repositories/aiGenerationJob.repository.js', () => ({
  getJobById: mockGetJobById,
}));

import { REALTIME_REDIS_CHANNEL } from '@ai-video-editor/project-schema';

import {
  publishAiJobUpdatedById,
  publishPipelineState,
  publishStoryboardStatusUpdated,
} from './realtimePublisher.js';

describe('realtimePublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes storyboard status events with user and draft identifiers', async () => {
    await publishStoryboardStatusUpdated({
      userId: 'user-1',
      draftId: 'draft-1',
      payload: {
        resource: 'storyboardPlan',
        jobId: 'job-1',
        status: 'queued',
      },
    });

    expect(mockPublish).toHaveBeenCalledOnce();
    const [channel, serialized] = mockPublish.mock.calls[0] as [string, string];
    expect(channel).toBe(REALTIME_REDIS_CHANNEL);
    expect(JSON.parse(serialized)).toEqual(expect.objectContaining({
      type: 'storyboard.status.updated',
      userId: 'user-1',
      draftId: 'draft-1',
      eventId: expect.any(String),
      occurredAt: expect.any(String),
      payload: {
        resource: 'storyboardPlan',
        jobId: 'job-1',
        status: 'queued',
      },
    }));
  });

  it('publishes AI job and storyboard status events with failure details', async () => {
    mockGetJobById.mockResolvedValue({
      jobId: 'job-1',
      userId: 'user-1',
      modelId: 'model-1',
      capability: 'text_to_image',
      status: 'failed',
      progress: 25,
      outputFileId: null,
      draftId: 'draft-1',
      resultUrl: null,
      errorMessage: 'provider failed',
    });

    await publishAiJobUpdatedById('job-1', {
      resource: 'aiGenerationJob',
      jobId: 'job-1',
      status: 'failed',
      errorMessage: 'provider failed',
    });

    expect(mockPublish).toHaveBeenCalledTimes(2);
    const aiEvent = JSON.parse(mockPublish.mock.calls[0]![1] as string);
    expect(aiEvent).toEqual(expect.objectContaining({
      type: 'ai.job.updated',
      userId: 'user-1',
      jobId: 'job-1',
      draftId: 'draft-1',
      payload: expect.objectContaining({
        jobId: 'job-1',
        draftId: 'draft-1',
        status: 'failed',
        progress: 25,
        errorMessage: 'provider failed',
      }),
    }));
    const storyboardEvent = JSON.parse(mockPublish.mock.calls[1]![1] as string);
    expect(storyboardEvent).toEqual(expect.objectContaining({
      type: 'storyboard.status.updated',
      userId: 'user-1',
      draftId: 'draft-1',
      payload: {
        resource: 'aiGenerationJob',
        jobId: 'job-1',
        status: 'failed',
        errorMessage: 'provider failed',
      },
    }));
  });

  it('publishes the full projected pipeline state (including version) on storyboard.status.updated', async () => {
    await publishPipelineState({
      userId: 'user-1',
      draftId: 'draft-1',
      state: {
        draft_id: 'draft-1',
        active_phase: 'reference_data',
        active_run_phase: 'reference_data',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'running' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: null,
        version: 9,
        cost_estimate: null,
        error_message: null,
        updated_at: '2026-06-15T10:00:00.000Z',
      },
    });

    expect(mockPublish).toHaveBeenCalledOnce();
    const [channel, serialized] = mockPublish.mock.calls[0] as [string, string];
    expect(channel).toBe(REALTIME_REDIS_CHANNEL);
    const event = JSON.parse(serialized);
    expect(event).toEqual(expect.objectContaining({
      type: 'storyboard.status.updated',
      userId: 'user-1',
      draftId: 'draft-1',
      eventId: expect.any(String),
      occurredAt: expect.any(String),
    }));
    // Full projected state is the payload, version-stamped (AC-05 / ADR-0004).
    expect(event.payload).toEqual(expect.objectContaining({
      draft_id: 'draft-1',
      active_phase: 'reference_data',
      version: 9,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'running' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    }));
    expect(event.payload.version).toBe(9);
  });

  it('swallows Redis publish failures so API calls can continue', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockPublish.mockRejectedValueOnce(new Error('redis down'));

    await expect(publishStoryboardStatusUpdated({
      userId: 'user-1',
      draftId: 'draft-1',
      payload: { status: 'queued' },
    })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      '[realtime] Failed to publish status event:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
