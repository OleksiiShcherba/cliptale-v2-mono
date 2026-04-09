import { describe, it, expect } from 'vitest';

import type { AiGenerationType, AiJobStatus, AiGenerationRequest, AiGenerationJob } from './types';

describe('ai-generation/types', () => {
  it('AiGenerationType accepts all four valid generation types', () => {
    const types: AiGenerationType[] = ['image', 'video', 'audio', 'text'];
    expect(types).toHaveLength(4);
  });

  it('AiJobStatus accepts all four valid statuses', () => {
    const statuses: AiJobStatus[] = ['queued', 'processing', 'completed', 'failed'];
    expect(statuses).toHaveLength(4);
  });

  it('AiGenerationRequest shape is structurally valid', () => {
    const request: AiGenerationRequest = {
      type: 'image',
      prompt: 'A sunset over mountains',
    };
    expect(request.type).toBe('image');
    expect(request.prompt).toBe('A sunset over mountains');
    expect(request.options).toBeUndefined();
    expect(request.provider).toBeUndefined();
  });

  it('AiGenerationRequest accepts optional options and provider', () => {
    const request: AiGenerationRequest = {
      type: 'video',
      prompt: 'A time-lapse of a city',
      options: { duration: 5, aspectRatio: '16:9' },
      provider: 'runway',
    };
    expect(request.options).toBeDefined();
    expect(request.provider).toBe('runway');
  });

  it('AiGenerationJob shape is structurally valid with null fields', () => {
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

  it('AiGenerationJob can hold completed state with resultAssetId', () => {
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

  it('AiGenerationJob can hold failed state with errorMessage', () => {
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
