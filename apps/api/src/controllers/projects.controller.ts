import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { s3Client } from '@/lib/s3.js';
import * as projectService from '@/services/project.service.js';
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
 */
export async function listProjects(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const items = await projectService.listForUser(userId);
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
