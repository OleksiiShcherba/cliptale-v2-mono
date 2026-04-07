/**
 * Unit tests for render.job.ts — processRenderJob.
 *
 * All external dependencies (S3, DB pool, Remotion renderer, config) are mocked.
 * These tests validate the job handler's business logic:
 * - status transitions (queued → processing → complete/failed)
 * - S3 upload on success
 * - failure handling and DB error message storage
 * - tmp file cleanup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  docJson,
  makeJob,
  makeDeps,
  setupSuccessMocks,
  setupVersionNotFoundMocks,
  setupRenderFailureMocks,
} from './render.job.fixtures.js';

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockRenderComposition, mockMkdtemp, mockRm } = vi.hoisted(() => ({
  mockRenderComposition: vi.fn(),
  mockMkdtemp: vi.fn().mockResolvedValue('/tmp/render-test-123'),
  mockReadFile: vi.fn().mockResolvedValue(Buffer.from('video-data')),
  mockRm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    default: { ...actual, mkdtemp: mockMkdtemp, readFile: vi.fn().mockResolvedValue(Buffer.from('video-data')), rm: mockRm },
    mkdtemp: mockMkdtemp,
    readFile: vi.fn().mockResolvedValue(Buffer.from('video-data')),
    rm: mockRm,
  };
});

vi.mock('@/lib/remotion-renderer.js', () => ({ renderComposition: mockRenderComposition }));
vi.mock('@/config.js', () => ({ config: { s3: { bucket: 'test-bucket', region: 'us-east-1' } } }));
vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ ...params })),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params })),
  S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

// ── Import under test ────────────────────────────────────────────────────────

import { processRenderJob } from './render.job.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('render.job', () => {
  describe('processRenderJob', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockRenderComposition.mockResolvedValue(undefined);
    });

    it('transitions to processing on start then completes on success', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      const firstCallArgs = mockExecute.mock.calls[0]![1] as unknown[];
      expect(firstCallArgs).toContain('processing');
      expect(firstCallArgs).toContain(0);
      expect(firstCallArgs).toContain('job-test-001');
    });

    it('calls renderComposition with the correct compositionId, doc, preset, and assetUrls', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      expect(mockRenderComposition).toHaveBeenCalledOnce();
      const callArgs = mockRenderComposition.mock.calls[0]![0];
      expect(callArgs.compositionId).toBe('VideoComposition');
      expect(callArgs.doc).toEqual(docJson);
      expect(callArgs.preset.key).toBe('1080p');
      expect(callArgs.assetUrls).toEqual({ 'asset-aaa': 'https://s3.example.com/presigned' });
    });

    it('uploads the rendered file to S3 on success', async () => {
      const { s3, pool, mockExecute, mockSend } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('completes the job with an output_uri referencing S3 bucket', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      const completeCall = mockExecute.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).some((arg) => String(arg).includes('s3://test-bucket')),
      );
      expect(completeCall).toBeDefined();
    });

    it('sets status to failed and re-throws when renderComposition throws', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupRenderFailureMocks(mockExecute);
      mockRenderComposition.mockRejectedValueOnce(new Error('FFmpeg crash'));

      await expect(processRenderJob(makeJob(), { s3, pool })).rejects.toThrow('FFmpeg crash');

      const failCall = mockExecute.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes('FFmpeg crash'),
      );
      expect(failCall).toBeDefined();
    });

    it('throws when version is not found in DB', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupVersionNotFoundMocks(mockExecute);

      await expect(processRenderJob(makeJob(), { s3, pool })).rejects.toThrow(/not found/);
    });

    it('cleans up tmp directory on success', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      expect(mockRm).toHaveBeenCalledWith('/tmp/render-test-123', { recursive: true, force: true });
    });

    it('cleans up tmp directory even on render failure', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupRenderFailureMocks(mockExecute);
      mockRenderComposition.mockRejectedValueOnce(new Error('crash'));

      await expect(processRenderJob(makeJob(), { s3, pool })).rejects.toThrow();

      expect(mockRm).toHaveBeenCalledWith('/tmp/render-test-123', { recursive: true, force: true });
    });

    it('uses .webm extension for webm preset', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      const capturedOutputPaths: string[] = [];
      mockRenderComposition.mockImplementation(async (opts: { outputPath: string }) => {
        capturedOutputPaths.push(opts.outputPath);
      });

      await processRenderJob(makeJob({ key: 'webm', format: 'webm', codec: 'vp8' }), { s3, pool });

      expect(capturedOutputPaths[0]).toMatch(/\.webm$/);
    });

    it('uses .mp4 extension for mp4 preset', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      const capturedOutputPaths: string[] = [];
      mockRenderComposition.mockImplementation(async (opts: { outputPath: string }) => {
        capturedOutputPaths.push(opts.outputPath);
      });

      await processRenderJob(makeJob(), { s3, pool });

      expect(capturedOutputPaths[0]).toMatch(/\.mp4$/);
    });

    // Asset URL resolution tests are in render.job.assets.test.ts
  });
});
