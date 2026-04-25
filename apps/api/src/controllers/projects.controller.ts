import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { s3Client } from '@/lib/s3.js';
import * as projectService from '@/services/project.service.js';
import * as projectRestoreService from '@/services/project.restore.service.js';
import * as fileLinksService from '@/services/fileLinks.service.js';
import * as fileLinksResponseService from '@/services/fileLinks.response.service.js';

/** Zod schema for POST /projects/:projectId/files body. Exported for route middleware. */
export const linkFileToProjectSchema = z.object({
  fileId: z.string().uuid(),
});

/**
 * GET /projects
 * Returns all projects owned by the authenticated user, sorted by updated_at DESC.
 * Each project includes a derived thumbnailUrl from the earliest visual clip.
 *
 * thumbnailUrl is either a proxy URL (`${baseUrl}/assets/:fileId/thumbnail`) when
 * a thumbnail exists, or null when no visual file has been ingested yet.
 */
export async function listProjects(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const summaries = await projectService.listForUser(userId);

    const items = summaries.map((s) => ({
      projectId: s.projectId,
      title: s.title,
      updatedAt: s.updatedAt,
      // Build proxy URL only when thumbnail_uri is non-null (i.e. the ingest worker
      // has generated a thumbnail for this file). If the file exists but has no
      // thumbnail yet, thumbnailFileId is set but thumbnailUrl is null — return null
      // so the frontend renders its placeholder.
      thumbnailUrl:
        s.thumbnailFileId !== null && s.thumbnailUrl !== null
          ? `${baseUrl}/assets/${s.thumbnailFileId}/thumbnail`
          : null,
    }));

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /projects
 * Creates a new empty project owned by the authenticated user.
 * Accepts an optional `title` in the request body — defaults to 'Untitled project'.
 * Returns { projectId } with status 201.
 */
export async function createProject(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const result = await projectService.createProject(userId, title);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /projects/:id
 * Soft-deletes the project owned by the authenticated user.
 * Returns 204 No Content on success; 404 when not found or owned by another user.
 */
export async function deleteProject(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const projectId = req.params['id']!;
    await projectService.softDeleteProject(userId, projectId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /projects/:id/restore
 * Restores a soft-deleted project owned by the authenticated user.
 * Returns 200 with the restored project on success.
 * Returns 404 (not owner), 410 (gone / TTL expired).
 */
export async function restoreProject(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const projectId = req.params['id']!;
    const project = await projectRestoreService.restoreProject(userId, projectId);
    res.json(project);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /projects/:projectId/files
 * Links a file (by `fileId`) to a project. Both the project and the file must
 * be owned by the authenticated user. Double-link is idempotent — if the pair
 * already exists, returns 204 No Content (same as a fresh link).
 * Body is pre-validated by validateBody(linkFileToProjectSchema) in the route.
 */
export async function linkFileToProject(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const projectId = req.params['projectId']!;
    const { fileId } = req.body as z.infer<typeof linkFileToProjectSchema>;

    await fileLinksService.linkFileToProject(userId, projectId, fileId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
