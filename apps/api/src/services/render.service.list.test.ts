/**
 * Unit tests for render.service.ts — listProjectRenders.
 *
 * Validates that:
 * - An empty array is returned when no jobs exist.
 * - Non-complete jobs are returned without a downloadUrl.
 * - Complete jobs receive a presigned S3 downloadUrl.
 * - Only complete jobs trigger getSignedUrl when statuses are mixed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as renderRepository from '@/repositories/render.repository.js';

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

import { listProjectRenders } from './render.service.js';
import { mockJob } from './render.service.fixtures.js';

// ── listProjectRenders ────────────────────────────────────────────────────────

describe('render.service / listProjectRenders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when no jobs exist', async () => {
    vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([]);

    const result = await listProjectRenders('proj-abc');

    expect(result).toEqual([]);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('returns jobs without downloadUrl for non-complete jobs', async () => {
    vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([
      { ...mockJob, status: 'queued' },
      { ...mockJob, jobId: 'job-2', status: 'processing', progressPct: 50 },
      { ...mockJob, jobId: 'job-3', status: 'failed', errorMessage: 'crash' },
    ]);

    const result = await listProjectRenders('proj-abc');

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.downloadUrl === undefined)).toBe(true);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('returns downloadUrl for complete jobs with outputUri', async () => {
    const completeJob = {
      ...mockJob,
      jobId: 'job-complete',
      status: 'complete' as const,
      progressPct: 100,
      outputUri: 's3://test-bucket/renders/job-complete.mp4',
    };
    vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([completeJob]);

    const result = await listProjectRenders('proj-abc');

    expect(result[0]!.downloadUrl).toBe('https://example.com/signed-url');
    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
  });

  it('generates presigned URLs only for complete jobs when mixed statuses', async () => {
    const completeJob = {
      ...mockJob,
      jobId: 'job-done',
      status: 'complete' as const,
      progressPct: 100,
      outputUri: 's3://test-bucket/renders/job-done.mp4',
    };
    vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([
      { ...mockJob, status: 'queued' },
      completeJob,
      { ...mockJob, jobId: 'job-fail', status: 'failed', errorMessage: 'err' },
    ]);

    const result = await listProjectRenders('proj-abc');

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    const done = result.find((r) => r.jobId === 'job-done');
    expect(done?.downloadUrl).toBe('https://example.com/signed-url');
    const queued = result.find((r) => r.status === 'queued');
    expect(queued?.downloadUrl).toBeUndefined();
  });
});
