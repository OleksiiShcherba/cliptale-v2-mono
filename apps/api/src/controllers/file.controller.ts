import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { config } from '@/config.js';
import { ValidationError } from '@/lib/errors.js';
import { s3Client } from '@/lib/s3.js';
import * as fileService from '@/services/file.service.js';

// ── Request schemas ───────────────────────────────────────────────────────────

/** Zod schema for `POST /files/upload-url` body. Exported for route middleware. */
export const createUploadUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

/** Zod schema for `GET /files` query string. Exported for documentation / tests. */
export const listFilesQuerySchema = z.object({
  type: z.enum(['video', 'image', 'audio', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

type CreateUploadUrlBody = z.infer<typeof createUploadUrlSchema>;

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /files/upload-url
 *
 * Issues a presigned S3 PUT URL and inserts a `pending` row in `files`.
 * Body is pre-validated by `validateBody(createUploadUrlSchema)` in the route.
 */
export async function createUploadUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateUploadUrlBody;
    const result = await fileService.createUploadUrl(
      {
        userId: req.user!.userId,
        filename: body.filename,
        mimeType: body.mimeType,
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
 * POST /files/:id/finalize
 *
 * Confirms the upload landed in S3, transitions `pending` → `processing`,
 * and enqueues the `media-ingest` job. Idempotent.
 */
export async function finalizeFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = await fileService.finalizeFile(
      req.params['id']!,
      req.user!.userId,
      s3Client,
    );
    res.json(file);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /files
 *
 * Returns the authenticated user's `ready` files, cursor-paginated.
 * Query string is parsed inline via `listFilesQuerySchema`.
 */
export async function listFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = listFilesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid query parameters: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const result = await fileService.listFiles({
      userId: req.user!.userId,
      type: parsed.data.type,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /files/:id/stream
 *
 * Returns a short-lived presigned GET URL for the file, verifying caller ownership.
 */
export async function streamFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const url = await fileService.streamUrl(
      req.params['id']!,
      req.user!.userId,
      s3Client,
    );
    res.json({ url });
  } catch (err) {
    next(err);
  }
}
