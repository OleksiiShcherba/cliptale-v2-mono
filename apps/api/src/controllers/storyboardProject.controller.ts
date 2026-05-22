import type { Request, Response, NextFunction } from 'express';

import * as storyboardProjectService from '@/services/storyboardProject.service.js';

export async function createProjectFromStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardProjectService.createProjectFromStoryboard(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

