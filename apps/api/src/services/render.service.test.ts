/**
 * Unit tests for render.service.ts — createRender and getRenderStatus.
 *
 * All repository, S3, and enqueue calls are mocked. These tests validate the
 * business logic: preset validation, version ownership, per-user concurrency
 * limit, job creation, and presigned URL generation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors.js';
import * as renderRepository from '@/repositories/render.repository.js';
import * as versionRepository from '@/repositories/version.repository.js';
import * as enqueueRenderModule from '@/queues/jobs/enqueue-render.js';

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockGetSignedUrl } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ ...params })),
  S3Client: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: {},
}));

vi.mock('@/config.js', () => ({
  config: {
    s3: { bucket: 'test-bucket', region: 'us-east-1' },
  },
}));

vi.mock('@/db/connection.js', () => ({
  pool: {
    execute: vi.fn().mockResolvedValue([[], []]),
    getConnection: vi.fn(),
  },
}));

vi.mock('@/repositories/render.repository.js', () => ({
  insertRenderJob: vi.fn(),
  getRenderJobById: vi.fn(),
  listRenderJobsByProject: vi.fn(),
  updateRenderProgress: vi.fn(),
  completeRenderJob: vi.fn(),
  failRenderJob: vi.fn(),
  countActiveJobsByUser: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock('@/repositories/version.repository.js', () => ({
  getVersionById: vi.fn(),
  getLatestVersionId: vi.fn(),
  insertVersionTransaction: vi.fn(),
  listVersions: vi.fn(),
  restoreVersionTransaction: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-render.js', () => ({
  enqueueRenderJob: vi.fn().mockResolvedValue(undefined),
}));

import { createRender, getRenderStatus, ALLOWED_PRESETS } from './render.service.js';
import { mockVersion, mockJob } from './render.service.fixtures.js';

// ── createRender ──────────────────────────────────────────────────────────────

describe('render.service', () => {
  describe('createRender', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(versionRepository.getVersionById).mockResolvedValue(mockVersion);
      vi.mocked(renderRepository.countActiveJobsByUser).mockResolvedValue(0);
      vi.mocked(renderRepository.insertRenderJob).mockResolvedValue(mockJob);
      vi.mocked(enqueueRenderModule.enqueueRenderJob).mockResolvedValue(undefined);
    });

    it('returns jobId and status queued on happy path', async () => {
      const result = await createRender({
        projectId: 'proj-abc',
        versionId: 42,
        requestedBy: 'user-001',
        presetKey: '1080p',
      });

      expect(result.status).toBe('queued');
      expect(typeof result.jobId).toBe('string');
      expect(result.jobId).toHaveLength(36); // UUID v4
    });

    it('throws ValidationError for an unknown preset key', async () => {
      await expect(
        createRender({
          projectId: 'proj-abc',
          versionId: 42,
          requestedBy: 'user-001',
          presetKey: 'ultra-hd-pro',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when version does not belong to the project', async () => {
      vi.mocked(versionRepository.getVersionById).mockResolvedValueOnce(null);

      await expect(
        createRender({
          projectId: 'proj-abc',
          versionId: 99,
          requestedBy: 'user-001',
          presetKey: '1080p',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ConflictError when user already has MAX_CONCURRENT_JOBS_PER_USER active jobs', async () => {
      vi.mocked(renderRepository.countActiveJobsByUser).mockResolvedValueOnce(2);

      await expect(
        createRender({
          projectId: 'proj-abc',
          versionId: 42,
          requestedBy: 'user-001',
          presetKey: '1080p',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('skips the concurrency check for anonymous renders (requestedBy=null)', async () => {
      await createRender({
        projectId: 'proj-abc',
        versionId: 42,
        requestedBy: null,
        presetKey: '720p',
      });

      expect(renderRepository.countActiveJobsByUser).not.toHaveBeenCalled();
    });

    it('calls insertRenderJob with the resolved preset configuration', async () => {
      await createRender({
        projectId: 'proj-abc',
        versionId: 42,
        requestedBy: 'user-001',
        presetKey: '720p',
      });

      expect(renderRepository.insertRenderJob).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-abc',
          versionId: 42,
          requestedBy: 'user-001',
          preset: ALLOWED_PRESETS['720p'],
        }),
      );
    });

    it('enqueues a BullMQ job after inserting the DB row', async () => {
      await createRender({
        projectId: 'proj-abc',
        versionId: 42,
        requestedBy: 'user-001',
        presetKey: '1080p',
      });

      expect(enqueueRenderModule.enqueueRenderJob).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(enqueueRenderModule.enqueueRenderJob).mock.calls[0]![0];
      expect(callArgs.projectId).toBe('proj-abc');
      expect(callArgs.versionId).toBe(42);
      expect(callArgs.preset).toEqual(ALLOWED_PRESETS['1080p']);
    });
  });

  // ── getRenderStatus ──────────────────────────────────────────────────────────

  describe('getRenderStatus', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns the job record when status is queued (no downloadUrl)', async () => {
      vi.mocked(renderRepository.getRenderJobById).mockResolvedValueOnce(mockJob);

      const result = await getRenderStatus('job-uuid-123');

      expect(result.status).toBe('queued');
      expect(result.downloadUrl).toBeUndefined();
    });

    it('returns the job with downloadUrl when status is complete and outputUri is set', async () => {
      const completeJob = {
        ...mockJob,
        status: 'complete' as const,
        progressPct: 100,
        outputUri: 's3://test-bucket/renders/job-uuid-123.mp4',
      };
      vi.mocked(renderRepository.getRenderJobById).mockResolvedValueOnce(completeJob);

      const result = await getRenderStatus('job-uuid-123');

      expect(result.status).toBe('complete');
      expect(result.downloadUrl).toBe('https://example.com/signed-url');
      expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    });

    it('throws NotFoundError when job does not exist', async () => {
      vi.mocked(renderRepository.getRenderJobById).mockResolvedValueOnce(null);

      await expect(getRenderStatus('non-existent-job')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('does not call getSignedUrl when job is processing (no outputUri)', async () => {
      vi.mocked(renderRepository.getRenderJobById).mockResolvedValueOnce({
        ...mockJob,
        status: 'processing',
        progressPct: 50,
      });

      const result = await getRenderStatus('job-uuid-123');

      expect(result.status).toBe('processing');
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('does not call getSignedUrl when job is failed', async () => {
      vi.mocked(renderRepository.getRenderJobById).mockResolvedValueOnce({
        ...mockJob,
        status: 'failed',
        errorMessage: 'FFmpeg crash',
      });

      const result = await getRenderStatus('job-uuid-123');

      expect(result.status).toBe('failed');
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
  });
});
