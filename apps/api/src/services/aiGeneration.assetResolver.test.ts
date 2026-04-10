/**
 * Unit tests for resolveAssetImageUrls — Epic 9 Ticket 6.
 *
 * Mocks for `asset.repository.getAssetById` and the AWS presigner are
 * registered in the colocated fixtures file. The real `FAL_MODELS` catalog is
 * imported so the tests exercise actual schema shapes rather than synthetic
 * mini-models.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { FAL_MODELS, type FalModel } from '@ai-video-editor/api-contracts';

import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors.js';

import {
  FIXED_PRESIGNED_URL,
  getAssetByIdMock,
  getSignedUrlMock,
  makeAssetRow,
  resetMocks,
  TEST_ASSET_ID,
  TEST_USER,
} from './aiGeneration.service.fixtures.js';

// Import after fixtures so the resolver binds to the mocked modules.
const { resolveAssetImageUrls } = await import('./aiGeneration.assetResolver.js');

beforeEach(() => {
  resetMocks();
});

function modelById(id: string): FalModel {
  const m = FAL_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`fixture drift: model ${id} not in catalog`);
  return m;
}

const LTX = 'fal-ai/ltx-2-19b/image-to-video';
const NANO_EDIT = 'fal-ai/nano-banana-2/edit';
const NANO_T2I = 'fal-ai/nano-banana-2';

// ── image_url passthrough + resolution ───────────────────────────────────────

describe('resolveAssetImageUrls / image_url field', () => {
  it('passes https URLs through unchanged (no repo / presigner calls)', async () => {
    const result = await resolveAssetImageUrls({
      model: modelById(LTX),
      options: {
        prompt: 'hello',
        image_url: 'https://cdn.example.com/foo.png',
      },
      userId: TEST_USER,
    });

    expect(result['image_url']).toBe('https://cdn.example.com/foo.png');
    expect(getAssetByIdMock).not.toHaveBeenCalled();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('resolves an asset id into a presigned URL using the fixture storage URI', async () => {
    getAssetByIdMock.mockResolvedValue(
      makeAssetRow({ storageUri: 's3://test-bucket/assets/foo.png' }),
    );

    const result = await resolveAssetImageUrls({
      model: modelById(LTX),
      options: { prompt: 'p', image_url: TEST_ASSET_ID },
      userId: TEST_USER,
    });

    expect(result['image_url']).toBe(FIXED_PRESIGNED_URL);

    expect(getAssetByIdMock).toHaveBeenCalledTimes(1);
    expect(getAssetByIdMock).toHaveBeenCalledWith(TEST_ASSET_ID);

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [, cmd, opts] = getSignedUrlMock.mock.calls[0]!;
    // GetObjectCommand stores the input on `.input` in the real SDK — reach
    // through both possible shapes so the assertion survives SDK upgrades.
    const input = (cmd as { input?: Record<string, unknown> }).input ?? cmd;
    expect(input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'assets/foo.png',
    });
    expect(opts).toEqual({ expiresIn: 3600 });
  });

  it('skips the field when it is undefined in options', async () => {
    const result = await resolveAssetImageUrls({
      model: modelById(LTX),
      options: { prompt: 'p', image_url: 'https://cdn.example.com/a.png' },
      userId: TEST_USER,
    });
    // `end_image_url` (optional image_url) is undefined — must not be added.
    expect(result['end_image_url']).toBeUndefined();
    expect(getAssetByIdMock).not.toHaveBeenCalled();
  });

  it('treats an uppercase HTTPS scheme as passthrough (case-insensitive)', async () => {
    const result = await resolveAssetImageUrls({
      model: modelById(LTX),
      options: { prompt: 'p', image_url: 'HTTPS://cdn.example.com/x.png' },
      userId: TEST_USER,
    });
    expect(result['image_url']).toBe('HTTPS://cdn.example.com/x.png');
    expect(getAssetByIdMock).not.toHaveBeenCalled();
  });
});

// ── image_url_list passthrough + resolution ──────────────────────────────────

describe('resolveAssetImageUrls / image_url_list field', () => {
  it('preserves order, replacing asset ids with presigned URLs and leaving https URLs untouched', async () => {
    const assetRow = makeAssetRow({
      storageUri: 's3://test-bucket/assets/bar.png',
    });
    getAssetByIdMock.mockResolvedValue(assetRow);
    getSignedUrlMock
      .mockReset()
      .mockResolvedValueOnce('https://s3.example.com/presigned-id-0');

    const result = await resolveAssetImageUrls({
      model: modelById(NANO_EDIT),
      options: {
        prompt: 'edit',
        image_urls: [TEST_ASSET_ID, 'https://cdn.example.com/untouched.png'],
      },
      userId: TEST_USER,
    });

    expect(result['image_urls']).toEqual([
      'https://s3.example.com/presigned-id-0',
      'https://cdn.example.com/untouched.png',
    ]);
    expect(getAssetByIdMock).toHaveBeenCalledTimes(1);
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('resolves every element when the entire list is asset ids', async () => {
    const ids = ['asset-a', 'asset-b', 'asset-c'];
    getAssetByIdMock
      .mockResolvedValueOnce(
        makeAssetRow({ assetId: 'asset-a', storageUri: 's3://b/a.png' }),
      )
      .mockResolvedValueOnce(
        makeAssetRow({ assetId: 'asset-b', storageUri: 's3://b/b.png' }),
      )
      .mockResolvedValueOnce(
        makeAssetRow({ assetId: 'asset-c', storageUri: 's3://b/c.png' }),
      );
    getSignedUrlMock
      .mockReset()
      .mockResolvedValueOnce('https://s3.example.com/a')
      .mockResolvedValueOnce('https://s3.example.com/b')
      .mockResolvedValueOnce('https://s3.example.com/c');

    const result = await resolveAssetImageUrls({
      model: modelById(NANO_EDIT),
      options: { prompt: 'p', image_urls: ids },
      userId: TEST_USER,
    });

    expect(result['image_urls']).toEqual([
      'https://s3.example.com/a',
      'https://s3.example.com/b',
      'https://s3.example.com/c',
    ]);
    expect(getAssetByIdMock).toHaveBeenCalledTimes(3);
    expect(getAssetByIdMock.mock.calls.map((c) => c[0])).toEqual(ids);
    expect(getSignedUrlMock).toHaveBeenCalledTimes(3);
  });

  it('throws ValidationError when image_url_list value is not an array', async () => {
    await expect(
      resolveAssetImageUrls({
        model: modelById(NANO_EDIT),
        options: { prompt: 'p', image_urls: 'not-an-array' },
        userId: TEST_USER,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      resolveAssetImageUrls({
        model: modelById(NANO_EDIT),
        options: { prompt: 'p', image_urls: 'not-an-array' },
        userId: TEST_USER,
      }),
    ).rejects.toThrow(/image_urls/);
  });
});

// ── ownership + existence errors ─────────────────────────────────────────────

describe('resolveAssetImageUrls / ownership + existence', () => {
  it('throws NotFoundError when the asset does not exist', async () => {
    getAssetByIdMock.mockResolvedValue(null);

    await expect(
      resolveAssetImageUrls({
        model: modelById(LTX),
        options: { prompt: 'p', image_url: 'missing-id' },
        userId: TEST_USER,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      resolveAssetImageUrls({
        model: modelById(LTX),
        options: { prompt: 'p', image_url: 'missing-id' },
        userId: TEST_USER,
      }),
    ).rejects.toThrow(/missing-id/);
  });

  it('throws ForbiddenError when the asset belongs to another user', async () => {
    getAssetByIdMock.mockResolvedValue(
      makeAssetRow({ userId: 'other-user-xyz' }),
    );

    await expect(
      resolveAssetImageUrls({
        model: modelById(LTX),
        options: { prompt: 'p', image_url: TEST_ASSET_ID },
        userId: TEST_USER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      resolveAssetImageUrls({
        model: modelById(LTX),
        options: { prompt: 'p', image_url: TEST_ASSET_ID },
        userId: TEST_USER,
      }),
    ).rejects.toThrow(new RegExp(TEST_ASSET_ID));
  });
});

// ── no-image-field models (pure no-op) ───────────────────────────────────────

describe('resolveAssetImageUrls / no-image-field models', () => {
  it('is a pure no-op for a text-to-image model (no repo / presigner calls)', async () => {
    const input = { prompt: 'sunrise' };
    const result = await resolveAssetImageUrls({
      model: modelById(NANO_T2I),
      options: input,
      userId: TEST_USER,
    });
    expect(result).toEqual(input);
    expect(getAssetByIdMock).not.toHaveBeenCalled();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });
});
