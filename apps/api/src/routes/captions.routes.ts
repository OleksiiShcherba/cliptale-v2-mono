import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import * as captionsController from '@/controllers/captions.controller.js';

const router = Router();

// POST /assets/:id/transcribe
// Enqueues a Whisper transcription job. Returns 202 { jobId }.
// Returns 409 if a caption track already exists for this asset.
router.post(
  '/assets/:id/transcribe',
  authMiddleware,
  aclMiddleware('editor'),
  captionsController.transcribeAsset,
);

// GET /assets/:id/captions
// Returns { segments: [{start, end, text}] } when transcription is complete.
// Returns 404 if no transcript exists yet.
router.get('/assets/:id/captions', authMiddleware, captionsController.getCaptions);

export { router as captionsRouter };
