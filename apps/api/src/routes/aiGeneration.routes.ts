import { Router } from 'express';

import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { authMiddleware } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as aiGenerationController from '@/controllers/aiGeneration.controller.js';

const router = Router();

// GET /ai/models — static catalog metadata. auth-only (not project-scoped).
router.get('/ai/models', authMiddleware, aiGenerationController.listModels);

// GET /ai/voices — user's cloned voice library. auth-only (user-scoped, not project-scoped).
router.get('/ai/voices', authMiddleware, aiGenerationController.listVoices);

// GET /ai/voices/available — ElevenLabs library catalog (Redis-cached). auth-only.
// Registered before /ai/voices/:voiceId/sample to avoid the :voiceId param matching 'available'.
router.get('/ai/voices/available', authMiddleware, aiGenerationController.listAvailableVoices);

// GET /ai/voices/:voiceId/sample?previewUrl=... — presigned S3 URL for voice sample audio. auth-only.
router.get(
  '/ai/voices/:voiceId/sample',
  authMiddleware,
  aiGenerationController.getVoiceSample,
);

// POST /projects/:id/ai/generate — submit a generation request (202 Accepted).
router.post(
  '/projects/:id/ai/generate',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(aiGenerationController.submitGenerationSchema),
  aiGenerationController.submitGeneration,
);

// GET /ai/jobs/:jobId — poll job status.
router.get(
  '/ai/jobs/:jobId',
  authMiddleware,
  aiGenerationController.getJobStatus,
);

export { router as aiGenerationRouter };
