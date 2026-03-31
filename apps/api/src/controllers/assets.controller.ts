import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { config } from '@/config.js';
import { s3Client } from '@/lib/s3.js';
import * as assetService from '@/services/asset.service.js';

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

/** GET /assets/:id — returns the current asset record; used by the FE polling hook. */
export async function getAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const asset = await assetService.getAsset(req.params['id']!);
    res.json(asset);
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
    res.json(asset);
  } catch (err) {
    next(err);
  }
}
