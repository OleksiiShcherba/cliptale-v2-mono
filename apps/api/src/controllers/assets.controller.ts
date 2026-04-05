import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import * as assetService from '@/services/asset.service.js';
import * as assetResponseService from '@/services/asset.response.service.js';

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
    const assets = await assetResponseService.getProjectAssetsResponse(req.params['id']!, s3Client);
    res.json(assets);
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
    const asset = await assetResponseService.getAssetResponse(req.params['id']!, s3Client);
    res.json(asset);
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
    const asset = await assetResponseService.finalizeAssetResponse(req.params['id']!, s3Client);
    res.json(asset);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /assets/:id/stream
 * Proxies the S3 object binary to the browser. The raw s3:// URI is never
 * exposed to the client. Forwards the browser's Range header to S3 so that
 * video seeking (byte-range requests) works correctly.
 */
export async function streamAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rangeHeader = req.headers['range'];
    const result = await assetResponseService.streamAsset(
      req.params['id']!,
      typeof rangeHeader === 'string' ? rangeHeader : undefined,
      s3Client,
    );

    if (!result) {
      res.status(204).end();
      return;
    }

    if (result.contentType) res.setHeader('Content-Type', result.contentType);
    if (result.contentLength !== undefined) res.setHeader('Content-Length', String(result.contentLength));
    if (result.contentRange) res.setHeader('Content-Range', result.contentRange);
    res.setHeader('Accept-Ranges', 'bytes');
    // Required for browser video elements making no-cors cross-origin requests (e.g. Remotion player).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.status(result.isPartialContent ? 206 : 200);
    result.body.pipe(res);
  } catch (err) {
    next(err);
  }
}
