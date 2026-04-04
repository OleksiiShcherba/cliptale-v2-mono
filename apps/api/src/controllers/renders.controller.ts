import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as renderService from '@/services/render.service.js';

/** Zod schema for POST /projects/:id/renders request body. */
export const createRenderSchema = z.object({
  versionId: z.number().int().positive(),
  presetKey: z.string().min(1),
});

type CreateRenderBody = z.infer<typeof createRenderSchema>;

/**
 * POST /projects/:id/renders
 *
 * Validates preset + version, enforces per-user concurrency limit, creates a
 * render job row, enqueues the BullMQ job, and writes a render.requested audit entry.
 *
 * Returns 202 `{ jobId, status: 'queued' }` on success.
 * Returns 400 on invalid preset, 404 on unknown version, 409 on concurrency limit.
 */
export async function createRender(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateRenderBody;
    const result = await renderService.createRender({
      projectId: req.params['id']!,
      versionId: body.versionId,
      requestedBy: req.user?.id ?? null,
      presetKey: body.presetKey,
    });
    res.status(202).json({ jobId: result.jobId, status: result.status });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /renders/:jobId
 *
 * Returns the current status and progress of a render job.
 * When complete, includes a presigned `downloadUrl`.
 *
 * Returns 200 `{ jobId, status, progressPct, downloadUrl? }` on success.
 * Returns 404 when the job does not exist.
 */
export async function getRenderStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const job = await renderService.getRenderStatus(req.params['jobId']!);
    res.status(200).json({
      jobId: job.jobId,
      projectId: job.projectId,
      versionId: job.versionId,
      status: job.status,
      progressPct: job.progressPct,
      preset: job.preset,
      outputUri: job.outputUri,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
      updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
      ...(job.downloadUrl ? { downloadUrl: job.downloadUrl } : {}),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /projects/:id/renders
 *
 * Returns all render jobs for a project, newest first.
 *
 * Returns 200 `{ renders: [...] }` on success.
 */
export async function listProjectRenders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const renders = await renderService.listProjectRenders(req.params['id']!);
    res.status(200).json({
      renders: renders.map((r) => ({
        jobId: r.jobId,
        projectId: r.projectId,
        versionId: r.versionId,
        status: r.status,
        progressPct: r.progressPct,
        preset: r.preset,
        outputUri: r.outputUri,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}
