/**
 * Unit tests for asset URL resolution in render.job.ts — processRenderJob.
 *
 * Validates that:
 * - Presigned S3 URLs are generated for files referenced by clips (keyed by fileId).
 * - Empty assetUrls is returned when no media clips exist.
 * - Duplicate fileIds across clips are deduplicated.
 * - text-overlay and caption clips (no fileId) are excluded from DB lookup.
 * - image clips are resolved like video/audio clips.
 * - Mixed clip-type docs resolve only file-bearing clips.
 * - Orphaned fileIds (not in DB response) are silently omitted.
 * - The SQL query targets the `files` table with `file_id` and `storage_uri` columns.
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

  it('generates presigned URLs for files referenced by clips (keyed by fileId)', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docJson = {
      title: 'Test',
      tracks: [],
      clips: [{ id: 'c1', type: 'video', fileId: 'file-aaa', trackId: 't1', startFrame: 0, durationFrames: 90 }],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])                        // updateJobStatus
      .mockResolvedValueOnce([[{ doc_json: docJson }], []])   // fetchDocJson
      .mockResolvedValueOnce([[{ file_id: 'file-aaa', storage_uri: 's3://test-bucket/files/file-aaa.mp4' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    const getCmd = mockGetSignedUrl.mock.calls[0]![1];
    expect(getCmd).toHaveProperty('Bucket', 'test-bucket');
    expect(getCmd).toHaveProperty('Key', 'files/file-aaa.mp4');
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

  it('deduplicates fileIds when multiple clips reference the same file', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithDupes = {
      title: 'Dupes',
      tracks: [],
      clips: [
        { id: 'c1', type: 'video', fileId: 'file-aaa', trackId: 't1', startFrame: 0, durationFrames: 30 },
        { id: 'c2', type: 'video', fileId: 'file-aaa', trackId: 't1', startFrame: 30, durationFrames: 30 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docWithDupes }], []])
      .mockResolvedValueOnce([[{ file_id: 'file-aaa', storage_uri: 's3://test-bucket/files/a.mp4' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
  });

  it('excludes text-overlay clips — returns empty map with no DB call', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithTextOverlay = {
      title: 'TextOnly',
      tracks: [],
      clips: [
        { id: 'c1', type: 'text-overlay', text: 'Hello', trackId: 't1', startFrame: 0, durationFrames: 30 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docWithTextOverlay }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    const callArgs = mockRenderComposition.mock.calls[0]![0];
    expect(callArgs.assetUrls).toEqual({});
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    // 3 pool.execute calls: updateJobStatus + fetchDocJson + completeJob (no resolveAssetUrls query)
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('excludes caption clips — returns empty map with no DB call', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithCaption = {
      title: 'CaptionOnly',
      tracks: [],
      clips: [
        { id: 'c1', type: 'caption', text: 'Sub', trackId: 't1', startFrame: 0, durationFrames: 60 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docWithCaption }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    const callArgs = mockRenderComposition.mock.calls[0]![0];
    expect(callArgs.assetUrls).toEqual({});
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    // 3 pool.execute calls: updateJobStatus + fetchDocJson + completeJob (no resolveAssetUrls query)
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('resolves image clips by fileId like video/audio clips', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithImage = {
      title: 'WithImage',
      tracks: [],
      clips: [
        { id: 'c1', type: 'image', fileId: 'file-img-001', trackId: 't1', startFrame: 0, durationFrames: 30 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docWithImage }], []])
      .mockResolvedValueOnce([[{ file_id: 'file-img-001', storage_uri: 's3://test-bucket/files/img.jpg' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    const getCmd = mockGetSignedUrl.mock.calls[0]![1];
    expect(getCmd).toHaveProperty('Key', 'files/img.jpg');

    const callArgs = mockRenderComposition.mock.calls[0]![0];
    expect(callArgs.assetUrls).toHaveProperty('file-img-001');
  });

  it('resolves only file-bearing clips in a mixed doc (video+audio+text-overlay+caption)', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const mixedDoc = {
      title: 'Mixed',
      tracks: [],
      clips: [
        { id: 'c1', type: 'video',        fileId: 'file-vid', trackId: 't1', startFrame: 0,  durationFrames: 90 },
        { id: 'c2', type: 'audio',        fileId: 'file-aud', trackId: 't2', startFrame: 0,  durationFrames: 90 },
        { id: 'c3', type: 'text-overlay', text: 'Title',      trackId: 't3', startFrame: 0,  durationFrames: 30 },
        { id: 'c4', type: 'caption',      text: 'Sub',        trackId: 't4', startFrame: 10, durationFrames: 20 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: mixedDoc }], []])
      .mockResolvedValueOnce([
        [
          { file_id: 'file-vid', storage_uri: 's3://test-bucket/files/vid.mp4' },
          { file_id: 'file-aud', storage_uri: 's3://test-bucket/files/aud.mp3' },
        ],
        [],
      ])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(2);

    const callArgs = mockRenderComposition.mock.calls[0]![0];
    expect(callArgs.assetUrls).toHaveProperty('file-vid');
    expect(callArgs.assetUrls).toHaveProperty('file-aud');
    expect(Object.keys(callArgs.assetUrls)).not.toContain('text-overlay');
    expect(Object.keys(callArgs.assetUrls)).not.toContain('caption');
    expect(Object.keys(callArgs.assetUrls)).toHaveLength(2);
  });

  it('silently omits fileIds absent from the DB response (orphan safety)', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docWithOrphan = {
      title: 'Orphan',
      tracks: [],
      clips: [
        { id: 'c1', type: 'video', fileId: 'file-exists',  trackId: 't1', startFrame: 0, durationFrames: 30 },
        { id: 'c2', type: 'video', fileId: 'file-missing', trackId: 't1', startFrame: 30, durationFrames: 30 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docWithOrphan }], []])
      // DB only returns one of the two fileIds — file-missing is absent
      .mockResolvedValueOnce([[{ file_id: 'file-exists', storage_uri: 's3://test-bucket/files/exists.mp4' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    // Only one presigned URL generated — the orphan is skipped, no exception
    expect(mockGetSignedUrl).toHaveBeenCalledOnce();

    const callArgs = mockRenderComposition.mock.calls[0]![0];
    expect(callArgs.assetUrls).toHaveProperty('file-exists');
    expect(callArgs.assetUrls).not.toHaveProperty('file-missing');
  });

  it('SQL query guard — targets files table with file_id/storage_uri columns and WHERE file_id IN (...)', async () => {
    const { s3, pool, mockExecute } = makeDeps();
    const docJson = {
      title: 'SqlGuard',
      tracks: [],
      clips: [
        { id: 'c1', type: 'video', fileId: 'file-sql-test', trackId: 't1', startFrame: 0, durationFrames: 30 },
      ],
    };

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ doc_json: docJson }], []])
      .mockResolvedValueOnce([[{ file_id: 'file-sql-test', storage_uri: 's3://test-bucket/files/sql.mp4' }], []])
      .mockResolvedValue([[], []]);

    await processRenderJob(makeJob(), { s3, pool });

    // The third execute call is resolveAssetUrls — index 2
    const sqlCall = mockExecute.mock.calls[2];
    expect(sqlCall).toBeDefined();
    const [sqlQuery, sqlParams] = sqlCall as [string, unknown[]];

    expect(sqlQuery).toMatch(/FROM\s+files\b/i);
    expect(sqlQuery).toMatch(/SELECT\s+file_id\s*,\s*storage_uri/i);
    expect(sqlQuery).toMatch(/WHERE\s+file_id\s+IN\s*\(/i);
    expect(sqlParams).toContain('file-sql-test');
  });
});
