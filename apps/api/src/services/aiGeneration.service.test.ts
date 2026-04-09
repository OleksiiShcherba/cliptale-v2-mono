import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockJobRepo, mockProviderService, mockEnqueue } = vi.hoisted(() => ({
  mockJobRepo: {
    createJob: vi.fn().mockResolvedValue(undefined),
    getJobById: vi.fn(),
    updateJobStatus: vi.fn(),
    updateJobProgress: vi.fn(),
    updateJobResult: vi.fn(),
  },
  mockProviderService: {
    getDecryptedKey: vi.fn().mockResolvedValue('sk-decrypted-key'),
    listProviders: vi.fn().mockResolvedValue([]),
  },
  mockEnqueue: vi.fn().mockResolvedValue('job-uuid-123'),
}));

vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockJobRepo);
vi.mock('@/services/aiProvider.service.js', () => mockProviderService);
vi.mock('@/queues/jobs/enqueue-ai-generate.js', () => ({
  enqueueAiGenerateJob: mockEnqueue,
}));

import { submitGeneration, getJobStatus } from './aiGeneration.service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const PROJECT_ID = 'proj-123';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('aiGeneration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitGeneration', () => {
    it('enqueues a job and creates a DB row when provider is specified', async () => {
      const result = await submitGeneration(USER_ID, PROJECT_ID, {
        type: 'image',
        prompt: 'a sunset over the ocean',
        provider: 'openai',
      });

      expect(result.status).toBe('queued');
      expect(result.jobId).toBe('job-uuid-123');

      expect(mockProviderService.getDecryptedKey).toHaveBeenCalledWith(
        USER_ID,
        'openai',
      );
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          projectId: PROJECT_ID,
          type: 'image',
          provider: 'openai',
          apiKey: 'sk-decrypted-key',
          prompt: 'a sunset over the ocean',
        }),
      );
      expect(mockJobRepo.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-uuid-123',
          userId: USER_ID,
          projectId: PROJECT_ID,
          type: 'image',
          provider: 'openai',
        }),
      );
    });

    it('resolves the first active provider when none is specified', async () => {
      mockProviderService.listProviders.mockResolvedValue([
        { provider: 'stability_ai', isActive: true, isConfigured: true, createdAt: new Date() },
      ]);

      const result = await submitGeneration(USER_ID, PROJECT_ID, {
        type: 'image',
        prompt: 'a cat',
      });

      expect(result.jobId).toBe('job-uuid-123');
      expect(mockProviderService.getDecryptedKey).toHaveBeenCalledWith(
        USER_ID,
        'stability_ai',
      );
    });

    it('throws ValidationError when specified provider does not support the type', async () => {
      await expect(
        submitGeneration(USER_ID, PROJECT_ID, {
          type: 'image',
          prompt: 'test',
          provider: 'elevenlabs',
        }),
      ).rejects.toThrow('does not support type');
    });

    it('throws NotFoundError when no active provider exists for the type', async () => {
      mockProviderService.listProviders.mockResolvedValue([]);

      await expect(
        submitGeneration(USER_ID, PROJECT_ID, {
          type: 'video',
          prompt: 'test',
        }),
      ).rejects.toThrow('No active provider');
    });

    it('skips inactive providers when resolving', async () => {
      mockProviderService.listProviders.mockResolvedValue([
        { provider: 'runway', isActive: false, isConfigured: true, createdAt: new Date() },
        { provider: 'kling', isActive: true, isConfigured: true, createdAt: new Date() },
      ]);

      await submitGeneration(USER_ID, PROJECT_ID, {
        type: 'video',
        prompt: 'test',
      });

      expect(mockProviderService.getDecryptedKey).toHaveBeenCalledWith(
        USER_ID,
        'kling',
      );
    });

    it('passes options to the job payload', async () => {
      const options = { size: '1024x1024', style: 'vivid' };

      await submitGeneration(USER_ID, PROJECT_ID, {
        type: 'image',
        prompt: 'test',
        provider: 'openai',
        options,
      });

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ options }),
      );
    });
  });

  describe('getJobStatus', () => {
    it('returns job status for the owner', async () => {
      mockJobRepo.getJobById.mockResolvedValue({
        jobId: 'job-1',
        userId: USER_ID,
        projectId: PROJECT_ID,
        type: 'image',
        provider: 'openai',
        prompt: 'test',
        options: null,
        status: 'processing',
        progress: 50,
        resultAssetId: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getJobStatus('job-1', USER_ID);

      expect(result).toEqual({
        jobId: 'job-1',
        status: 'processing',
        progress: 50,
        resultAssetId: null,
        errorMessage: null,
      });
    });

    it('throws NotFoundError when job does not exist', async () => {
      mockJobRepo.getJobById.mockResolvedValue(null);

      await expect(getJobStatus('nonexistent', USER_ID)).rejects.toThrow(
        'not found',
      );
    });

    it('throws NotFoundError when userId does not match', async () => {
      mockJobRepo.getJobById.mockResolvedValue({
        jobId: 'job-1',
        userId: 'other-user',
        status: 'queued',
        progress: 0,
        resultAssetId: null,
        errorMessage: null,
      });

      await expect(getJobStatus('job-1', USER_ID)).rejects.toThrow(
        'not found',
      );
    });

    it('returns completed job with result asset ID', async () => {
      mockJobRepo.getJobById.mockResolvedValue({
        jobId: 'job-1',
        userId: USER_ID,
        status: 'completed',
        progress: 100,
        resultAssetId: 'asset-abc',
        errorMessage: null,
      });

      const result = await getJobStatus('job-1', USER_ID);

      expect(result.status).toBe('completed');
      expect(result.resultAssetId).toBe('asset-abc');
    });

    it('returns failed job with error message', async () => {
      mockJobRepo.getJobById.mockResolvedValue({
        jobId: 'job-1',
        userId: USER_ID,
        status: 'failed',
        progress: 0,
        resultAssetId: null,
        errorMessage: 'API rate limit exceeded',
      });

      const result = await getJobStatus('job-1', USER_ID);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('API rate limit exceeded');
    });
  });
});
