import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as storyboardVideoService from '@/services/storyboardVideo.service.js';

export const startStoryboardVideosBodySchema = z.object({
  modelId: z.string().min(1),
  generateAudio: z.boolean().optional().default(false),
}).strict();

export async function startStoryboardVideos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof startStoryboardVideosBodySchema>;
    const result = await storyboardVideoService.startStoryboardVideos({
      userId: req.user!.userId,
      draftId: req.params['draftId']!,
      modelId: body.modelId,
      generateAudio: body.generateAudio,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listStoryboardVideos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardVideoService.listStoryboardVideos(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
