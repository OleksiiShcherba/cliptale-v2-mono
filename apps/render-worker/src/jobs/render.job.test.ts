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
import type { Job } from 'bullmq';

import type { RenderVideoJobPayload } from '@ai-video-editor/project-schema';

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockRenderComposition, mockMkdtemp, mockReadFile, mockRm } = vi.hoisted(() => ({
  mockRenderComposition: vi.fn(),
  mockMkdtemp: vi.fn().mockResolvedValue('/tmp/render-test-123'),
  mockReadFile: vi.fn().mockResolvedValue(Buffer.from('video-data')),
  mockRm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdtemp: mockMkdtemp,
      readFile: mockReadFile,
      rm: mockRm,
    },
    mkdtemp: mockMkdtemp,
    readFile: mockReadFile,
    rm: mockRm,
  };
});

vi.mock('@/lib/remotion-renderer.js', () => ({
  renderComposition: mockRenderComposition,
}));

vi.mock('@/config.js', () => ({
  config: {
    s3: { bucket: 'test-bucket', region: 'us-east-1' },
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params })),
  S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

import { processRenderJob } from './render.job.js';

const docJson = { title: 'Test Project', tracks: [] };

function makeJob(presetOverride?: Partial<RenderVideoJobPayload['preset']>): Job<RenderVideoJobPayload> {
  return {
    data: {
      jobId: 'job-test-001',
      projectId: 'proj-test',
      versionId: 42,
      requestedBy: 'user-001',
      preset: {
        key: '1080p',
        width: 1920,
        height: 1080,
        fps: 30,
        format: 'mp4',
        codec: 'h264',
        ...presetOverride,
      },
    },
  } as unknown as Job<RenderVideoJobPayload>;
}

function makeDeps() {
  const mockExecute = vi.fn();
  const mockSend = vi.fn().mockResolvedValue({});

  return {
    s3: { send: mockSend } as unknown as import('@aws-sdk/client-s3').S3Client,
    pool: { execute: mockExecute } as unknown as import('mysql2/promise').Pool,
    mockExecute,
    mockSend,
  };
}

/**
 * Sets up the mock pool.execute to return appropriate responses for the
 * call sequence: updateJobStatus(processing) → fetchDocJson → ... → completeJob/failJob.
 */
function setupSuccessMocks(mockExecute: ReturnType<typeof vi.fn>) {
  mockExecute
    .mockResolvedValueOnce([[], []])                        // updateJobStatus('processing', 0)
    .mockResolvedValueOnce([[{ doc_json: docJson }], []])   // fetchDocJson
    .mockResolvedValue([[], []]);                           // completeJob + any further calls
}

function setupVersionNotFoundMocks(mockExecute: ReturnType<typeof vi.fn>) {
  mockExecute
    .mockResolvedValueOnce([[], []])   // updateJobStatus('processing', 0)
    .mockResolvedValueOnce([[], []])   // fetchDocJson — empty rows
    .mockResolvedValue([[], []]);      // failJob
}

function setupRenderFailureMocks(mockExecute: ReturnType<typeof vi.fn>) {
  mockExecute
    .mockResolvedValueOnce([[], []])                        // updateJobStatus('processing', 0)
    .mockResolvedValueOnce([[{ doc_json: docJson }], []])   // fetchDocJson
    .mockResolvedValue([[], []]);                           // failJob
}

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

      // First call: updateJobStatus('processing', 0)
      const firstCallArgs = mockExecute.mock.calls[0]![1] as unknown[];
      expect(firstCallArgs).toContain('processing');
      expect(firstCallArgs).toContain(0);
      expect(firstCallArgs).toContain('job-test-001');
    });

    it('calls renderComposition with the correct compositionId, doc, preset', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      expect(mockRenderComposition).toHaveBeenCalledOnce();
      const callArgs = mockRenderComposition.mock.calls[0]![0];
      expect(callArgs.compositionId).toBe('VideoComposition');
      expect(callArgs.doc).toEqual(docJson);
      expect(callArgs.preset.key).toBe('1080p');
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

      // Find the completeJob call — it should contain the output_uri
      const completeCall = mockExecute.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).some((arg) => String(arg).includes('s3://test-bucket')),
      );
      expect(completeCall).toBeDefined();
    });

    it('sets status to failed and re-throws when renderComposition throws', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupRenderFailureMocks(mockExecute);

      mockRenderComposition.mockRejectedValueOnce(new Error('FFmpeg crash'));

      await expect(
        processRenderJob(makeJob(), { s3, pool }),
      ).rejects.toThrow('FFmpeg crash');

      // failJob should have been called with the error message
      const failCall = mockExecute.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes('FFmpeg crash'),
      );
      expect(failCall).toBeDefined();
    });

    it('throws when version is not found in DB', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupVersionNotFoundMocks(mockExecute);

      await expect(
        processRenderJob(makeJob(), { s3, pool }),
      ).rejects.toThrow(/not found/);
    });

    it('cleans up tmp directory on success', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      await processRenderJob(makeJob(), { s3, pool });

      expect(mockRm).toHaveBeenCalledWith(
        '/tmp/render-test-123',
        { recursive: true, force: true },
      );
    });

    it('cleans up tmp directory even on render failure', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupRenderFailureMocks(mockExecute);

      mockRenderComposition.mockRejectedValueOnce(new Error('crash'));

      await expect(
        processRenderJob(makeJob(), { s3, pool }),
      ).rejects.toThrow();

      expect(mockRm).toHaveBeenCalledWith(
        '/tmp/render-test-123',
        { recursive: true, force: true },
      );
    });

    it('uses .webm extension for webm preset', async () => {
      const { s3, pool, mockExecute } = makeDeps();
      setupSuccessMocks(mockExecute);

      const capturedOutputPaths: string[] = [];
      mockRenderComposition.mockImplementation(async (opts: { outputPath: string }) => {
        capturedOutputPaths.push(opts.outputPath);
      });

      await processRenderJob(
        makeJob({ key: 'webm', format: 'webm', codec: 'vp8' }),
        { s3, pool },
      );

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
  });
});
