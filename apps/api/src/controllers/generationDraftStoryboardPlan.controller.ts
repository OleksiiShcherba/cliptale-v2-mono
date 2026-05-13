import type { Request, Response, NextFunction } from 'express';

import * as storyboardPlanService from '@/services/generationDraft.storyboardPlan.service.js';

export async function startStoryboardPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardPlanService.startStoryboardPlan(
      req.user!.userId,
      req.params['id']!,
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getStoryboardPlanStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardPlanService.getStoryboardPlanStatus(
      req.user!.userId,
      req.params['id']!,
      req.params['jobId']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
