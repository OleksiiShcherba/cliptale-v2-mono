import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { config } from '@/config.js';
import { ValidationError } from '@/lib/errors.js';
import { s3Client } from '@/lib/s3.js';
import * as assetService from '@/services/asset.service.js';
import * as assetListService from '@/services/asset.list.service.js';
import * as assetResponseService from '@/services/asset.response.service.js';
import * as fileLinksResponseService from '@/services/fileLinks.response.service.js';

/** Zod schema for the POST /assets/upload-url request body. Exported for use in route middleware. */
export const createUploadUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

/** Zod schema for the PATCH /assets/:id request body. Exported for use in route middleware. */
export const patchAssetSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

/**
 * Zod schema for the GET /assets query string — validates the `type`, `cursor`,
 * and `limit` query params used by the wizard gallery endpoint. Parsed inline
 * in the `listAssets` handler because `validateBody` only runs on `req.body`.
 */
export const listAssetsQuerySchema = z.object({
  type: z.enum(['video', 'image', 'audio', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
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
        userId: req.user!.userId,
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

/**
 * GET /assets — returns the authenticated user's `ready` assets for the
 * wizard gallery. Query string is parsed inline via `listAssetsQuerySchema`
 * and maps Zod errors to a 400 `ValidationError`.
 */
export async function listAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = listAssetsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid query parameters: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await assetListService.listForUser({
      userId: req.user!.userId,
      type: parsed.data.type,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
      baseUrl,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /projects/:id/assets
 * Returns all files linked to a project via the `project_files` pivot table,
 * serialized as an `AssetApiResponse[]` array.
 *
 * The underlying SQL changed from reading `project_assets_current` to
 * JOIN-ing `project_files → files`, but the HTTP response shape is identical
 * to preserve the FE contract.
 */
export async function getProjectAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const assets = await fileLinksResponseService.getProjectFilesResponse(
      req.params['id']!,
      s3Client,
      baseUrl,
    );
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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const asset = await assetResponseService.getAssetResponse(req.params['id']!, s3Client, baseUrl);
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
    await assetService.deleteAsset(req.params['id']!, req.user!.userId);
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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const asset = await assetResponseService.finalizeAssetResponse(req.params['id']!, s3Client, baseUrl);
    res.json(asset);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /assets/:id/thumbnail
 * Proxies the asset's thumbnail image from S3 to the browser.
 * Returns 404 when the asset has no thumbnail (not yet processed or an audio file).
 */
export async function thumbnailAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await assetResponseService.streamThumbnail(req.params['id']!, s3Client);

    if (!result) {
      res.status(404).end();
      return;
    }

    if (result.contentType) res.setHeader('Content-Type', result.contentType);
    if (result.contentLength !== undefined) res.setHeader('Content-Length', String(result.contentLength));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Required for browser <img> elements making cross-origin requests (frontend :5173, API :3001).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200);
    result.body.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /assets/:id
 * Sets the display name of an asset. The authenticated caller must own the asset.
 * Body is pre-validated by `validateBody(patchAssetSchema)` in the route.
 * Returns the updated asset as an `AssetApiResponse`.
 */
export async function patchAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { name } = req.body as { name: string };
    await assetService.renameAsset(req.params['id']!, req.user!.userId, name);
    const asset = await assetResponseService.getAssetResponse(req.params['id']!, s3Client, baseUrl);
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
