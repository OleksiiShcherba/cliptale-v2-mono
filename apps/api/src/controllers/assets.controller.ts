import type { Request, Response, NextFunction } from 'express';

import { config } from '@/config.js';
import { ValidationError } from '@/lib/errors.js';
import { s3Client } from '@/lib/s3.js';
import * as assetService from '@/services/asset.service.js';
import * as assetListService from '@/services/asset.list.service.js';
import * as assetResponseService from '@/services/asset.response.service.js';
import * as fileLinksResponseService from '@/services/fileLinks.response.service.js';
import {
  createUploadUrlSchema,
  listAssetsQuerySchema,
  projectAssetsQuerySchema,
} from '@/controllers/assets.controller.schemas.js';

// Re-export schemas so route files can access them via the controller namespace import.
export {
  createUploadUrlSchema,
  patchAssetSchema,
  listAssetsQuerySchema,
  projectAssetsQuerySchema,
} from '@/controllers/assets.controller.schemas.js';

type CreateUploadUrlBody = {
  filename: string;
  contentType: string;
  fileSizeBytes: number;
};

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
 * Returns a paginated envelope `{ items, nextCursor, totals }` for project files.
 * `?scope=project` (default) — linked only; `?scope=all` — full library.
 * `?limit=<1..100>` (default 24); `?cursor=<opaque>` for page-forward navigation.
 */
export async function getProjectAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = projectAssetsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid query parameters: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const page = await fileLinksResponseService.getProjectAssetsPage({
      projectId: req.params['id']!,
      scope: parsed.data.scope,
      userId: req.user!.userId,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
      s3: s3Client,
      baseUrl,
    });
    res.json(page);
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
 * POST /assets/:id/restore
 * Restores a soft-deleted asset owned by the authenticated user.
 * Returns 200 with the restored asset on success.
 * Returns 404 when the asset belongs to another user, 410 when gone/TTL expired.
 */
export async function restoreAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileId = req.params['id']!;
    // restoreAsset returns the fresh Asset row (re-fetched after restore).
    await assetService.restoreAsset(fileId, req.user!.userId);
    // Serialize via the response service to include presigned URL + thumbnail proxy.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const response = await assetResponseService.getAssetResponse(fileId, s3Client, baseUrl);
    res.json(response);
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
