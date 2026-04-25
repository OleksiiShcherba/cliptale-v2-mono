/**
 * Unit tests for submitGeneration — happy path, validation errors,
 * kling-o3 XOR, and DB prompt column derivation.
 *
 * Repository + queue modules are mocked via the colocated fixtures file.
 * The real AI_MODELS catalog is imported for authenticity.
 *
 * After Batch 1 Subtask 8: `submitGeneration` is user-scoped only — no
 * `projectId` parameter. The enqueue/createJob payloads no longer carry
 * `projectId`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { ValidationError } from '@/lib/errors.js';

import {
  createJobMock,
  enqueueMock,
  FIXED_JOB_ID,
  FIXED_PRESIGNED_URL,
  findByIdForUserMock,
  makeFileRow,
  resetMocks,
  TEST_FILE_ID,
  TEST_USER,
} from './aiGeneration.service.fixtures.js';

// Import after fixtures so the service binds to the mocked modules.
const { submitGeneration } = await import('./aiGeneration.service.js');

beforeEach(() => {
  resetMocks();
});

// ── submitGeneration ─────────────────────────────────────────────────────────

describe('aiGeneration.service / submitGeneration', () => {
  it('happy path: text-to-image model enqueues + persists and returns queued', async () => {
    const result = await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'a serene beach at dawn',
      options: {},
    });

    expect(result).toEqual({ jobId: FIXED_JOB_ID, status: 'queued' });

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER,
        modelId: 'fal-ai/nano-banana-2',
        capability: 'text_to_image',
        prompt: 'a serene beach at dawn',
        options: expect.objectContaining({ prompt: 'a serene beach at dawn' }),
      }),
    );
    // Ensure projectId is NOT in the enqueue payload.
    expect(enqueueMock.mock.calls[0]![0]).not.toHaveProperty('projectId');

    expect(createJobMock).toHaveBeenCalledTimes(1);
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: FIXED_JOB_ID,
        userId: TEST_USER,
        modelId: 'fal-ai/nano-banana-2',
        capability: 'text_to_image',
        prompt: 'a serene beach at dawn',
      }),
    );
    // Ensure projectId is NOT in the createJob payload.
    expect(createJobMock.mock.calls[0]![0]).not.toHaveProperty('projectId');
  });

  it('throws ValidationError for an unknown modelId', async () => {
    await expect(
      submitGeneration(TEST_USER, {
        modelId: 'fal-ai/does-not-exist',
        prompt: 'x',
        options: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it('throws ValidationError when a required field is missing', async () => {
    // nano-banana-2/edit requires both prompt AND image_urls — omit image_urls.
    await expect(
      submitGeneration(TEST_USER, {
        modelId: 'fal-ai/nano-banana-2/edit',
        prompt: 'merge these',
        options: {},
      }),
    ).rejects.toThrow(/image_urls.*required/);
  });

  it('throws ValidationError for an unknown option key', async () => {
    await expect(
      submitGeneration(TEST_USER, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'hello',
        options: { not_a_real_field: 1 },
      }),
    ).rejects.toThrow(/Unknown field 'not_a_real_field'/);
  });

  it('throws ValidationError when a boolean field receives a number', async () => {
    await expect(
      submitGeneration(TEST_USER, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'hello',
        options: { limit_generations: 1 },
      }),
    ).rejects.toThrow(/limit_generations.*must be a boolean/);
  });

  it('throws ValidationError when an enum field receives an out-of-set value', async () => {
    await expect(
      submitGeneration(TEST_USER, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'hello',
        options: { resolution: '8K' },
      }),
    ).rejects.toThrow(/resolution.*must be one of/);
  });

  it('copies top-level prompt into options.prompt when the model accepts it', async () => {
    await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'sunrise',
      options: {},
    });
    const enqueuePayload = enqueueMock.mock.calls[0]![0] as {
      options: Record<string, unknown>;
    };
    expect(enqueuePayload.options['prompt']).toBe('sunrise');
  });

  it('does not overwrite an existing options.prompt with the top-level prompt', async () => {
    await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'top-level should be ignored',
      options: { prompt: 'explicit options prompt' },
    });
    const enqueuePayload = enqueueMock.mock.calls[0]![0] as {
      options: Record<string, unknown>;
    };
    expect(enqueuePayload.options['prompt']).toBe('explicit options prompt');
  });

  it('resolves an image_url file id into a presigned URL before enqueue/persist', async () => {
    findByIdForUserMock.mockResolvedValue(
      makeFileRow({ storageUri: 's3://test-bucket/users/u/files/f/start.png' }),
    );

    await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/ltx-2-19b/image-to-video',
      options: { image_url: TEST_FILE_ID, prompt: 'x' },
    });

    expect(findByIdForUserMock).toHaveBeenCalledWith(TEST_FILE_ID, TEST_USER);

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          image_url: FIXED_PRESIGNED_URL,
        }),
      }),
    );
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          image_url: FIXED_PRESIGNED_URL,
        }),
      }),
    );
  });
});

// ── kling-o3 XOR ─────────────────────────────────────────────────────────────

describe('aiGeneration.service / kling-o3 prompt XOR', () => {
  const KLING = 'fal-ai/kling-video/o3/standard/image-to-video';
  const IMG = 'https://example.com/start.jpg';

  it('rejects when both prompt and multi_prompt are provided', async () => {
    await expect(
      submitGeneration(TEST_USER, {
        modelId: KLING,
        options: {
          image_url: IMG,
          prompt: 'hello',
          multi_prompt: ['one', 'two'],
        },
      }),
    ).rejects.toThrow(/exactly one of 'prompt' or 'multi_prompt', not both/);
  });

  it('rejects when neither prompt nor multi_prompt is provided', async () => {
    await expect(
      submitGeneration(TEST_USER, {
        modelId: KLING,
        options: { image_url: IMG },
      }),
    ).rejects.toThrow(/requires exactly one of 'prompt' or 'multi_prompt'/);
  });

  it('accepts exactly one: only options.prompt', async () => {
    const result = await submitGeneration(TEST_USER, {
      modelId: KLING,
      options: { image_url: IMG, prompt: 'drone shot over hills' },
    });
    expect(result.status).toBe('queued');
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'drone shot over hills',
        capability: 'image_to_video',
      }),
    );
  });

  it('accepts exactly one: only options.multi_prompt', async () => {
    const result = await submitGeneration(TEST_USER, {
      modelId: KLING,
      options: { image_url: IMG, multi_prompt: ['scene one', 'scene two'] },
    });
    expect(result.status).toBe('queued');
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'scene one' }),
    );
  });

  it('accepts exactly one: top-level prompt is merged into options.prompt', async () => {
    const result = await submitGeneration(TEST_USER, {
      modelId: KLING,
      prompt: 'merged top-level',
      options: { image_url: IMG },
    });
    expect(result.status).toBe('queued');
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ prompt: 'merged top-level' }),
      }),
    );
  });
});

// ── DB prompt column derivation ──────────────────────────────────────────────

describe('aiGeneration.service / DB prompt column derivation', () => {
  const KLING = 'fal-ai/kling-video/o3/standard/image-to-video';
  const IMG = 'https://example.com/start.jpg';

  it('uses the top-level prompt when present', async () => {
    await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'top-level',
      options: {},
    });
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'top-level' }),
    );
  });

  it('uses options.prompt when top-level is absent', async () => {
    await submitGeneration(TEST_USER, {
      modelId: 'fal-ai/nano-banana-2',
      options: { prompt: 'from options' },
    });
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'from options' }),
    );
  });

  it('uses multi_prompt[0] when only multi_prompt is set', async () => {
    await submitGeneration(TEST_USER, {
      modelId: KLING,
      options: { image_url: IMG, multi_prompt: ['first shot', 'second'] },
    });
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'first shot' }),
    );
  });
});
