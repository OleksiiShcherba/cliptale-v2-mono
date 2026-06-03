/**
 * Tests that AiGenerateJobPayload in packages/project-schema carries optional
 * flowId / blockId fields (T4 / AC-10).
 */
import { describe, it, expect } from 'vitest';

import type { AiGenerateJobPayload } from '../types/job-payloads.js';

describe('AiGenerateJobPayload — flow linkage fields', () => {
  it('accepts a payload without flowId / blockId (existing behaviour)', () => {
    const payload: AiGenerateJobPayload = {
      jobId: 'job-001',
      userId: 'user-001',
      modelId: 'fal-ai/stable-diffusion-3',
      capability: 'image',
      provider: 'fal',
      prompt: 'A sunset over the sea',
      options: {},
    };

    expect(payload.flowId).toBeUndefined();
    expect(payload.blockId).toBeUndefined();
  });

  it('accepts a payload with both flowId and blockId (flow-linked generation)', () => {
    const payload: AiGenerateJobPayload = {
      jobId: 'job-002',
      userId: 'user-002',
      modelId: 'fal-ai/kling-video/v2/master/image-to-video',
      capability: 'video',
      provider: 'fal',
      prompt: 'Camera panning through the scene',
      options: { duration: 5 },
      flowId: '11111111-1111-4111-8111-111111111111',
      blockId: '22222222-2222-4222-8222-222222222222',
    };

    expect(payload.flowId).toBe('11111111-1111-4111-8111-111111111111');
    expect(payload.blockId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('accepts a payload with flowId explicitly undefined (optional field)', () => {
    const payload: AiGenerateJobPayload = {
      jobId: 'job-003',
      userId: 'user-003',
      modelId: 'fal-ai/stable-diffusion-3',
      capability: 'image',
      provider: 'fal',
      prompt: 'A cat',
      options: {},
      flowId: undefined,
      blockId: undefined,
    };

    expect(payload.flowId).toBeUndefined();
    expect(payload.blockId).toBeUndefined();
  });
});
