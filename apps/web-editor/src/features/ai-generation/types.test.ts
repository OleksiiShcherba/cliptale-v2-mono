import { describe, it, expect } from 'vitest';

import type {
  AiGenerationJob,
  AiGenerationRequest,
  AiJobStatus,
  FalCapability,
  FalFieldType,
  ListModelsResponse,
} from './types';

describe('ai-generation/types', () => {
  it('FalCapability accepts all four supported capabilities', () => {
    const capabilities: FalCapability[] = [
      'text_to_image',
      'image_edit',
      'text_to_video',
      'image_to_video',
    ];
    expect(capabilities).toHaveLength(4);
  });

  it('FalFieldType enumerates every supported field kind', () => {
    const fieldTypes: FalFieldType[] = [
      'string',
      'text',
      'number',
      'boolean',
      'enum',
      'image_url',
      'image_url_list',
      'string_list',
    ];
    expect(fieldTypes).toHaveLength(8);
  });

  it('AiJobStatus accepts all four valid statuses', () => {
    const statuses: AiJobStatus[] = ['queued', 'processing', 'completed', 'failed'];
    expect(statuses).toHaveLength(4);
  });

  it('AiGenerationRequest is structurally valid with minimum fields', () => {
    const request: AiGenerationRequest = {
      modelId: 'fal-ai/nano-banana-2',
      options: {},
    };
    expect(request.modelId).toBe('fal-ai/nano-banana-2');
    expect(request.prompt).toBeUndefined();
    expect(request.options).toEqual({});
  });

  it('AiGenerationRequest accepts optional top-level prompt', () => {
    const request: AiGenerationRequest = {
      modelId: 'fal-ai/gpt-image-1.5',
      prompt: 'A city at dusk',
      options: { num_images: 2 },
    };
    expect(request.prompt).toBe('A city at dusk');
    expect(request.options.num_images).toBe(2);
  });

  it('ListModelsResponse maps every capability to an array of models', () => {
    const response: ListModelsResponse = {
      text_to_image: [],
      image_edit: [],
      text_to_video: [],
      image_to_video: [],
    };
    expect(Object.keys(response)).toHaveLength(4);
  });

  it('AiGenerationJob can hold a queued state with null fields', () => {
    const job: AiGenerationJob = {
      jobId: 'job-123',
      status: 'queued',
      progress: 0,
      resultAssetId: null,
      errorMessage: null,
    };
    expect(job.jobId).toBe('job-123');
    expect(job.status).toBe('queued');
    expect(job.resultAssetId).toBeNull();
    expect(job.errorMessage).toBeNull();
  });

  it('AiGenerationJob can hold a completed state with a resultAssetId', () => {
    const job: AiGenerationJob = {
      jobId: 'job-456',
      status: 'completed',
      progress: 100,
      resultAssetId: 'asset-789',
      errorMessage: null,
    };
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.resultAssetId).toBe('asset-789');
  });

  it('AiGenerationJob can hold a failed state with an errorMessage', () => {
    const job: AiGenerationJob = {
      jobId: 'job-789',
      status: 'failed',
      progress: 50,
      resultAssetId: null,
      errorMessage: 'Provider API rate limit exceeded',
    };
    expect(job.status).toBe('failed');
    expect(job.errorMessage).toBe('Provider API rate limit exceeded');
  });
});
