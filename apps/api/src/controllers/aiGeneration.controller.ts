import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as aiGenerationService from '@/services/aiGeneration.service.js';
import * as voiceCatalogService from '@/services/voiceCatalog.service.js';
import { ValidationError } from '@/lib/errors.js';

/**
 * Zod schema for POST /projects/:id/ai/generate and POST /ai/generate.
 *
 * The Zod layer deliberately does NOT enumerate valid model ids — the service
 * validates `modelId` against the unified `AI_MODELS` catalog (fal + ElevenLabs)
 * and returns the specific error message. Here we only enforce the structural
 * shape.
 *
 * `projectId` is accepted but stripped (compat shim for Batch 1 → Batch 2
 * window). The FE editor currently sends it; the service no longer uses it.
 * Batch 2 Subtask 4 will remove the field from the FE payload.
 */
export const submitGenerationSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000).optional(),
  options: z.record(z.unknown()).default({}),
  // Compat shim: accept but discard projectId sent by the legacy FE panel.
  projectId: z.string().optional(),
});

/** POST /projects/:id/ai/generate — submit a generation request (project-scoped route, compat). */
export async function submitGeneration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof submitGenerationSchema>;
    // projectId is intentionally not forwarded to the service — jobs are now
    // user-scoped only. The route param :id is still used by aclMiddleware to
    // verify the caller is a project member; it is not stored in the job row.
    const { modelId, prompt, options } = body;
    const result = await aiGenerationService.submitGeneration(
      req.user!.userId,
      { modelId, prompt, options },
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

/** GET /ai/voices/available — returns all ElevenLabs library voices (Redis-cached, 1hr TTL). */
export async function listAvailableVoices(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const voices = await voiceCatalogService.listAvailableVoices();
    res.json(voices);
  } catch (err) {
    next(err);
  }
}

/** GET /ai/voices/:voiceId/sample?previewUrl=... — returns a presigned S3 URL for a voice sample. */
export async function getVoiceSample(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { voiceId } = req.params as { voiceId: string };
    const previewUrl = req.query['previewUrl'];

    if (typeof previewUrl !== 'string' || previewUrl.trim() === '') {
      throw new ValidationError('previewUrl query parameter is required');
    }

    const signedUrl = await voiceCatalogService.getVoiceSampleUrl(voiceId, previewUrl);
    res.json({ url: signedUrl });
  } catch (err) {
    next(err);
  }
}
