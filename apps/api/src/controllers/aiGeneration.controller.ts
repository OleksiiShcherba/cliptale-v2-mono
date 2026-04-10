import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as aiGenerationService from '@/services/aiGeneration.service.js';

/**
 * Zod schema for POST /projects/:id/ai/generate.
 *
 * The Zod layer deliberately does NOT enumerate valid model ids — the service
 * validates `modelId` against the unified `AI_MODELS` catalog (fal + ElevenLabs) and returns the
 * specific error message. Here we only enforce the structural shape.
 */
export const submitGenerationSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000).optional(),
  options: z.record(z.unknown()).default({}),
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

/** GET /ai/voices — returns the authenticated user's cloned voice library. */
export async function listVoices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const voices = await aiGenerationService.listUserVoices(req.user!.userId);
    res.json(voices);
  } catch (err) {
    next(err);
  }
}

/** GET /ai/models — returns the static AI model catalog (fal + ElevenLabs) grouped by capability. */
export function listModels(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const result = aiGenerationService.listModels();
    res.json(result);
  } catch (err) {
    next(err);
  }
}
