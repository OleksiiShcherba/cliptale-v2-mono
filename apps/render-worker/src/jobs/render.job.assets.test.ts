/**
 * Unit tests for asset URL resolution in render.job.ts — processRenderJob.
 *
 * Validates that:
 * - Presigned S3 URLs are generated for assets referenced by clips.
 * - Empty assetUrls is returned when no media clips exist.
 * - Duplicate assetIds across clips are deduplicated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeJob, makeDeps } from './render.job.fixtures.js';

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockRenderComposition } = vi.hoisted(() => ({
  mockRenderComposition: vi.fn(),
}));

const mockGetSignedUrl = vi.fn().mockResolvedValue('https://s3.example.com/presigned');

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdtemp: vi.fn().mockResolvedValue('/tmp/render-test-123'),
      readFile: vi.fn().mockResolvedValue(Buffer.from('video-data')),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    mkdtemp: vi.fn().mockResolvedValue('/tmp/render-test-123'),
    readFile: vi.fn().mockResolvedValue(Buffer.from('video-data')),
    rm: vi.fn().mockResolvedValue(undefined),
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
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

// ── Import under test ────────────────────────────────────────────────────────

import { processRenderJob } from './render.job.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('render.job / asset URL resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderComposition.mockResolvedValue(undefined);
  });

  it('generates presigned URLs for assets referenced by clips', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docJson = {
      title: 'Test',
      tracks: [],
      clips: [{ id: 'c1', type: 'video', assetId: 'asset-aaa', trackId: 't1', startFrame: 0, durationFrames: 90 }],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])                        // updateJobStatus
      .mockResolvedValueOnce([[{ doc_json: docJson }], []])   // fetchDocJson
      .mockResolvedValueOnce([[{ asset_id: 'asset-aaa', storage_uri: 's3://test-bucket/assets/asset-aaa.mp4' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    const getCmd = mockGetSignedUrl.mock.calls[0]![1];
    expect(getCmd).toHaveProperty('Bucket', 'test-bucket');
    expect(getCmd).toHaveProperty('Key', 'assets/asset-aaa.mp4');
  });

  it('passes empty assetUrls when doc has no media clips', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithNoAssets = { title: 'Empty', tracks: [], clips: [] };

    mockExecute
      .mockResolvedValueOnce([[], []])                                // updateJobStatus
      .mockResolvedValueOnce([[{ doc_json: docWithNoAssets }], []])   // fetchDocJson
      .mockResolvedValue([[], []]);                                   // completeJob

    await processRenderJob(makeJob(), { s3, pool });

    const callArgs = mockRenderComposition.mock.calls[0]![0];
    expect(callArgs.assetUrls).toEqual({});
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('deduplicates assetIds when multiple clips reference the same asset', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithDupes = {
      title: 'Dupes',
      tracks: [],
      clips: [
        { id: 'c1', type: 'video', assetId: 'asset-aaa', trackId: 't1', startFrame: 0, durationFrames: 30 },
        { id: 'c2', type: 'video', assetId: 'asset-aaa', trackId: 't1', startFrame: 30, durationFrames: 30 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docWithDupes }], []])
      .mockResolvedValueOnce([[{ asset_id: 'asset-aaa', storage_uri: 's3://test-bucket/a.mp4' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
  });
});
