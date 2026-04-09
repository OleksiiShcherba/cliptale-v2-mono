import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as aiGenerationController from '@/controllers/aiGeneration.controller.js';

const router = Router();

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
