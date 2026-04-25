import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as fileController from '@/controllers/file.controller.js';

const router = Router();

// POST /files/upload-url
// Issues a presigned S3 PUT URL and inserts a `pending` row in `files`.
// Must be registered BEFORE /files/:id routes to avoid mis-routing.
router.post(
  '/files/upload-url',
  authMiddleware,
  validateBody(fileController.createUploadUrlSchema),
  fileController.createUploadUrl,
);

// GET /files
// Returns the authenticated user's `ready` files, cursor-paginated.
// Registered BEFORE /files/:id so Express does not match this route as an id.
router.get('/files', authMiddleware, fileController.listFiles);

// GET /files/:id/stream
// Returns a presigned GET URL for the file, verifying caller ownership.
router.get('/files/:id/stream', authMiddleware, fileController.streamFile);

// POST /files/:id/finalize
// Called after the XHR PUT to S3 completes. Transitions pending → processing
// and enqueues the media-ingest job.
router.post('/files/:id/finalize', authMiddleware, fileController.finalizeFile);

export { router as fileRouter };
