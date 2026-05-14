import type { Request, Response, NextFunction } from 'express';

import * as storyboardIllustrationService from '@/services/storyboardIllustration.service.js';

export async function startStoryboardIllustrations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardIllustrationService.startStoryboardIllustrations(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function startStoryboardBlockIllustration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardIllustrationService.startStoryboardBlockIllustration(
      req.user!.userId,
      req.params['draftId']!,
      req.params['blockId']!,
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listStoryboardIllustrations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardIllustrationService.listStoryboardIllustrations(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
