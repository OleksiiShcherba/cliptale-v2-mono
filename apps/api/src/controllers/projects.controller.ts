import type { Request, Response, NextFunction } from 'express';

import * as projectService from '@/services/project.service.js';

/**
 * POST /projects
 * Creates a new empty project and returns its UUID.
 * Called by the editor on first load when no projectId is present in the URL.
 */
export async function createProject(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await projectService.createProject();
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
