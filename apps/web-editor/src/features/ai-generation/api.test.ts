import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

import { submitGeneration, getJobStatus } from './api';

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ai-generation/api', () => {
  describe('submitGeneration', () => {
    it('calls POST /projects/:id/ai/generate with the request payload', async () => {
      const response = { jobId: 'job-123', status: 'queued' };
      mockApiClient.post.mockResolvedValue(okResponse(response));

      const result = await submitGeneration('proj-1', {
        type: 'image',
        prompt: 'A sunset',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/projects/proj-1/ai/generate', {
        type: 'image',
        prompt: 'A sunset',
      });
      expect(result).toEqual(response);
    });

    it('includes options and provider when provided', async () => {
      mockApiClient.post.mockResolvedValue(okResponse({ jobId: 'job-456', status: 'queued' }));

      await submitGeneration('proj-2', {
        type: 'video',
        prompt: 'A city timelapse',
        options: { duration: 5, aspectRatio: '16:9' },
        provider: 'runway',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/projects/proj-2/ai/generate', {
        type: 'video',
        prompt: 'A city timelapse',
        options: { duration: 5, aspectRatio: '16:9' },
        provider: 'runway',
      });
    });

    it('throws on non-ok response', async () => {
      mockApiClient.post.mockResolvedValue(errorResponse(400, 'Invalid prompt'));

      await expect(
        submitGeneration('proj-1', { type: 'image', prompt: '' }),
      ).rejects.toThrow('Failed to submit AI generation (400): Invalid prompt');
    });
  });

  describe('getJobStatus', () => {
    it('calls GET /ai/jobs/:jobId and returns job data', async () => {
      const job = {
        jobId: 'job-123',
        status: 'processing',
        progress: 42,
        resultAssetId: null,
        errorMessage: null,
      };
      mockApiClient.get.mockResolvedValue(okResponse(job));

      const result = await getJobStatus('job-123');

      expect(mockApiClient.get).toHaveBeenCalledWith('/ai/jobs/job-123');
      expect(result).toEqual(job);
    });

    it('returns completed job with resultAssetId', async () => {
      const job = {
        jobId: 'job-456',
        status: 'completed',
        progress: 100,
        resultAssetId: 'asset-789',
        errorMessage: null,
      };
      mockApiClient.get.mockResolvedValue(okResponse(job));

      const result = await getJobStatus('job-456');

      expect(result.status).toBe('completed');
      expect(result.resultAssetId).toBe('asset-789');
    });

    it('throws on non-ok response', async () => {
      mockApiClient.get.mockResolvedValue(errorResponse(404, 'Job not found'));

      await expect(getJobStatus('bad-id')).rejects.toThrow(
        'Failed to get job status (404): Job not found',
      );
    });
  });
});
