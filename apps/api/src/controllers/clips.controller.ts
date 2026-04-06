import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as clipService from '@/services/clip.service.js';

/**
 * Zod schema for POST /projects/:id/clips request body.
 */
export const createClipSchema = z.object({
  clipId: z.string().uuid(),
  trackId: z.string().uuid(),
  type: z.enum(['video', 'audio', 'text-overlay', 'image']),
  assetId: z.string().uuid().nullable().optional(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  trimInFrames: z.number().int().nonnegative().optional(),
  trimOutFrames: z.number().int().nonnegative().nullable().optional(),
  layer: z.number().int().nonnegative().optional(),
});

type CreateClipBody = z.infer<typeof createClipSchema>;

/**
 * POST /projects/:id/clips
 *
 * Inserts a new clip into project_clips_current.
 * Returns 201 on success.
 */
export async function createClip(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateClipBody;
    await clipService.createClip({
      clipId: body.clipId,
      projectId: req.params['id']!,
      trackId: body.trackId,
      type: body.type,
      assetId: body.assetId ?? null,
      startFrame: body.startFrame,
      durationFrames: body.durationFrames,
      trimInFrames: body.trimInFrames,
      trimOutFrames: body.trimOutFrames,
      layer: body.layer,
    });
    res.status(201).json({ clipId: body.clipId });
  } catch (err) {
    next(err);
  }
}

/**
 * Zod schema for PATCH /projects/:id/clips/:clipId request body.
 * All fields are optional — at least one must be present (enforced by `.refine`).
 */
export const patchClipSchema = z
  .object({
    trackId: z.string().uuid().optional(),
    startFrame: z.number().int().nonnegative().optional(),
    durationFrames: z.number().int().positive().optional(),
    trimInFrames: z.number().int().nonnegative().optional(),
    trimOutFrames: z.number().int().nonnegative().nullable().optional(),
    transform: z.record(z.unknown()).nullable().optional(),
  })
  .refine(
    (body) =>
      body.trackId !== undefined ||
      body.startFrame !== undefined ||
      body.durationFrames !== undefined ||
      body.trimInFrames !== undefined ||
      'trimOutFrames' in body ||
      'transform' in body,
    { message: 'At least one field must be provided' },
  );

type PatchClipBody = z.infer<typeof patchClipSchema>;

/**
 * PATCH /projects/:id/clips/:clipId
 *
 * Partially updates mutable timeline fields of a single clip.
 * Returns 200 with the updated clip fields on success.
 */
export async function patchClip(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as PatchClipBody;
    const result = await clipService.patchClip({
      projectId: req.params['id']!,
      clipId: req.params['clipId']!,
      requestingUserId: req.user?.id ?? null,
      // projectOwnerId is not yet available from the projects table; ACL middleware
      // handles ownership. Pass null here so the service's defence check is skipped.
      projectOwnerId: null,
      patch: {
        trackId: body.trackId,
        startFrame: body.startFrame,
        durationFrames: body.durationFrames,
        trimInFrames: body.trimInFrames,
        ...(('trimOutFrames' in body) ? { trimOutFrames: body.trimOutFrames } : {}),
        ...(('transform' in body) ? { transform: body.transform } : {}),
      },
    });

    res.status(200).json({
      clipId: result.clipId,
      startFrame: result.startFrame,
      durationFrames: result.durationFrames,
      trimInFrames: result.trimInFrames,
      trimOutFrames: result.trimOutFrames,
      transform: result.transform,
      updatedAt: result.updatedAt instanceof Date
        ? result.updatedAt.toISOString()
        : result.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}
