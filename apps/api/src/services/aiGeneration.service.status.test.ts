/**
 * Unit tests for getJobStatus, listModels (catalog grouping), and
 * listUserVoices. Repository + queue mocks come from the colocated fixtures file.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { ForbiddenError, NotFoundError } from '@/lib/errors.js';

import {
  getJobByIdMock,
  getVoicesByUserIdMock,
  resetMocks,
  TEST_PROJECT,
  TEST_USER,
} from './aiGeneration.service.fixtures.js';

// Import after fixtures so the service binds to the mocked modules.
const { getJobStatus, listModels, listUserVoices } = await import('./aiGeneration.service.js');

beforeEach(() => {
  resetMocks();
});

// ── getJobStatus ─────────────────────────────────────────────────────────────

describe('aiGeneration.service / getJobStatus', () => {
  it('returns the full status shape for the requesting user', async () => {
    getJobByIdMock.mockResolvedValue({
      jobId: 'job-1',
      userId: TEST_USER,
      projectId: TEST_PROJECT,
      modelId: 'fal-ai/nano-banana-2',
      capability: 'text_to_image',
      prompt: 'hi',
      options: null,
      status: 'processing',
      progress: 42,
      resultAssetId: null,
      resultUrl: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getJobStatus('job-1', TEST_USER);
    expect(result).toEqual({
      jobId: 'job-1',
      status: 'processing',
      progress: 42,
      resultAssetId: null,
      resultUrl: null,
      errorMessage: null,
    });
  });

  it('throws NotFoundError when the job does not exist', async () => {
    getJobByIdMock.mockResolvedValue(null);
    await expect(getJobStatus('nope', TEST_USER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws ForbiddenError when the job belongs to another user', async () => {
    getJobByIdMock.mockResolvedValue({
      jobId: 'job-2',
      userId: 'some-other-user',
      projectId: TEST_PROJECT,
      modelId: 'fal-ai/nano-banana-2',
      capability: 'text_to_image',
      prompt: 'hi',
      options: null,
      status: 'queued',
      progress: 0,
      resultAssetId: null,
      resultUrl: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(getJobStatus('job-2', TEST_USER)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

// ── listModels ───────────────────────────────────────────────────────────────

describe('aiGeneration.service / listModels', () => {
  it('groups the full catalog by capability with every entry present exactly once', async () => {
    const { AI_MODELS } = await import('@ai-video-editor/api-contracts');
    const result = listModels();

    expect(Object.keys(result).sort()).toEqual([
      'image_edit',
      'image_to_video',
      'music_generation',
      'speech_to_speech',
      'text_to_image',
      'text_to_speech',
      'text_to_video',
      'voice_cloning',
    ]);

    const flattenedIds = (Object.values(result) as Array<Array<{ id: string }>>)
      .flat()
      .map((m) => m.id);

    const catalogIds = AI_MODELS.map((m) => m.id);

    expect(flattenedIds.slice().sort()).toEqual([...catalogIds].sort());
    expect(flattenedIds.length).toBe(catalogIds.length);

    for (const capability of Object.keys(result) as Array<
      keyof typeof result
    >) {
      for (const model of result[capability]) {
        expect(model.capability).toBe(capability);
      }
    }
  });
});

// ── listUserVoices ────────────────────────────────────────────────────────────

describe('aiGeneration.service / listUserVoices', () => {
  it('returns voices from the repository for the given user', async () => {
    const fakeVoices = [
      {
        voiceId: 'v-1',
        userId: TEST_USER,
        label: 'My Voice',
        elevenLabsVoiceId: 'el-abc',
        createdAt: new Date('2026-04-10T00:00:00Z'),
      },
    ];
    getVoicesByUserIdMock.mockResolvedValue(fakeVoices);

    const result = await listUserVoices(TEST_USER);

    expect(getVoicesByUserIdMock).toHaveBeenCalledWith(TEST_USER);
    expect(result).toEqual(fakeVoices);
  });

  it('returns an empty array when the user has no cloned voices', async () => {
    getVoicesByUserIdMock.mockResolvedValue([]);

    const result = await listUserVoices(TEST_USER);

    expect(result).toEqual([]);
  });
});
