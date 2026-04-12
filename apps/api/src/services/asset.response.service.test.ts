/**
 * Unit tests for the response-shaping and streaming functions added to asset.service.ts
 * during the "Fix S3 URL exposure" refactor (2026-04-05).
 *
 * Covers:
 *   - getAssetResponse   — getAsset + toAssetApiResponse
 *   - getProjectAssetsResponse — getProjectAssets + toAssetApiResponse per item
 *   - finalizeAssetResponse   — finalizeAsset + toAssetApiResponse
 *   - streamAsset             — S3 GetObject proxy, Range forwarding, null-body branch
 *
 * Internal helpers (presignDownloadUrl, storageUriToHttps, toAssetApiResponse)
 * are not exported; they are exercised indirectly through the exported functions.
 */
import { Readable } from 'node:stream';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

import { NotFoundError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';
import * as enqueueIngest from '@/queues/jobs/enqueue-ingest.js';

import {
  getAssetResponse,
  getProjectAssetsResponse,
  finalizeAssetResponse,
  streamAsset,
  streamThumbnail,
} from './asset.response.service.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/asset.repository.js', () => ({
  getAssetById: vi.fn(),
  getAssetsByProjectId: vi.fn(),
  insertPendingAsset: vi.fn().mockResolvedValue(undefined),
  updateAssetStatus: vi.fn().mockResolvedValue(undefined),
  isAssetReferencedByClip: vi.fn().mockResolvedValue(false),
  deleteAssetById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/queues/jobs/enqueue-ingest.js', () => ({
  enqueueIngestJob: vi.fn().mockResolvedValue(undefined),
}));

// Presigned GET URL mock — avoids real AWS credentials.
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-download-url'),
}));

// config mock — controls storageUriToHttps branch for thumbnail URLs.
vi.mock('@/config.js', () => ({
  config: {
    s3: { endpoint: undefined, region: 'us-east-1', bucket: 'test-bucket' },
  },
}));

const mockS3Send = vi.fn();
const mockS3 = { send: mockS3Send } as unknown as S3Client;

// ── Shared fixture ─────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<ReturnType<typeof baseAsset>> = {}) {
  return { ...baseAsset(), ...overrides };
}

function baseAsset() {
  return {
    assetId: 'asset-resp-001',
    projectId: 'proj-123',
    userId: 'user-456',
    filename: 'video.mp4',
    displayName: null as string | null,
    contentType: 'video/mp4',
    fileSizeBytes: 1_000_000,
    storageUri: 's3://test-bucket/projects/proj-123/assets/asset-resp-001/video.mp4',
    status: 'ready' as const,
    errorMessage: null,
    durationFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
    thumbnailUri: 's3://test-bucket/projects/proj-123/assets/asset-resp-001/thumb.jpg',
    waveformJson: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

// ── getAssetResponse ───────────────────────────────────────────────────────────

describe('asset.service — getAssetResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the asset mapped to AssetApiResponse shape with presigned storageUri', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(makeAsset());

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.id).toBe('asset-resp-001');
    expect(result.projectId).toBe('proj-123');
    expect(result.filename).toBe('video.mp4');
    expect(result.contentType).toBe('video/mp4');
    expect(result.status).toBe('ready');
    // downloadUrl must be the presigned HTTPS URL, never a raw s3:// URI.
    expect(result.downloadUrl).toBe('https://s3.example.com/presigned-download-url');
    expect(result.downloadUrl).not.toContain('s3://');
  });

  it('maps id from assetId (the API key is "id", not "assetId")', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(makeAsset());

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.id).toBe('asset-resp-001');
    expect((result as Record<string, unknown>)['assetId']).toBeUndefined();
  });

  it('computes durationSeconds from durationFrames / fps', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ durationFrames: 300, fps: 30 }),
    );

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.durationSeconds).toBe(10);
  });

  it('returns null durationSeconds when durationFrames is null', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ durationFrames: null, fps: null }),
    );

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.durationSeconds).toBeNull();
  });

  it('returns the API thumbnail proxy URL when a thumbnail exists', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({
        assetId: 'asset-resp-001',
        thumbnailUri: 's3://test-bucket/projects/proj-123/assets/asset-resp-001/thumb.jpg',
      }),
    );

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    // thumbnailUri must be the API proxy endpoint, never a raw s3:// URI.
    expect(result.thumbnailUri).toBe('http://localhost:3001/assets/asset-resp-001/thumbnail');
    expect(result.thumbnailUri).not.toContain('s3://');
  });

  it('returns null thumbnailUri when the asset has no thumbnail', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ thumbnailUri: null }),
    );

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.thumbnailUri).toBeNull();
  });

  it('serializes Date objects to ISO strings in createdAt / updatedAt', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(makeAsset());

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('throws NotFoundError when the asset does not exist', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

    await expect(getAssetResponse('nonexistent', mockS3, 'http://localhost:3001')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns null displayName when the asset has no display name set', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(makeAsset({ displayName: null }));

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.displayName).toBeNull();
  });

  it('returns the display name string when the asset has a display name', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ displayName: 'My Custom Name' }),
    );

    const result = await getAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.displayName).toBe('My Custom Name');
  });
});

// ── getProjectAssetsResponse ───────────────────────────────────────────────────

describe('asset.service — getProjectAssetsResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an array of AssetApiResponse objects for a project with assets', async () => {
    const asset1 = makeAsset({ assetId: 'a1', filename: 'one.mp4' });
    const asset2 = makeAsset({ assetId: 'a2', filename: 'two.mp4' });
    vi.mocked(assetRepository.getAssetsByProjectId).mockResolvedValueOnce([asset1, asset2]);

    const result = await getProjectAssetsResponse('proj-123', mockS3, 'http://localhost:3001');

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('a1');
    expect(result[1]!.id).toBe('a2');
  });

  it('returns an empty array when the project has no assets', async () => {
    vi.mocked(assetRepository.getAssetsByProjectId).mockResolvedValueOnce([]);

    const result = await getProjectAssetsResponse('proj-empty', mockS3, 'http://localhost:3001');

    expect(result).toEqual([]);
  });

  it('applies presigned URL transformation to each asset storageUri', async () => {
    vi.mocked(assetRepository.getAssetsByProjectId).mockResolvedValueOnce([
      makeAsset({ assetId: 'a1' }),
      makeAsset({ assetId: 'a2' }),
    ]);

    const result = await getProjectAssetsResponse('proj-123', mockS3, 'http://localhost:3001');

    for (const asset of result) {
      expect(asset.downloadUrl).toBe('https://s3.example.com/presigned-download-url');
      expect(asset.downloadUrl).not.toContain('s3://');
    }
  });
});

// ── finalizeAssetResponse ─────────────────────────────────────────────────────

describe('asset.service — finalizeAssetResponse', () => {
  const pendingAsset = makeAsset({ status: 'pending' });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: HEAD succeeds (object exists in storage).
    mockS3Send.mockResolvedValue({});
  });

  it('returns AssetApiResponse with processing status after finalization', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(pendingAsset);

    const result = await finalizeAssetResponse('asset-resp-001', mockS3, 'http://localhost:3001');

    expect(result.status).toBe('processing');
    expect(result.id).toBe('asset-resp-001');
    // storageUri must be presigned — never raw s3://.
    expect(result.downloadUrl).toBe('https://s3.example.com/presigned-download-url');
    expect(result.downloadUrl).not.toContain('s3://');
  });

  it('throws NotFoundError when the asset does not exist', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

    await expect(finalizeAssetResponse('nonexistent', mockS3, 'http://localhost:3001')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('enqueues the ingest job as a side-effect of finalization', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(pendingAsset);

    await finalizeAssetResponse('asset-resp-001', mockS3);

    expect(vi.mocked(enqueueIngest.enqueueIngestJob)).toHaveBeenCalledOnce();
  });
});

// ── streamAsset ───────────────────────────────────────────────────────────────

describe('asset.service — streamAsset', () => {
  const readyAsset = makeAsset({ status: 'ready' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns AssetStreamResult with body, contentType, and contentLength on full-file request', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    const fakeBody = Readable.from(['fake-video-data']);
    mockS3Send.mockResolvedValueOnce({
      Body: fakeBody,
      ContentType: 'video/mp4',
      ContentLength: 15,
      ContentRange: undefined,
    });

    const result = await streamAsset('asset-resp-001', undefined, mockS3);

    expect(result).not.toBeNull();
    expect(result!.body).toBe(fakeBody);
    expect(result!.contentType).toBe('video/mp4');
    expect(result!.contentLength).toBe(15);
  });

  it('sets isPartialContent to false when no Range header is provided', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from(['data']),
      ContentType: 'video/mp4',
      ContentLength: 4,
    });

    const result = await streamAsset('asset-resp-001', undefined, mockS3);

    expect(result!.isPartialContent).toBe(false);
  });

  it('sets isPartialContent to true when a Range header is provided', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from(['partial']),
      ContentType: 'video/mp4',
      ContentLength: 7,
      ContentRange: 'bytes 0-6/1000',
    });

    const result = await streamAsset('asset-resp-001', 'bytes=0-6', mockS3);

    expect(result!.isPartialContent).toBe(true);
    expect(result!.contentRange).toBe('bytes 0-6/1000');
  });

  it('forwards the Range header to S3 GetObjectCommand', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from(['partial']),
      ContentType: 'video/mp4',
      ContentLength: 7,
      ContentRange: 'bytes 100-106/2048',
    });

    await streamAsset('asset-resp-001', 'bytes=100-106', mockS3);

    expect(mockS3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ Range: 'bytes=100-106' }),
      }),
    );
  });

  it('does NOT set Range in S3 command when no range header is given', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from(['all']),
      ContentType: 'video/mp4',
      ContentLength: 3,
    });

    await streamAsset('asset-resp-001', undefined, mockS3);

    expect(mockS3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.not.objectContaining({ Range: expect.anything() }),
      }),
    );
  });

  it('returns null when S3 responds with no body', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    mockS3Send.mockResolvedValueOnce({ Body: null });

    const result = await streamAsset('asset-resp-001', undefined, mockS3);

    expect(result).toBeNull();
  });

  it('returns null when S3 responds with undefined body', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    mockS3Send.mockResolvedValueOnce({ Body: undefined });

    const result = await streamAsset('asset-resp-001', undefined, mockS3);

    expect(result).toBeNull();
  });

  it('throws NotFoundError when the asset does not exist in the DB', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

    await expect(streamAsset('nonexistent', undefined, mockS3)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // S3 must never be called — the DB check fires first.
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('parses the storage URI correctly and calls S3 with the right bucket and key', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({
        storageUri: 's3://my-bucket/projects/proj-abc/assets/asset-xyz/clip.mp4',
      }),
    );
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from(['data']),
      ContentType: 'video/mp4',
      ContentLength: 4,
    });

    await streamAsset('asset-resp-001', undefined, mockS3);

    expect(mockS3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'my-bucket',
          Key: 'projects/proj-abc/assets/asset-xyz/clip.mp4',
        }),
      }),
    );
  });

  it('propagates unexpected S3 errors without wrapping', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(readyAsset);
    const networkErr = new Error('ECONNREFUSED');
    mockS3Send.mockRejectedValueOnce(networkErr);

    await expect(streamAsset('asset-resp-001', undefined, mockS3)).rejects.toBe(networkErr);
  });
});

// ── streamThumbnail ───────────────────────────────────────────────────────────

describe('asset.service — streamThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns body, contentType, and contentLength when thumbnail exists', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ thumbnailUri: 's3://test-bucket/projects/proj-123/assets/asset-resp-001/thumb.jpg' }),
    );
    const fakeBody = Readable.from(['fake-thumbnail-data']);
    mockS3Send.mockResolvedValueOnce({
      Body: fakeBody,
      ContentType: 'image/jpeg',
      ContentLength: 4096,
    });

    const result = await streamThumbnail('asset-resp-001', mockS3);

    expect(result).not.toBeNull();
    expect(result!.body).toBe(fakeBody);
    expect(result!.contentType).toBe('image/jpeg');
    expect(result!.contentLength).toBe(4096);
  });

  it('returns null when the asset has no thumbnailUri', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ thumbnailUri: null }),
    );

    const result = await streamThumbnail('asset-resp-001', mockS3);

    expect(result).toBeNull();
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns null when S3 responds with no body', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(
      makeAsset({ thumbnailUri: 's3://test-bucket/thumb.jpg' }),
    );
    mockS3Send.mockResolvedValueOnce({ Body: undefined });

    const result = await streamThumbnail('asset-resp-001', mockS3);

    expect(result).toBeNull();
  });

  it('throws NotFoundError when the asset does not exist in the DB', async () => {
    vi.mocked(assetRepository.getAssetById).mockResolvedValueOnce(null);

    await expect(streamThumbnail('nonexistent', mockS3)).rejects.toBeInstanceOf(NotFoundError);
  });
});
