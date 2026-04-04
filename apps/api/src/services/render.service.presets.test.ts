/**
 * Unit tests for render.service.ts — listProjectRenders and ALLOWED_PRESETS.
 * Split from render.service.test.ts to stay under the 300-line limit per architecture rules.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as renderRepository from '@/repositories/render.repository.js';
import * as versionRepository from '@/repositories/version.repository.js';
import * as enqueueRenderModule from '@/queues/jobs/enqueue-render.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
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

import { createRender, listProjectRenders, ALLOWED_PRESETS } from './render.service.js';
import { mockVersion, mockJob } from './render.service.fixtures.js';

// ── listProjectRenders ───────────────────────────────────────────────────────

describe('render.service', () => {
  describe('listProjectRenders', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns an array of render jobs from the repository', async () => {
      vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([
        mockJob,
        { ...mockJob, jobId: 'job-2', status: 'complete', progressPct: 100 },
      ]);

      const result = await listProjectRenders('proj-abc');

      expect(result).toHaveLength(2);
      expect(result[0]!.jobId).toBe('job-uuid-123');
    });

    it('returns an empty array when the project has no render jobs', async () => {
      vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([]);

      const result = await listProjectRenders('proj-empty');

      expect(result).toEqual([]);
    });

    it('delegates to renderRepository.listRenderJobsByProject with the project id', async () => {
      vi.mocked(renderRepository.listRenderJobsByProject).mockResolvedValueOnce([]);

      await listProjectRenders('proj-xyz');

      expect(renderRepository.listRenderJobsByProject).toHaveBeenCalledWith('proj-xyz');
    });
  });

  // ── ALLOWED_PRESETS ──────────────────────────────────────────────────────────

  describe('ALLOWED_PRESETS', () => {
    it('should define the expected preset keys', () => {
      const keys = Object.keys(ALLOWED_PRESETS);
      expect(keys).toContain('1080p');
      expect(keys).toContain('4k');
      expect(keys).toContain('720p');
      expect(keys).toContain('vertical');
      expect(keys).toContain('square');
      expect(keys).toContain('webm');
    });

    it('should have correct codec for webm preset', () => {
      expect(ALLOWED_PRESETS.webm.codec).toBe('vp8');
      expect(ALLOWED_PRESETS.webm.format).toBe('webm');
    });

    it('should have h264 codec for all mp4 presets', () => {
      for (const [key, preset] of Object.entries(ALLOWED_PRESETS)) {
        if (preset.format === 'mp4') {
          expect(preset.codec).toBe('h264');
          expect(preset.key).toBe(key);
        }
      }
    });
  });

  // ── createRender — accepts all allowed presets ────────────────────────────

  describe('createRender — all allowed presets', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(versionRepository.getVersionById).mockResolvedValue(mockVersion);
      vi.mocked(renderRepository.countActiveJobsByUser).mockResolvedValue(0);
      vi.mocked(enqueueRenderModule.enqueueRenderJob).mockResolvedValue(undefined);
    });

    it('accepts all allowed preset keys without throwing', async () => {
      const presets = Object.keys(ALLOWED_PRESETS);
      for (const key of presets) {
        vi.mocked(renderRepository.insertRenderJob).mockResolvedValueOnce({
          ...mockJob,
          preset: ALLOWED_PRESETS[key as keyof typeof ALLOWED_PRESETS]!,
        });
        await expect(
          createRender({
            projectId: 'proj-abc',
            versionId: 42,
            requestedBy: 'user-001',
            presetKey: key,
          }),
        ).resolves.not.toThrow();
      }
    });
  });
});
