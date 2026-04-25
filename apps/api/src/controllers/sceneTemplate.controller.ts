import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as sceneTemplateService from '@/services/sceneTemplate.service.js';

// ── Request body schemas ──────────────────────────────────────────────────────

const mediaItemSchema = z.object({
  fileId: z.string().uuid(),
  mediaType: z.enum(['image', 'video', 'audio']),
  sortOrder: z.number().int().min(0),
});

export const createTemplateBodySchema = z.object({
  name: z.string().min(1).max(255),
  prompt: z.string().min(1),
  durationS: z.number().int().min(1).max(180),
  style: z.string().max(64).nullable().optional().transform((v) => v ?? null),
  mediaItems: z.array(mediaItemSchema).max(6).optional().transform((v) => v ?? []),
});

export const updateTemplateBodySchema = createTemplateBodySchema;

export const addToStoryboardBodySchema = z.object({
  draftId: z.string().uuid(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

// ── Controller handlers ───────────────────────────────────────────────────────

/**
 * GET /scene-templates
 * Returns { items: SceneTemplate[] } for the authenticated user.
 */
export async function listTemplates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await sceneTemplateService.listTemplates(req.user!.userId);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /scene-templates/:id
 * Returns the template if owned by the authenticated user, 404 otherwise.
 */
export async function getTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const template = await sceneTemplateService.getTemplate(
      req.user!.userId,
      req.params['id']!,
    );
    res.json(template);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /scene-templates
 * Creates a scene template. Body is pre-validated by validateBody(createTemplateBodySchema).
 * Returns 201 with the newly created template.
 */
export async function createTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof createTemplateBodySchema>;
    const template = await sceneTemplateService.createTemplate(req.user!.userId, {
      name: body.name,
      prompt: body.prompt,
      durationS: body.durationS,
      style: body.style ?? null,
      mediaItems: body.mediaItems ?? [],
    });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /scene-templates/:id
 * Updates fields + replaces media list. Body pre-validated by validateBody(updateTemplateBodySchema).
 * Returns 200 with the updated template.
 */
export async function updateTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof updateTemplateBodySchema>;
    const template = await sceneTemplateService.updateTemplate(
      req.user!.userId,
      req.params['id']!,
      {
        name: body.name,
        prompt: body.prompt,
        durationS: body.durationS,
        style: body.style ?? null,
        mediaItems: body.mediaItems ?? [],
      },
    );
    res.json(template);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /scene-templates/:id
 * Soft-deletes the template. Returns 204 on success.
 */
export async function deleteTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await sceneTemplateService.deleteTemplate(req.user!.userId, req.params['id']!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /scene-templates/:id/add-to-storyboard
 * Creates a new storyboard block from the template and appends it to the given draft.
 * Body is pre-validated by validateBody(addToStoryboardBodySchema).
 * Returns 201 with the new StoryboardBlock.
 */
export async function addToStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof addToStoryboardBodySchema>;
    const block = await sceneTemplateService.addTemplateToStoryboard(
      req.user!.userId,
      req.params['id']!,
      body.draftId,
      body.positionX,
      body.positionY,
    );
    res.status(201).json(block);
  } catch (err) {
    next(err);
  }
}
