import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as storyboardIllustrationService from '@/services/storyboardIllustration.service.js';

export const editPrincipalImageBodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  extraReferenceFileIds: z.array(z.string().uuid()).optional().default([]),
});

export const replacePrincipalImageBodySchema = z.object({
  fileId: z.string().uuid(),
});

export const setPrincipalImageReferencesBodySchema = z.object({
  fileIds: z.array(z.string().uuid()),
});

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

export async function approveStoryboardPrincipalImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await storyboardIllustrationService.approveStoryboardPrincipalImage(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function editStoryboardPrincipalImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof editPrincipalImageBodySchema>;
    const result = await storyboardIllustrationService.editStoryboardPrincipalImage({
      userId: req.user!.userId,
      draftId: req.params['draftId']!,
      prompt: body.prompt,
      extraReferenceFileIds: body.extraReferenceFileIds,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function replaceStoryboardPrincipalImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof replacePrincipalImageBodySchema>;
    const result = await storyboardIllustrationService.replaceStoryboardPrincipalImage(
      req.user!.userId,
      req.params['draftId']!,
      body.fileId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function setStoryboardPrincipalImageReferences(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof setPrincipalImageReferencesBodySchema>;
    const result = await storyboardIllustrationService.setStoryboardPrincipalImageReferences(
      req.user!.userId,
      req.params['draftId']!,
      body.fileIds,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
