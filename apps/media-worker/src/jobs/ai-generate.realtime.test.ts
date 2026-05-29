import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPublishAiGenerationJobStatus } = vi.hoisted(() => ({
  mockPublishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: mockPublishAiGenerationJobStatus,
}));

import { processAiGenerateJob } from './ai-generate.job.js';
import {
  IMAGE_OUTPUT,
  installFetch,
  makeDeps,
  makeJob,
  makeMocks,
} from './ai-generate.job.fixtures.js';

describe('processAiGenerateJob realtime publishing', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('publishes processing, progress, and completed events only after DB writes', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(makeJob(), makeDeps(m));

    expect(mockPublishAiGenerationJobStatus).toHaveBeenCalledTimes(3);
    expect(mockPublishAiGenerationJobStatus).toHaveBeenNthCalledWith(1, {
      pool: m.pool,
      jobId: 'job-1',
    });

    expect(m.execute.mock.calls[0]![1]).toEqual(['processing', null, 'job-1']);
    expect(
      m.execute.mock.invocationCallOrder[0]!,
    ).toBeLessThan(mockPublishAiGenerationJobStatus.mock.invocationCallOrder[0]!);

    expect(m.execute.mock.calls[1]![1]).toEqual([50, 'job-1']);
    expect(
      m.execute.mock.invocationCallOrder[1]!,
    ).toBeLessThan(mockPublishAiGenerationJobStatus.mock.invocationCallOrder[1]!);

    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledWith('job-1', expect.any(String));
    const completedPublishOrder =
      mockPublishAiGenerationJobStatus.mock.invocationCallOrder[
        mockPublishAiGenerationJobStatus.mock.invocationCallOrder.length - 1
      ]!;
    expect(
      m.aiGenerationJobRepoSetOutputFile.mock.invocationCallOrder[0]!,
    ).toBeLessThan(completedPublishOrder);
  });

  it('publishes failed events after the failed job row and storyboard bindings are written', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    m.submitFalJob.mockRejectedValueOnce(new Error('provider down'));

    await expect(processAiGenerateJob(makeJob(), makeDeps(m))).rejects.toThrow('provider down');

    expect(mockPublishAiGenerationJobStatus).toHaveBeenCalledTimes(2);
    expect(m.execute.mock.calls[1]![1]).toEqual(['failed', 'provider down', 'job-1']);
    expect(m.execute.mock.calls[2]![0]).toContain('UPDATE storyboard_scene_video_jobs');
    expect(m.execute.mock.calls[3]![0]).toContain('UPDATE storyboard_music_generation_jobs');
    const failedPublishOrder =
      mockPublishAiGenerationJobStatus.mock.invocationCallOrder[
        mockPublishAiGenerationJobStatus.mock.invocationCallOrder.length - 1
      ]!;
    expect(
      m.execute.mock.invocationCallOrder[3]!,
    ).toBeLessThan(failedPublishOrder);
    expect(
      m.storyboardIllustrationMarkFailed.mock.invocationCallOrder[0]!,
    ).toBeLessThan(failedPublishOrder);
  });
});
