import type { Request, Response, NextFunction } from 'express';
import { storyboardMusicBlockSchema } from '@ai-video-editor/project-schema';

import * as storyboardMusicService from '@/services/storyboardMusic.service.js';

const editableMusicBlockSchema = storyboardMusicBlockSchema.pick({
  name: true,
  sourceMode: true,
  prompt: true,
  compositionPlan: true,
  existingFileId: true,
  startSceneBlockId: true,
  endSceneBlockId: true,
  positionX: true,
  positionY: true,
  sortOrder: true,
  volume: true,
  fadeInS: true,
  fadeOutS: true,
  loopMode: true,
});

export const updateStoryboardMusicBlockBodySchema = editableMusicBlockSchema.partial().strict();

export async function listStoryboardMusic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardMusicService.listStoryboardMusic(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateStoryboardMusicBlock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardMusicService.updateStoryboardMusicBlock({
      userId: req.user!.userId,
      draftId: req.params['draftId']!,
      musicBlockId: req.params['musicBlockId']!,
      patch: req.body,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function generateStoryboardMusicBlock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardMusicService.generateStoryboardMusicBlock({
      userId: req.user!.userId,
      draftId: req.params['draftId']!,
      musicBlockId: req.params['musicBlockId']!,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function generatePendingStoryboardMusic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardMusicService.generatePendingStoryboardMusic({
      userId: req.user!.userId,
      draftId: req.params['draftId']!,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}
