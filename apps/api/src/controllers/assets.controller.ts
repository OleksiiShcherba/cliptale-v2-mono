import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import * as assetService from '@/services/asset.service.js';
import type { Asset as RepositoryAsset } from '@/repositories/asset.repository.js';

/** Presigned GET URL validity — 1 hour is enough for a playback session. */
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;

/** Parses a `s3://bucket/key` URI into bucket + key parts. */
function parseS3Uri(s3Uri: string): { bucket: string; key: string } {
  const withoutScheme = s3Uri.slice(5); // remove "s3://"
  const slashIndex = withoutScheme.indexOf('/');
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

/**
 * Returns a presigned HTTPS GET URL for an s3:// URI.
 * Falls back to a plain public URL when signing fails (e.g. missing credentials in tests).
 */
async function presignS3Uri(s3Uri: string, s3: S3Client): Promise<string> {
  const { bucket, key } = parseS3Uri(s3Uri);
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS },
  );
}

/** Converts an internal s3:// URI to a public HTTPS URL (for thumbnails served from public bucket). */
function s3UriToHttps(s3Uri: string | null): string | null {
  if (!s3Uri || !s3Uri.startsWith('s3://')) return s3Uri;
  const { bucket, key } = parseS3Uri(s3Uri);
  if (config.s3.endpoint) {
    return `${config.s3.endpoint}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
}

/**
 * Maps the internal repository Asset shape to the API response shape the frontend expects.
 * storageUri is replaced with a presigned GET URL so the browser can stream the file directly.
 */
async function serializeAsset(asset: RepositoryAsset, s3: S3Client) {
  const storageUri = await presignS3Uri(asset.storageUri, s3);
  return {
    id: asset.assetId,
    projectId: asset.projectId,
    filename: asset.filename,
    contentType: asset.contentType,
    storageUri,
    status: asset.status,
    durationSeconds:
      asset.durationFrames != null && asset.fps != null
        ? asset.durationFrames / asset.fps
        : null,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSizeBytes,
    thumbnailUri: s3UriToHttps(asset.thumbnailUri),
    waveformPeaks: asset.waveformJson as number[] | null,
    createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
    updatedAt: asset.updatedAt instanceof Date ? asset.updatedAt.toISOString() : asset.updatedAt,
  };
}

/** Zod schema for the POST /assets/upload-url request body. Exported for use in route middleware. */
export const createUploadUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

type CreateUploadUrlBody = z.infer<typeof createUploadUrlSchema>;

/**
 * POST /projects/:id/assets/upload-url
 * Body is pre-validated by `validateBody(createUploadUrlSchema)` in the route.
 */
export async function createUploadUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateUploadUrlBody;
    const result = await assetService.createUploadUrl(
      {
        projectId: req.params['id']!,
        userId: req.user!.id,
        filename: body.filename,
        contentType: body.contentType,
        fileSizeBytes: body.fileSizeBytes,
      },
      s3Client,
      config.s3.bucket,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /projects/:id/assets — returns all assets for a project as a JSON array. */
export async function getProjectAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const assets = await assetService.getProjectAssets(req.params['id']!);
    res.json(await Promise.all(assets.map((a) => serializeAsset(a, s3Client))));
  } catch (err) {
    next(err);
  }
}

/** GET /assets/:id — returns the current asset record; used by the FE polling hook. */
export async function getAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const asset = await assetService.getAsset(req.params['id']!);
    res.json(await serializeAsset(asset, s3Client));
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /assets/:id
 * Deletes the asset if it exists, belongs to the authenticated user, and is not
 * referenced by any clip. Returns 204 No Content on success.
 */
export async function deleteAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await assetService.deleteAsset(req.params['id']!, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /assets/:id/finalize
 * Verifies the upload landed in storage, transitions status to `processing`,
 * and enqueues the `media-ingest` job. Idempotent if already processing/ready.
 */
export async function finalizeAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const asset = await assetService.finalizeAsset(req.params['id']!, s3Client);
    res.json(await serializeAsset(asset, s3Client));
  } catch (err) {
    next(err);
  }
}
