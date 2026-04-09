import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as aiProviderService from '@/services/aiProvider.service.js';
import { ValidationError } from '@/lib/errors.js';

/** Valid provider values — kept in sync with the DB ENUM. */
const PROVIDERS = [
  'openai',
  'runway',
  'stability_ai',
  'elevenlabs',
  'kling',
  'pika',
  'suno',
  'replicate',
] as const;

/** Zod schema for POST /user/ai-providers. Exported for route-level validation. */
export const addProviderSchema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().min(1),
});

/** Zod schema for PATCH /user/ai-providers/:provider. */
export const updateProviderSchema = z.object({
  apiKey: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

/** Validates the :provider route param against the ENUM. */
const providerParamSchema = z.enum(PROVIDERS);

/** Parses :provider param safely, throwing ValidationError instead of raw ZodError. */
function parseProviderParam(value: unknown): z.infer<typeof providerParamSchema> {
  const result = providerParamSchema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid provider: ${String(value)}`);
  }
  return result.data;
}

/** POST /user/ai-providers */
export async function addProvider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof addProviderSchema>;
    await aiProviderService.addProvider(req.user!.userId, body.provider, body.apiKey);
    res.status(201).json({ message: 'Provider added' });
  } catch (err) {
    next(err);
  }
}

/** GET /user/ai-providers */
export async function listProviders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const providers = await aiProviderService.listProviders(req.user!.userId);
    res.json(providers);
  } catch (err) {
    next(err);
  }
}

/** PATCH /user/ai-providers/:provider */
export async function updateProvider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const provider = parseProviderParam(req.params['provider']);
    const body = req.body as z.infer<typeof updateProviderSchema>;
    await aiProviderService.updateProvider(req.user!.userId, provider, body);
    res.json({ message: 'Provider updated' });
  } catch (err) {
    next(err);
  }
}

/** DELETE /user/ai-providers/:provider */
export async function deleteProvider(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const provider = parseProviderParam(req.params['provider']);
    await aiProviderService.deleteProvider(req.user!.userId, provider);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
