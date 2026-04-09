import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as aiGenerationService from '@/services/aiGeneration.service.js';

const PROVIDERS = [
  'openai', 'runway', 'stability_ai', 'elevenlabs',
  'kling', 'pika', 'suno', 'replicate',
] as const;

/** Zod schema for POST /projects/:id/ai/generate. Exported for route-level validation. */
export const submitGenerationSchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'text']),
  prompt: z.string().min(1).max(4000),
  options: z.record(z.unknown()).optional(),
  provider: z.enum(PROVIDERS).optional(),
});

/** POST /projects/:id/ai/generate — submit a generation request. */
export async function submitGeneration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof submitGenerationSchema>;
    const result = await aiGenerationService.submitGeneration(
      req.user!.userId,
      req.params['id']!,
      body,
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /ai/jobs/:jobId — check status of a generation job. */
export async function getJobStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await aiGenerationService.getJobStatus(
      req.params['jobId']!,
      req.user!.userId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
