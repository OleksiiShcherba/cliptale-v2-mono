import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as storyboardProjectService from '@/services/storyboardProject.service.js';

export const createProjectFromStoryboardBodySchema = z.object({
  mode: z.enum(['images', 'videos']).optional().default('images'),
}).strict();

export async function createProjectFromStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof createProjectFromStoryboardBodySchema>;
    const result = await storyboardProjectService.createProjectFromStoryboard(
      req.user!.userId,
      req.params['draftId']!,
      body.mode,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
