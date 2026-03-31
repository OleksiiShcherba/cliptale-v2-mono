import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as assetsController from '@/controllers/assets.controller.js';

const router = Router();

// POST /projects/:id/assets/upload-url
// Returns a presigned S3 PUT URL and inserts a pending asset row.
router.post(
  '/projects/:id/assets/upload-url',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(assetsController.createUploadUrlSchema),
  assetsController.createUploadUrl,
);

// GET /assets/:id
// Returns the current state of an asset — used by the FE polling hook.
router.get('/assets/:id', authMiddleware, assetsController.getAsset);

// POST /assets/:id/finalize
// Called by the client after the XHR PUT to S3 completes.
// Verifies storage, transitions pending → processing, enqueues media-ingest job.
router.post(
  '/assets/:id/finalize',
  authMiddleware,
  aclMiddleware('editor'),
  assetsController.finalizeAsset,
);

export { router as assetsRouter };
