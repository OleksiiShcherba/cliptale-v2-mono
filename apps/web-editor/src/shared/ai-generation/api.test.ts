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

import { getContextAssets, getJobStatus, listModels, submitGeneration } from './api';

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
  describe('listModels', () => {
    it('calls GET /ai/models and returns the grouped catalog', async () => {
      const catalog = {
        text_to_image: [
          {
            id: 'fal-ai/nano-banana-2',
            capability: 'text_to_image',
            label: 'Nano Banana 2',
            description: 'Test',
            inputSchema: { fields: [] },
          },
        ],
        image_edit: [],
        text_to_video: [],
        image_to_video: [],
      };
      mockApiClient.get.mockResolvedValue(okResponse(catalog));

      const result = await listModels();

      expect(mockApiClient.get).toHaveBeenCalledWith('/ai/models');
      expect(result).toEqual(catalog);
    });

    it('throws on non-ok response', async () => {
      mockApiClient.get.mockResolvedValue(errorResponse(500, 'Internal error'));

      await expect(listModels()).rejects.toThrow(
        'Failed to list AI models (500): Internal error',
      );
    });
  });

  describe('submitGeneration', () => {
    it('POSTs to /projects/:id/ai/generate when context.kind is "project"', async () => {
      mockApiClient.post.mockResolvedValue(okResponse({ jobId: 'job-1', status: 'queued' }));

      const result = await submitGeneration(
        { kind: 'project', id: 'proj-1' },
        { modelId: 'fal-ai/nano-banana-2', options: {} },
      );

      expect(mockApiClient.post).toHaveBeenCalledWith('/projects/proj-1/ai/generate', {
        modelId: 'fal-ai/nano-banana-2',
        options: {},
      });
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
    });

    it('POSTs to /generation-drafts/:id/ai/generate when context.kind is "draft"', async () => {
      mockApiClient.post.mockResolvedValue(okResponse({ jobId: 'job-2', status: 'queued' }));

      const result = await submitGeneration(
        { kind: 'draft', id: 'draft-42' },
        { modelId: 'fal-ai/nano-banana-2', options: {} },
      );

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/generation-drafts/draft-42/ai/generate',
        { modelId: 'fal-ai/nano-banana-2', options: {} },
      );
      expect(result).toEqual({ jobId: 'job-2', status: 'queued' });
    });

    it('POSTs top-level prompt alongside options when supplied (project context)', async () => {
      mockApiClient.post.mockResolvedValue(okResponse({ jobId: 'job-2', status: 'queued' }));

      await submitGeneration(
        { kind: 'project', id: 'proj-2' },
        {
          modelId: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
          prompt: 'A sunset over mountains',
          options: { aspect_ratio: '16:9', duration: '5' },
        },
      );

      expect(mockApiClient.post).toHaveBeenCalledWith('/projects/proj-2/ai/generate', {
        modelId: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
        prompt: 'A sunset over mountains',
        options: { aspect_ratio: '16:9', duration: '5' },
      });
    });

    it('throws on non-ok response', async () => {
      mockApiClient.post.mockResolvedValue(errorResponse(400, 'Invalid modelId'));

      await expect(
        submitGeneration({ kind: 'project', id: 'proj-1' }, { modelId: 'bogus', options: {} }),
      ).rejects.toThrow('Failed to submit AI generation (400): Invalid modelId');
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

  describe('getContextAssets', () => {
    it('calls GET /projects/:id/assets when context.kind is "project"', async () => {
      const assets = [
        { id: 'a1', filename: 'img.jpg', contentType: 'image/jpeg', status: 'ready' },
      ];
      mockApiClient.get.mockResolvedValue(okResponse(assets));

      const result = await getContextAssets({ kind: 'project', id: 'proj-1' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/projects/proj-1/assets');
      expect(result).toEqual(assets);
    });

    it('calls GET /generation-drafts/:id/assets when context.kind is "draft"', async () => {
      const assets = [
        { id: 'a2', filename: 'sound.mp3', contentType: 'audio/mpeg', status: 'ready' },
      ];
      mockApiClient.get.mockResolvedValue(okResponse(assets));

      const result = await getContextAssets({ kind: 'draft', id: 'draft-42' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/generation-drafts/draft-42/assets');
      expect(result).toEqual(assets);
    });

    it('throws on non-ok response', async () => {
      mockApiClient.get.mockResolvedValue(errorResponse(403, 'Forbidden'));

      await expect(
        getContextAssets({ kind: 'project', id: 'proj-1' }),
      ).rejects.toThrow('Failed to get assets (403): Forbidden');
    });
  });
});
