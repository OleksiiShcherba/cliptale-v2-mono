import type { Request, Response, NextFunction } from 'express';

import * as captionService from '@/services/caption.service.js';

/**
 * POST /assets/:id/transcribe
 * Enqueues a Whisper transcription job for the asset.
 * Returns 202 Accepted with { jobId } on success.
 * Returns 409 if a caption track for this asset already exists.
 */
export async function transcribeAsset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await captionService.transcribeAsset(req.params['id']!);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /assets/:id/captions
 * Returns the transcript segments for an asset.
 * Returns 404 if no caption track exists yet (transcription not yet complete).
 */
export async function getCaptions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await captionService.getCaptions(req.params['id']!);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
